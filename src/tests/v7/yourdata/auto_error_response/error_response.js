import { expect } from 'chai';

import * as yourDataRpApi from '../../../../api/v7/yourdata/rp';
import * as yourDataAsApi from '../../../../api/v7/yourdata/as';
import * as yourDataUtilityApi from '../../../../api/v7/yourdata/utility';
import { rpEventEmitter, as1EventEmitter } from '../../../../callback_server';
import * as db from '../../../../db';
import { createEventPromise, generateReferenceId } from '../../../../utils';
import { randomString } from '../../../../utils/random';
import yourDataRequestStatus from '../request_status';
import { ensureYourDataASErrorCode } from '../../../_helpers';
import { waitUntilBlockHeightMatch } from '../../../../tendermint';
import * as config from '../../../../config';

describe('Error response with auto error response config', function () {
  const rpNodeId = 'rp1';
  const asNodeId = 'as1';

  const serviceId = `test_service_${randomString(8)}`;

  const unsupportedServiceErrorCode = 50000;
  const unsupportedServiceErrorCodeDesc =
    'unsuported/unknown service error test';

  const serviceNotAvailbleErrorCode = 50001;
  const serviceNotAvailbleErrorCodeDesc = 'service not available error test';

  const unsupportedNamespaceErrorCode = 50002;
  const unsupportedNamespaceErrorCodeDesc = 'unsupported namespace error test';

  const unsupportedAuthorizationErrorCode = 50003;
  const unsupportedAuthorizationErrorCodeDesc =
    'unsupported authorization error test';

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

    await ensureYourDataASErrorCode({
      errorCode: unsupportedServiceErrorCode,
      description: unsupportedServiceErrorCodeDesc,
    });

    await ensureYourDataASErrorCode({
      errorCode: serviceNotAvailbleErrorCode,
      description: serviceNotAvailbleErrorCodeDesc,
    });

    await ensureYourDataASErrorCode({
      errorCode: unsupportedNamespaceErrorCode,
      description: unsupportedNamespaceErrorCodeDesc,
    });

    await ensureYourDataASErrorCode({
      errorCode: unsupportedAuthorizationErrorCode,
      description: unsupportedAuthorizationErrorCodeDesc,
    });

    await waitUntilBlockHeightMatch('as1', 'ndid1');
  });

  describe('Unsupported service', function () {
    const rpReferenceId = generateReferenceId();

    const rp_requestStatusPendingPromise = createEventPromise();
    const rp_requestStatusErroredPromise = createEventPromise();

    const dataRequestReceivedPromise = createEventPromise();

    const as_requestStatusErroredPromise = createEventPromise();

    const errorMessage = 'Test error response';

    let createRequestParams;

    let requestId;

    let rp_statusCallbackOrder = 1;
    let as_statusCallbackOrder = 1;

    let rp_currentStatusCallbackOrder = 0;
    let as_currentStatusCallbackOrder = 0;

    before(async function () {
      this.timeout(10000);

      let response;
      let responseBody;

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
            service_id: 'some_unsupported_service_id',
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

      createRequestParams = {
        service_id: 'some_unsupported_service_id',
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
        authorization: responseBody.token,
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

      // set AS callback
      response = await yourDataAsApi.setCallbacks('as1', {
        incoming_request_status_update_url: config.AS1_CALLBACK_URL,
      });
      if (!response.ok) {
        throw new Error('error settings AS callbacks');
      }

      // set AS auto error response
      response = await yourDataAsApi.setAutoErrorResponses('as1', {
        unsupported_service: {
          error_code: unsupportedServiceErrorCode,
          error_message: errorMessage,
        },
      });
      if (!response.ok) {
        throw new Error('error settings AS auto error response config');
      }
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
        error_code: unsupportedServiceErrorCode,
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
        error_code: unsupportedServiceErrorCode,
        error_message: errorMessage,
      });

      expect(order).to.be.greaterThan(rp_currentStatusCallbackOrder);

      rp_currentStatusCallbackOrder = order;
    });

    after(async function () {
      this.timeout(5000);

      await yourDataAsApi.setAutoErrorResponses('as1', {
        unsupported_service: null,
      });

      rpEventEmitter.removeAllListeners('callback');
      as1EventEmitter.removeAllListeners('callback');
    });
  });

  describe('Service unavailable', function () {
    const rpReferenceId = generateReferenceId();

    const rp_requestStatusPendingPromise = createEventPromise();
    const rp_requestStatusErroredPromise = createEventPromise();

    const dataRequestReceivedPromise = createEventPromise();

    const as_requestStatusErroredPromise = createEventPromise();

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
        service_availability: false,
      });
      if (!response.ok) {
        throw new Error('error adding or updating YourData AS service');
      }

      // set AS callback
      response = await yourDataAsApi.setCallbacks('as1', {
        incoming_request_status_update_url: config.AS1_CALLBACK_URL,
      });
      if (!response.ok) {
        throw new Error('error settings AS callbacks');
      }

      // set AS auto error response
      response = await yourDataAsApi.setAutoErrorResponses('as1', {
        service_not_available: {
          error_code: serviceNotAvailbleErrorCode,
          error_message: errorMessage,
        },
      });
      if (!response.ok) {
        throw new Error('error settings AS auto error response config');
      }
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
        error_code: serviceNotAvailbleErrorCode,
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
        error_code: serviceNotAvailbleErrorCode,
        error_message: errorMessage,
      });

      expect(order).to.be.greaterThan(rp_currentStatusCallbackOrder);

      rp_currentStatusCallbackOrder = order;
    });

    after(async function () {
      this.timeout(5000);

      await yourDataAsApi.setAutoErrorResponses('as1', {
        service_not_available: null,
      });

      rpEventEmitter.removeAllListeners('callback');
      as1EventEmitter.removeAllListeners('callback');
    });
  });

  describe('Unsupported namespace', function () {
    const rpReferenceId = generateReferenceId();

    const rp_requestStatusPendingPromise = createEventPromise();
    const rp_requestStatusErroredPromise = createEventPromise();

    const dataRequestReceivedPromise = createEventPromise();

    const as_requestStatusErroredPromise = createEventPromise();

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

      // ensure YourData AS service register
      response = await yourDataAsApi.addOrUpdateService(asNodeId, {
        serviceId,
        service_url: config.AS1_CALLBACK_URL,
        supported_namespace_list: [],
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

      // set AS callback
      response = await yourDataAsApi.setCallbacks('as1', {
        incoming_request_status_update_url: config.AS1_CALLBACK_URL,
      });
      if (!response.ok) {
        throw new Error('error settings AS callbacks');
      }

      // set AS auto error response
      response = await yourDataAsApi.setAutoErrorResponses('as1', {
        unsupported_namespace: {
          error_code: unsupportedNamespaceErrorCode,
          error_message: errorMessage,
        },
      });
      if (!response.ok) {
        throw new Error('error settings AS auto error response config');
      }
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
        error_code: unsupportedNamespaceErrorCode,
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
        error_code: unsupportedNamespaceErrorCode,
        error_message: errorMessage,
      });

      expect(order).to.be.greaterThan(rp_currentStatusCallbackOrder);

      rp_currentStatusCallbackOrder = order;
    });

    after(async function () {
      this.timeout(5000);

      await yourDataAsApi.setAutoErrorResponses('as1', {
        unsupported_namespace: null,
      });

      rpEventEmitter.removeAllListeners('callback');
      as1EventEmitter.removeAllListeners('callback');
    });
  });

  describe('Unsupported authorization', function () {
    const rpReferenceId = generateReferenceId();

    const rp_requestStatusPendingPromise = createEventPromise();
    const rp_requestStatusErroredPromise = createEventPromise();

    const dataRequestReceivedPromise = createEventPromise();

    const as_requestStatusErroredPromise = createEventPromise();

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

      // ensure YourData AS service register
      response = await yourDataAsApi.addOrUpdateService(asNodeId, {
        serviceId,
        service_url: config.AS1_CALLBACK_URL,
        supported_namespace_list: ['citizen_id'],
        supported_authorization: [
          // 'no_token_needed',
          // 'token_one_time',
          'token_continuous_with_expire',
          // 'token_continuous_no_expire',
        ],
        // service_availability: true,
      });
      if (!response.ok) {
        throw new Error('error adding or updating YourData AS service');
      }

      // set AS callback
      response = await yourDataAsApi.setCallbacks('as1', {
        incoming_request_status_update_url: config.AS1_CALLBACK_URL,
      });
      if (!response.ok) {
        throw new Error('error settings AS callbacks');
      }

      // set AS auto error response
      response = await yourDataAsApi.setAutoErrorResponses('as1', {
        unsupported_authorization: {
          error_code: unsupportedAuthorizationErrorCode,
          error_message: errorMessage,
        },
      });
      if (!response.ok) {
        throw new Error('error settings AS auto error response config');
      }
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
        error_code: unsupportedAuthorizationErrorCode,
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
        error_code: unsupportedAuthorizationErrorCode,
        error_message: errorMessage,
      });

      expect(order).to.be.greaterThan(rp_currentStatusCallbackOrder);

      rp_currentStatusCallbackOrder = order;
    });

    after(async function () {
      this.timeout(5000);

      await yourDataAsApi.setAutoErrorResponses('as1', {
        unsupported_authorization: null,
      });

      rpEventEmitter.removeAllListeners('callback');
      as1EventEmitter.removeAllListeners('callback');
    });
  });
});
