import { expect } from 'chai';

import * as commonApi from '../../../../api/v7/common';
import * as yourDataRpApi from '../../../../api/v7/yourdata/rp';
import * as yourDataAsApi from '../../../../api/v7/yourdata/as';
import * as yourDataUtilityApi from '../../../../api/v7/yourdata/utility';
import { rpEventEmitter, as1EventEmitter } from '../../../../callback_server';
import * as db from '../../../../db';
import { createEventPromise, generateReferenceId } from '../../../../utils';
import { randomString } from '../../../../utils/random';
import yourDataRequestStatus from '../request_status';
import { waitUntilBlockHeightMatch } from '../../../../tendermint';
import * as config from '../../../../config';

describe('Negative cases', function () {
  const rpNodeId = 'rp1';
  const asNodeId = 'as1';

  const serviceId = `test_service_${randomString(8)}`;

  const asData = '<DATA>';

  let namespace;
  let identifier;

  let authorizationToken;

  let requestId;

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
      rp_node_id: 'rp1',
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

    await waitUntilBlockHeightMatch('rp1', 'ndid1');
  });

  describe('Request with retry request', function () {
    const rpReferenceId = generateReferenceId();

    const rp_requestStatusPendingPromise = createEventPromise();
    const rp_requestStatusCompletedPromise = createEventPromise();

    const dataRequestReceivedPromise = createEventPromise();

    const as_requestStatusCompletedPromise = createEventPromise();

    let createRequestParams;

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
        request_timeout: 3600,
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
          } else if (callbackData.status === yourDataRequestStatus.COMPLETED) {
            rp_requestStatusCompletedPromise.resolve({
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
          if (callbackData.status === yourDataRequestStatus.COMPLETED) {
            as_requestStatusCompletedPromise.resolve({
              order: as_statusCallbackOrder++,
              callbackData,
            });
          }
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

    it('RP should NOT be able to create a data decryption key retry request while data request is active/in-progress', async function () {
      this.timeout(10000);
      const response = await yourDataRpApi.createDataDecryptionKeyRetryRequest(
        'rp1',
        {
          request_id: requestId,
          reference_id: generateReferenceId(),
          callback_url: config.RP_CALLBACK_URL,
          request_timeout: 3600,
        }
      );
      expect(response.status).to.equal(400);

      const responseBody = await response.json();
      expect(responseBody.error.code).to.equal(20119);
    });

    it('AS should send data successfully', async function () {
      this.timeout(20000);
      const response = await yourDataAsApi.sendData('as1', {
        // node_id: asNodeId,
        request_id: requestId,
        data: asData,
      });
      expect(response.status).to.equal(204);
    });

    // request status callback at RP (yourDataRequestStatus.COMPLETED)
    it('RP should receive request completed status', async function () {
      this.timeout(10000);

      const { order, callbackData: requestStatus } =
        await rp_requestStatusCompletedPromise.promise;

      expect(requestStatus).to.deep.include({
        node_id: rpNodeId,
        type: 'yourdata.request_status',
        requester_node_id: rpNodeId,
        as_node_id: asNodeId,
        request_id: requestId,
        request_timeout: createRequestParams.request_timeout,
        timed_out: false,
        status: yourDataRequestStatus.COMPLETED,
      });

      expect(order).to.be.greaterThan(rp_currentStatusCallbackOrder);

      rp_currentStatusCallbackOrder = order;
    });

    // request status callback at AS (yourDataRequestStatus.COMPLETED)
    it('AS should receive request completed status', async function () {
      this.timeout(10000);

      const { order, callbackData: requestStatus } =
        await as_requestStatusCompletedPromise.promise;

      expect(requestStatus).to.deep.include({
        node_id: asNodeId,
        type: 'yourdata.request_status',
        requester_node_id: rpNodeId,
        as_node_id: asNodeId,
        request_id: requestId,
        request_timeout: createRequestParams.request_timeout,
        timed_out: false,
        status: yourDataRequestStatus.COMPLETED,
      });

      expect(order).to.be.greaterThan(as_currentStatusCallbackOrder);

      as_currentStatusCallbackOrder = order;
    });

    it('RP should NOT be able to create a data decryption key retry request after data request is completed', async function () {
      this.timeout(10000);
      const response = await yourDataRpApi.createDataDecryptionKeyRetryRequest(
        'rp1',
        {
          request_id: requestId,
          reference_id: generateReferenceId(),
          callback_url: config.RP_CALLBACK_URL,
          request_timeout: 3600,
        }
      );
      expect(response.status).to.equal(400);

      const responseBody = await response.json();
      expect(responseBody.error.code).to.equal(20120);
    });

    after(async function () {
      await commonApi.removePrivateMessages('rp1', {
        request_id: requestId,
      });

      await commonApi.removePrivateMessages('as1', {
        request_id: requestId,
      });

      rpEventEmitter.removeAllListeners('callback');
      as1EventEmitter.removeAllListeners('callback');
    });
  });
});
