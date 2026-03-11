import { expect } from 'chai';

import * as ndidApi from '../../../api/v7/ndid';
import * as yourDataRpApi from '../../../api/v7/yourdata/rp';
import * as yourDataAsApi from '../../../api/v7/yourdata/as';
import * as yourDataUtilityApi from '../../../api/v7/yourdata/utility';
import { rpEventEmitter, as1EventEmitter } from '../../../callback_server';
import * as db from '../../../db';
import { createEventPromise, generateReferenceId } from '../../../utils';
import { randomNumber, randomString } from '../../../utils/random';
import yourDataRequestStatus from './request_status';
import { waitUntilBlockHeightMatch } from '../../../tendermint';
import * as config from '../../../config';

describe('Error response', function () {
  const rpNodeId = 'rp1';
  const asNodeId = 'as1';

  const serviceId = `test_service_${randomString(8)}`;

  let namespace;
  let identifier;

  let authorizationToken;

  before(async function () {
    this.timeout(10000);

    const identity = db.idp1Identities.find((identity) => identity.mode === 2);
    namespace = identity.namespace;
    identifier = identity.identifier;

    let response;
    let responseBody;

    // ensure YourData AS service register
    response = await yourDataAsApi.addOrUpdateService(asNodeId, {
      serviceId,
      service_url: config.AS1_CALLBACK_URL,
      supported_namespace_list: ['citizen_id'],
      supported_authorization: [
        // 'no_token_needed',
        'token_one_time',
        'token_continuous_with_expire',
        // 'token_continuous_no_expire',
      ],
      // service_availability: true,
    });
    if (!response.ok) {
      throw new Error('error adding or updating YourData AS service');
    }

    const authorizationTokenPayload = {
      requester_node_id: 'rp1',
      as_node_id: 'as1',
      namespace,
      identifier,
      token_objective: 'some_string',
      sub_identity_list: [
        {
          namespace: 'account_no',
          idenfifier: '123-45678-90',
          visible_identifier: '123-45XXX-XX',
          identifier_extension: '{account_type:savings}',
        },
      ],
      service_id_list: [
        {
          service_id: serviceId,
          service_version: 'v1',
          service_extension: ['test'],
        },
      ],
      validate_identifier: true,
      validate_service_id: true,
      validate_service_extension: false,
      usage_type: 'one_time',
      expiration_datetime: Math.floor(Date.now() / 1000) + 1 * 24 * 60 * 60, // + 1 day
      source_request_id_list: ['SOME_REQUEST_ID'],
    };

    response = await yourDataUtilityApi.createSignedAuthorizationToken(
      'as1',
      authorizationTokenPayload
    );
    responseBody = await response.json();

    authorizationToken = responseBody.token;
  });

  describe('Response with error', function () {
    const rpReferenceId = generateReferenceId();

    const rp_requestStatusPendingPromise = createEventPromise();
    const rp_requestStatusErroredPromise = createEventPromise();

    const dataRequestReceivedPromise = createEventPromise();

    const as_requestStatusErroredPromise = createEventPromise();

    const errorCode = randomNumber(10000, 99999);
    const type = 'as';
    const description = `Test error code - ${errorCode}`;

    const errorMessage = 'Test error response';

    let createRequestParams;

    let requestId;

    let rp_statusCallbackOrder = 1;
    let as_statusCallbackOrder = 1;

    let rp_currentStatusCallbackOrder = 0;
    let as_currentStatusCallbackOrder = 0;

    before(async function () {
      this.timeout(10000);

      createRequestParams = {
        service_id: serviceId,
        service_version: 'v1',
        // service_extension: '',
        as_node_id: asNodeId,
        reference_id: rpReferenceId,
        callback_url: config.RP_CALLBACK_URL,
        namespace,
        identifier,
        request_params: JSON.stringify({
          selected_accounts: [
            {
              namespace: 'account_no',
              idenfifier: '123-45678-90',
              visible_identifier: '123-45XXX-XX',
              identifier_extension: '{account_type:savings}',
            },
          ],
        }),
        authorization: authorizationToken,
        request_timeout: 86400,
      };

      rpEventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'yourdata.request_status' &&
          callbackData.request_id === requestId
        ) {
          if (callbackData.status === yourDataRequestStatus.PENDING) {
            rp_requestStatusPendingPromise.resolve({
              order: rp_statusCallbackOrder++,
              callbackData,
            });
          } else if (callbackData.status === yourDataRequestStatus.ERRORED) {
            rp_requestStatusErroredPromise.resolve({
              order: rp_statusCallbackOrder++,
              callbackData,
            });
          }
        }
      });

      as1EventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'yourdata.data_request' &&
          callbackData.request_id === requestId
        ) {
          dataRequestReceivedPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'yourdata.request_status' &&
          callbackData.request_id === requestId
        ) {
          if (callbackData.status === yourDataRequestStatus.ERRORED) {
            as_requestStatusErroredPromise.resolve({
              order: as_statusCallbackOrder++,
              callbackData,
            });
          }
        }
      });

      let response;

      // add error code
      response = await ndidApi.addDomainErrorCode('ndid1', {
        domain: 'YourData',
        error_code: errorCode,
        type,
        description,
      });
      if (!response.ok) {
        throw new Error('error adding YourData error code');
      }

      // set AS callback
      response = await yourDataAsApi.setCallbacks('as1', {
        incoming_request_status_update_url: config.AS1_CALLBACK_URL,
      });
      if (!response.ok) {
        throw new Error('error settings AS callbacks');
      }

      await waitUntilBlockHeightMatch('as1', 'ndid1');
    });

    it('RP should create a request successfully', async function () {
      this.timeout(10000);
      const response = await yourDataRpApi.createRequest(
        'rp1',
        createRequestParams
      );
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody.request_id).to.be.a('string').that.is.not.empty;

      requestId = responseBody.request_id;
    });

    // request status callback at RP (yourDataRequestStatus.PENDING)
    it('RP should receive request pending status', async function () {
      this.timeout(10000);

      const { order, callbackData: requestStatus } =
        await rp_requestStatusPendingPromise.promise;

      expect(requestStatus).to.deep.include({
        node_id: rpNodeId,
        type: 'yourdata.request_status',
        requester_node_id: rpNodeId,
        as_node_id: asNodeId,
        request_id: requestId,
        request_timeout: createRequestParams.request_timeout,
        timed_out: false,
        status: yourDataRequestStatus.PENDING,
      });

      expect(order).to.be.greaterThan(rp_currentStatusCallbackOrder);

      rp_currentStatusCallbackOrder = order;
    });

    it('AS should receive data request', async function () {
      this.timeout(15000);
      const dataRequest = await dataRequestReceivedPromise.promise;
      expect(dataRequest).to.deep.include({
        type: 'yourdata.data_request',
        request_id: requestId,
        service_id: createRequestParams.service_id,
        service_version: createRequestParams.service_version,
        // service_extension: createRequestParams.service_extension,
        requester_node_id: rpNodeId,
        namespace: createRequestParams.namespace,
        identifier: createRequestParams.identifier,
        request_params: createRequestParams.request_params,
        authorization: createRequestParams.authorization,
        request_timeout: createRequestParams.request_timeout,
      });
      expect(dataRequest.request_time).to.be.a('number');
    });

    it('AS should respond with error successfully', async function () {
      this.timeout(20000);
      const response = await yourDataAsApi.sendError('as1', {
        // node_id: asNodeId,
        request_id: requestId,
        error_code: errorCode,
        error_message: errorMessage,
      });
      expect(response.status).to.equal(204);
    });

    // request status callback at AS (yourDataRequestStatus.ERRORED)
    it('AS should receive request errored status', async function () {
      this.timeout(10000);

      const { order, callbackData: requestStatus } =
        await as_requestStatusErroredPromise.promise;

      expect(requestStatus).to.deep.include({
        node_id: asNodeId,
        type: 'yourdata.request_status',
        requester_node_id: rpNodeId,
        as_node_id: asNodeId,
        request_id: requestId,
        request_timeout: createRequestParams.request_timeout,
        timed_out: false,
        status: yourDataRequestStatus.ERRORED,
        error_code: errorCode,
        error_message: errorMessage,
      });

      expect(order).to.be.greaterThan(as_currentStatusCallbackOrder);

      as_currentStatusCallbackOrder = order;
    });

    // request status callback at RP (yourDataRequestStatus.ERRORED)
    it('RP should receive request errored status', async function () {
      this.timeout(10000);

      const { order, callbackData: requestStatus } =
        await rp_requestStatusErroredPromise.promise;

      expect(requestStatus).to.deep.include({
        node_id: rpNodeId,
        type: 'yourdata.request_status',
        requester_node_id: rpNodeId,
        as_node_id: asNodeId,
        request_id: requestId,
        request_timeout: createRequestParams.request_timeout,
        timed_out: false,
        status: yourDataRequestStatus.ERRORED,
        error_code: errorCode,
        error_message: errorMessage,
      });

      expect(order).to.be.greaterThan(rp_currentStatusCallbackOrder);

      rp_currentStatusCallbackOrder = order;
    });

    after(function () {
      rpEventEmitter.removeAllListeners('callback');
      as1EventEmitter.removeAllListeners('callback');
    });
  });

  describe('Response with invalid/non-existent error code', function () {
    const rpReferenceId = generateReferenceId();

    const rp_requestStatusPendingPromise = createEventPromise();

    const dataRequestReceivedPromise = createEventPromise();

    const errorCode = randomNumber(10000, 99999);

    const errorMessage = 'Test error response';

    let createRequestParams;

    let requestId;

    let rp_statusCallbackOrder = 1;
    let as_statusCallbackOrder = 1;

    let rp_currentStatusCallbackOrder = 0;
    let as_currentStatusCallbackOrder = 0;

    before(async function () {
      createRequestParams = {
        service_id: serviceId,
        service_version: 'v1',
        // service_extension: '',
        as_node_id: asNodeId,
        reference_id: rpReferenceId,
        callback_url: config.RP_CALLBACK_URL,
        namespace,
        identifier,
        request_params: JSON.stringify({
          selected_accounts: [
            {
              namespace: 'account_no',
              idenfifier: '123-45678-90',
              visible_identifier: '123-45XXX-XX',
              identifier_extension: '{account_type:savings}',
            },
          ],
        }),
        authorization: authorizationToken,
        request_timeout: 86400,
      };

      rpEventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'yourdata.request_status' &&
          callbackData.request_id === requestId
        ) {
          if (callbackData.status === yourDataRequestStatus.PENDING) {
            rp_requestStatusPendingPromise.resolve({
              order: rp_statusCallbackOrder++,
              callbackData,
            });
          }
        }
      });

      as1EventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'yourdata.data_request' &&
          callbackData.request_id === requestId
        ) {
          dataRequestReceivedPromise.resolve(callbackData);
        }
      });

      let response;

      // set AS callback
      response = await yourDataAsApi.setCallbacks('as1', {
        incoming_request_status_update_url: config.AS1_CALLBACK_URL,
      });
      if (!response.ok) {
        throw new Error('error settings AS callbacks');
      }

      await waitUntilBlockHeightMatch('as1', 'ndid1');
    });

    it('RP should create a request successfully', async function () {
      this.timeout(10000);
      const response = await yourDataRpApi.createRequest(
        'rp1',
        createRequestParams
      );
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody.request_id).to.be.a('string').that.is.not.empty;

      requestId = responseBody.request_id;
    });

    // request status callback at RP (yourDataRequestStatus.PENDING)
    it('RP should receive request pending status', async function () {
      this.timeout(10000);

      const { order, callbackData: requestStatus } =
        await rp_requestStatusPendingPromise.promise;

      expect(requestStatus).to.deep.include({
        node_id: rpNodeId,
        type: 'yourdata.request_status',
        requester_node_id: rpNodeId,
        as_node_id: asNodeId,
        request_id: requestId,
        request_timeout: createRequestParams.request_timeout,
        timed_out: false,
        status: yourDataRequestStatus.PENDING,
      });

      expect(order).to.be.greaterThan(rp_currentStatusCallbackOrder);

      rp_currentStatusCallbackOrder = order;
    });

    it('AS should receive data request', async function () {
      this.timeout(15000);
      const dataRequest = await dataRequestReceivedPromise.promise;
      expect(dataRequest).to.deep.include({
        type: 'yourdata.data_request',
        request_id: requestId,
        service_id: createRequestParams.service_id,
        service_version: createRequestParams.service_version,
        // service_extension: createRequestParams.service_extension,
        requester_node_id: rpNodeId,
        namespace: createRequestParams.namespace,
        identifier: createRequestParams.identifier,
        request_params: createRequestParams.request_params,
        authorization: createRequestParams.authorization,
        request_timeout: createRequestParams.request_timeout,
      });
      expect(dataRequest.request_time).to.be.a('number');
    });

    it('AS should NOT be able to respond with invalid error code', async function () {
      this.timeout(20000);
      const response = await yourDataAsApi.sendError('as1', {
        // node_id: asNodeId,
        request_id: requestId,
        error_code: errorCode,
        error_message: errorMessage,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(400);
      expect(responseBody.error.code).to.equal(20078);
    });

    after(function () {
      rpEventEmitter.removeAllListeners('callback');
      as1EventEmitter.removeAllListeners('callback');
    });
  });
});
