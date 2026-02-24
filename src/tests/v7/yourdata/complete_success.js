import { expect } from 'chai';

import * as ndidApi from '../../../api/v7/ndid';
import * as rpApi from '../../../api/v7/rp';
import * as idpApi from '../../../api/v7/idp';
import * as asApi from '../../../api/v7/as';
import * as commonApi from '../../../api/v7/common';
import * as yourDataRpApi from '../../../api/v7/yourdata/rp';
import * as yourDataAsApi from '../../../api/v7/yourdata/as';
import * as yourDataUtilityApi from '../../../api/v7/yourdata/utility';
import * as apiHelpers from '../../../api/helpers';
import {
  idp1EventEmitter,
  rpEventEmitter,
  as1EventEmitter,
  setAsSendErrorThroughCallback,
} from '../../../callback_server';
import * as db from '../../../db';
import {
  createEventPromise,
  generateReferenceId,
  hash,
  createResponseSignature,
} from '../../../utils';
import yourDataRequestStatus from './request_status';
import { waitUntilBlockHeightMatch } from '../../../tendermint';
import * as config from '../../../config';

import { getAndVerifyRequestMessagePaddedHashTest } from '../_fragments/request_flow_fragments/idp';

import {
  ensureRequestType,
  ensureService,
  ensureASService,
  ensureDomain,
  ensureDomainNodeWhitelistEnabled,
  ensureNodeInDomainNodeWhitelist,
  ensureServiceRequesterNodeWhitelistEnabled,
  ensureNodeInServiceRequesterNodeWhitelist,
} from '../../_helpers';

describe('Complete success scenario', function () {
  const rpNodeId = 'rp1';
  const requesterNodeId = rpNodeId;
  const idpNodeId = 'idp1';
  const asNodeId = 'as1';

  const domain = 'YourData';

  const preConsentRequestType = 'YourData';
  const preConsentServiceId = 'pre_consent_deposit';

  const completeConsentServiceId = 'complete_consent';

  const dataRequestServiceId = 'deposit_transactions';

  let namespace;
  let identifier;

  let authorizationTokenPayload;

  let preConsentRequestId;

  before(async function () {
    this.timeout(10000);

    const identity = db.idp1Identities.find((identity) => identity.mode === 2);
    namespace = identity.namespace;
    identifier = identity.identifier;

    // ensure YourData AS service register
    let res = await yourDataAsApi.addOrUpdateService(asNodeId, {
      serviceId: completeConsentServiceId,
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
    if (!res.ok) {
      throw new Error('error adding or updating YourData AS service');
    }

    res = await yourDataAsApi.addOrUpdateService(asNodeId, {
      serviceId: dataRequestServiceId,
      service_url: config.AS1_CALLBACK_URL,
      supported_namespace_list: ['citizen_id'],
      supported_authorization: [
        // 'no_token_needed',
        'token_one_time',
        // 'token_continuous_with_expire',
        // 'token_continuous_no_expire',
      ],
      // service_availability: true,
    });
    if (!res.ok) {
      throw new Error('error adding or updating YourData AS service');
    }

    // ensure request type - YourData
    await ensureRequestType({ requestType: preConsentRequestType });

    await ensureDomain({ domain });

    await ensureDomainNodeWhitelistEnabled({ domain });

    await ensureNodeInDomainNodeWhitelist({ domain, nodeId: rpNodeId });
    await ensureNodeInDomainNodeWhitelist({ domain, nodeId: asNodeId });

    // ensure service ID(s)
    await ensureService({
      serviceId: preConsentServiceId,
      serviceName: 'Pre-Consent Deposit',
      dataSchema: 'n/a',
      dataSchemaVersion: 'n/a',
      domain,
    });

    await ensureServiceRequesterNodeWhitelistEnabled({
      serviceId: preConsentServiceId,
    });

    await ensureNodeInServiceRequesterNodeWhitelist({
      serviceId: preConsentServiceId,
      nodeId: rpNodeId,
    });
    await ensureNodeInServiceRequesterNodeWhitelist({
      serviceId: preConsentServiceId,
      nodeId: asNodeId,
    });

    // ensure AS provides services
    await ensureASService({
      asNodeId,
      serviceId: preConsentServiceId,
      minIal: 1.1,
      minAal: 1,
      supportedNamespaceList: ['citizen_id'],
    });

    await waitUntilBlockHeightMatch('rp1', 'ndid1');
  });

  let preConsentToken;

  // pre-consent (on-chain) flow

  describe('Pre-consent (on-chain) flow', function () {
    const rpReferenceId = generateReferenceId();
    const idpReferenceId = generateReferenceId();
    const asReferenceId = generateReferenceId();
    const rpCloseRequestReferenceId = generateReferenceId();

    const createRequestResultPromise = createEventPromise();

    const requestStatusPendingPromise = createEventPromise(); // RP
    const requestStatusConfirmedPromise = createEventPromise(); // RP
    const requestStatusSignedDataPromise = createEventPromise(); // RP
    const requestStatusCompletedPromise = createEventPromise(); // RP
    const requestClosedPromise = createEventPromise(); // RP

    const closeRequestResultPromise = createEventPromise();

    const incomingRequestPromise = createEventPromise(); // IDP
    const responseResultPromise = createEventPromise();

    const idp_requestStatusSignedDataPromise = createEventPromise();
    const idp_requestStatusCompletedPromise = createEventPromise();
    const idp_requestClosedPromise = createEventPromise();

    const dataRequestReceivedPromise = createEventPromise();
    const sendDataResultPromise = createEventPromise();

    const as_requestStatusConfirmedPromise = createEventPromise();
    const as_requestStatusSignedDataPromise = createEventPromise();
    const as_requestStatusCompletedPromise = createEventPromise();
    const as_requestClosedPromise = createEventPromise();

    const preConsentRequestParams = JSON.stringify({
      usage_type: 'continuous_with_expire',
      data_service_list: [
        {
          service_id: 'deposit_balance',
          service_extension: ['balance'],
        },
        {
          service_id: 'deposit_transactions',
          service_extension: ['transactions_basic', 'transactions_detail'],
        },
      ],
    });

    let createRequestParams;
    // let lastStatusUpdateBlockHeight;

    let requestId;
    // let initialSalt;

    let identityForResponse;
    let responseAccessorId;
    let requestMessagePaddedHash;

    let requestStatusUpdates = [];
    // let idpIdList;
    // let dataRequestList;
    let idpResponseParams = [];
    // let requestMessageHash;

    before(async function () {
      createRequestParams = {
        reference_id: rpReferenceId,
        callback_url: config.RP_CALLBACK_URL,
        mode: 2,
        namespace,
        identifier,
        idp_id_list: [idpNodeId],
        data_request_list: [
          {
            service_id: preConsentServiceId,
            as_id_list: [asNodeId],
            min_as: 1,
            request_params: preConsentRequestParams,
          },
        ],
        request_message: 'Test request message - YourData pre-consent',
        min_ial: 2.3,
        min_aal: 2.2,
        min_idp: 1,
        request_timeout: 900,
        bypass_identity_check: false,
        request_type: preConsentRequestType,
      };

      rpEventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'create_request_result' &&
          callbackData.reference_id === rpReferenceId
        ) {
          createRequestResultPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'request_status' &&
          callbackData.request_id === requestId
        ) {
          requestStatusUpdates.push(callbackData);
          if (callbackData.status === 'pending') {
            requestStatusPendingPromise.resolve(callbackData);
          } else if (callbackData.status === 'confirmed') {
            if (callbackData.data_request_list[0].response_list.length > 0) {
              if (callbackData.data_request_list[0].response_list[0].signed) {
                requestStatusSignedDataPromise.resolve(callbackData);
              }
            } else {
              requestStatusConfirmedPromise.resolve(callbackData);
            }
          } else if (callbackData.status === 'completed') {
            if (callbackData.closed) {
              requestClosedPromise.resolve(callbackData);
            } else {
              requestStatusCompletedPromise.resolve(callbackData);
            }
          }
        } else if (
          callbackData.type === 'close_request_result' &&
          callbackData.reference_id === rpCloseRequestReferenceId
        ) {
          closeRequestResultPromise.resolve(callbackData);
        }
      });

      idp1EventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'incoming_request' &&
          callbackData.request_id === requestId
        ) {
          incomingRequestPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'response_result' &&
          callbackData.reference_id === idpReferenceId
        ) {
          responseResultPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'request_status' &&
          callbackData.request_id === requestId
        ) {
          if (callbackData.status === 'confirmed') {
            if (callbackData.data_request_list[0].response_list.length > 0) {
              if (callbackData.data_request_list[0].response_list[0].signed) {
                idp_requestStatusSignedDataPromise.resolve(callbackData);
              }
            }
          } else if (callbackData.status === 'completed') {
            if (callbackData.closed) {
              idp_requestClosedPromise.resolve(callbackData);
            } else {
              idp_requestStatusCompletedPromise.resolve(callbackData);
            }
          }
        }
      });

      as1EventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'data_request' &&
          callbackData.request_id === requestId
        ) {
          dataRequestReceivedPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'response_result' &&
          callbackData.reference_id === asReferenceId
        ) {
          sendDataResultPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'request_status' &&
          callbackData.request_id === requestId
        ) {
          if (callbackData.status === 'confirmed') {
            if (callbackData.data_request_list[0].response_list.length > 0) {
              if (callbackData.data_request_list[0].response_list[0].signed) {
                as_requestStatusSignedDataPromise.resolve(callbackData);
              }
            } else {
              as_requestStatusConfirmedPromise.resolve(callbackData);
            }
          } else if (callbackData.status === 'completed') {
            if (callbackData.closed) {
              as_requestClosedPromise.resolve(callbackData);
            } else {
              as_requestStatusCompletedPromise.resolve(callbackData);
            }
          }
        }
      });
    });

    it('RP should create a request successfully', async function () {
      this.timeout(10000);
      const response = await rpApi.createRequest('rp1', createRequestParams);
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

      requestId = responseBody.request_id;
      // initialSalt = responseBody.initial_salt;

      const createRequestResult = await createRequestResultPromise.promise;
      expect(createRequestResult.success).to.equal(true);
      expect(createRequestResult.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight =
        createRequestResult.creation_block_height.split(':');
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
      // lastStatusUpdateBlockHeight = parseInt(splittedCreationBlockHeight[1]);
    });

    it('IdP should receive incoming request callback', async function () {
      this.timeout(15000);
      const incomingRequest = await incomingRequestPromise.promise;

      const dataRequestListWithoutParams =
        createRequestParams.data_request_list.map((dataRequest) => {
          const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
          return {
            ...dataRequestWithoutParams,
          };
        });
      expect(incomingRequest).to.deep.include({
        node_id: 'idp1',
        type: 'incoming_request',
        mode: createRequestParams.mode,
        request_id: requestId,
        request_message: createRequestParams.request_message,
        request_message_hash: hash(
          createRequestParams.request_message +
            incomingRequest.request_message_salt
        ),
        requester_node_id: requesterNodeId,
        min_ial: createRequestParams.min_ial,
        min_aal: createRequestParams.min_aal,
        data_request_list: dataRequestListWithoutParams,
        request_timeout: createRequestParams.request_timeout,
      });
      expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
        .empty;
      expect(incomingRequest.creation_time).to.be.a('number');
      expect(incomingRequest.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight =
        incomingRequest.creation_block_height.split(':');
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('IdP (idp1) should get request_message_padded_hash successfully', async function () {
      this.timeout(15000);
      identityForResponse = db.idp1Identities.find(
        (identity) =>
          identity.namespace === namespace && identity.identifier === identifier
      );

      let latestAccessor;
      if (identityForResponse) {
        latestAccessor = identityForResponse.accessors.length - 1;
      } else {
        throw new Error('Identity not found');
      }

      responseAccessorId =
        identityForResponse.accessors[latestAccessor].accessorId;

      let accessorPublicKey =
        identityForResponse.accessors[latestAccessor].accessorPublicKey;

      const testResult = await getAndVerifyRequestMessagePaddedHashTest({
        callApiAtNodeId: 'idp1',
        idpNodeId,
        requestId,
        incomingRequestPromise,
        accessorPublicKey,
        accessorId: responseAccessorId,
      });
      requestMessagePaddedHash = testResult.verifyRequestMessagePaddedHash;
    });

    it('IdP (idp1) should create response (accept) successfully', async function () {
      this.timeout(15000);

      let latestAccessor = identityForResponse.accessors.length - 1;

      let accessorPrivateKey =
        identityForResponse.accessors[latestAccessor].accessorPrivateKey;

      const signature = createResponseSignature(
        accessorPrivateKey,
        requestMessagePaddedHash
      );

      let idpResponse = {
        reference_id: idpReferenceId,
        callback_url: config.IDP1_CALLBACK_URL,
        request_id: requestId,
        ial: 2.3,
        aal: 3,
        status: 'accept',
        accessor_id: responseAccessorId,
        signature,
      };

      idpResponseParams.push({
        ...idpResponse,
        idp_id: idpNodeId,
        valid_signature: true,
        valid_ial: true,
      });

      let response = await idpApi.createResponse('idp1', idpResponse);
      expect(response.status).to.equal(202);
    });

    it('IdP should receive callback create response result with success = true', async function () {
      const responseResult = await responseResultPromise.promise;
      expect(responseResult).to.deep.include({
        node_id: 'idp1',
        type: 'response_result',
        reference_id: idpReferenceId,
        request_id: requestId,
        success: true,
      });
    });

    it('AS should receive data request', async function () {
      this.timeout(15000);
      const dataRequest = await dataRequestReceivedPromise.promise;
      expect(dataRequest).to.deep.include({
        type: 'data_request',
        request_id: requestId,
        mode: createRequestParams.mode,
        namespace,
        identifier,
        service_id: createRequestParams.data_request_list[0].service_id,
        request_params: createRequestParams.data_request_list[0].request_params,
        requester_node_id: 'rp1',
        max_ial: 2.3,
        max_aal: 3,

        request_timeout: createRequestParams.request_timeout,
      });
      expect(dataRequest.response_signature_list).to.have.lengthOf(1);
      expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is
        .not.empty;
      expect(dataRequest.creation_time).to.be.a('number');
      expect(dataRequest.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight =
        dataRequest.creation_block_height.split(':');
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('AS (as1) should create authorization token successfully', async function () {
      this.timeout(20000);

      authorizationTokenPayload = {
        rp_node_id: rpNodeId,
        as_node_id: asNodeId,
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
            service_id: completeConsentServiceId,
            service_version: 'v1',
            service_extension: [
              createRequestParams.data_request_list[0].request_params,
            ],
          },
        ],
        validate_identifier: true,
        validate_service_id: true,
        validate_service_extension: false,
        usage_type: 'one_time',
        expiration_datetime: Math.floor(Date.now() / 1000) + 1 * 24 * 60 * 60, // + 1 day
        source_request_id_list: [requestId],
      };

      const response = await yourDataUtilityApi.createSignedAuthorizationToken(
        'as1',
        authorizationTokenPayload
      );
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody.token).to.be.a('string').that.is.not.empty;

      preConsentToken = responseBody.token;
    });

    it('AS (as1) should send data successfully', async function () {
      this.timeout(20000);
      const response = await asApi.sendData('as1', {
        requestId,
        serviceId: createRequestParams.data_request_list[0].service_id,
        reference_id: asReferenceId,
        callback_url: config.AS1_CALLBACK_URL,
        data: preConsentToken,
      });
      expect(response.status).to.equal(202);

      const sendDataResult = await sendDataResultPromise.promise;
      expect(sendDataResult).to.deep.include({
        node_id: 'as1',
        type: 'response_result',
        reference_id: asReferenceId,
        success: true,
      });
    });

    it('RP should receive request closed status', async function () {
      this.timeout(10000);

      const requestStatus = await requestClosedPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: requestId,
        status: 'completed',
        mode: createRequestParams.mode,
        min_idp: createRequestParams.min_idp,
        closed: true,
        timed_out: false,
      });
    });

    it('RP should get data received from AS successfully', async function () {
      this.timeout(10000);
      const response = await rpApi.getDataFromAS('rp1', {
        requestId,
      });
      const dataArr = await response.json();
      expect(response.status).to.equal(200);

      const nodeInfoResponse = await apiHelpers.getResponseAndBody(
        commonApi.getNodeInfo('rp1', {
          node_id: 'as1',
        })
      );
      const asNodeInfo = nodeInfoResponse.responseBody;

      expect(dataArr).to.have.lengthOf(1);
      expect(dataArr[0]).to.deep.include({
        source_node_id: 'as1',
        service_id: createRequestParams.data_request_list[0].service_id,
        signature_signing_algorithm: asNodeInfo.signing_public_key.algorithm,
        signature_signing_key_version: asNodeInfo.signing_public_key.version,
        data: preConsentToken,
      });
      expect(dataArr[0].source_signature).to.be.a('string').that.is.not.empty;
      expect(dataArr[0].data_salt).to.be.a('string').that.is.not.empty;
    });

    after(function () {
      preConsentRequestId = requestId;

      rpEventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('callback');
      as1EventEmitter.removeAllListeners('callback');
    });
  });

  let completeConsentToken;

  describe('Complete consent (off-chain) flow', function () {
    const rpReferenceId = generateReferenceId();

    const rp_requestStatusPendingPromise = createEventPromise();
    const rp_requestStatusDataDecryptionKeyPendingPromise =
      createEventPromise();
    const rp_requestStatusDataDecryptionKeyRequestedPromise =
      createEventPromise();
    const rp_requestStatusDataDecryptionKeyAvailablePromise =
      createEventPromise();
    const rp_requestStatusCompletedPromise = createEventPromise();

    const dataRequestReceivedPromise = createEventPromise();

    const as_requestStatusDataDecryptionKeyPendingPromise =
      createEventPromise();
    const as_requestStatusDataDecryptionKeyRequestedPromise =
      createEventPromise();
    const as_requestStatusDataDecryptionKeyAvailablePromise =
      createEventPromise();
    const as_requestStatusCompletedPromise = createEventPromise();

    let createRequestParams;

    let requestId;

    let rp_statusCallbackOrder = 1;
    let as_statusCallbackOrder = 1;

    let rp_currentStatusCallbackOrder = 0;
    let as_currentStatusCallbackOrder = 0;

    before(async function () {
      createRequestParams = {
        service_id: completeConsentServiceId,
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
        authorization: preConsentToken,
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
          } else if (
            callbackData.status ===
            yourDataRequestStatus.DATA_DECRYPTION_PENDING
          ) {
            rp_requestStatusDataDecryptionKeyPendingPromise.resolve({
              order: rp_statusCallbackOrder++,
              callbackData,
            });
          } else if (
            callbackData.status ===
            yourDataRequestStatus.DATA_DECRYPTION_KEY_REQUESTED
          ) {
            rp_requestStatusDataDecryptionKeyRequestedPromise.resolve({
              order: rp_statusCallbackOrder++,
              callbackData,
            });
          } else if (
            callbackData.status ===
            yourDataRequestStatus.DATA_DECRYPTION_KEY_AVAILABLE
          ) {
            rp_requestStatusDataDecryptionKeyAvailablePromise.resolve({
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
          if (
            callbackData.status ===
            yourDataRequestStatus.DATA_DECRYPTION_PENDING
          ) {
            as_requestStatusDataDecryptionKeyPendingPromise.resolve({
              order: as_statusCallbackOrder++,
              callbackData,
            });
          } else if (
            callbackData.status ===
            yourDataRequestStatus.DATA_DECRYPTION_KEY_REQUESTED
          ) {
            as_requestStatusDataDecryptionKeyRequestedPromise.resolve({
              order: as_statusCallbackOrder++,
              callbackData,
            });
          } else if (
            callbackData.status ===
            yourDataRequestStatus.DATA_DECRYPTION_KEY_AVAILABLE
          ) {
            as_requestStatusDataDecryptionKeyAvailablePromise.resolve({
              order: as_statusCallbackOrder++,
              callbackData,
            });
          } else if (callbackData.status === yourDataRequestStatus.COMPLETED) {
            as_requestStatusCompletedPromise.resolve({
              order: as_statusCallbackOrder++,
              callbackData,
            });
          }
        }
      });

      // set AS callback
      let response = await yourDataAsApi.setCallbacks('as1', {
        incoming_request_status_update_url: config.AS1_CALLBACK_URL,
      });
      if (!response.ok) {
        throw new Error('error settings AS callbacks');
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

    it('RP should get request ID by reference ID while request is not completed successfully', async function () {
      this.timeout(10000);
      const response = await yourDataRpApi.getRequestIdByReferenceId('rp1', {
        reference_id: rpReferenceId,
      });
      expect(response.status).to.equal(200);

      const responseBody = await response.json();
      expect(responseBody).to.deep.equal({
        request_id: requestId,
      });
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

    it('AS should create authorization token successfully', async function () {
      this.timeout(20000);

      const service = authorizationTokenPayload.service_id_list.find(
        (service) => service.service_id === completeConsentServiceId
      );

      const completeConsentServiceExtension = JSON.parse(
        service.service_extension
      ); // request_params

      const response = await yourDataUtilityApi.createSignedAuthorizationToken(
        'as1',
        {
          rp_node_id: rpNodeId,
          as_node_id: asNodeId,
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
          service_id_list:
            completeConsentServiceExtension.data_service_list.map(
              (dataService) => {
                return {
                  service_id: dataService.service_id,
                  service_version: 'v1',
                  service_extension: dataService.service_extension,
                };
              }
            ),
          validate_identifier: true,
          validate_service_id: true,
          validate_service_extension: true,
          usage_type: 'one_time',
          expiration_datetime:
            Math.floor(Date.now() / 1000) + 10 * 24 * 60 * 60, // + 10 days
          source_request_id_list: [preConsentRequestId, requestId],
        }
      );
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody.token).to.be.a('string').that.is.not.empty;

      completeConsentToken = responseBody.token;
    });

    it('AS should send data successfully', async function () {
      this.timeout(20000);
      const response = await yourDataAsApi.sendData('as1', {
        // node_id: asNodeId,
        request_id: requestId,
        data: completeConsentToken,
      });
      expect(response.status).to.equal(204);
    });

    // request status callback at AS (yourDataRequestStatus.DATA_DECRYPTION_PENDING)
    it('AS should receive request data decryption pending status', async function () {
      this.timeout(10000);

      const { order, callbackData: requestStatus } =
        await as_requestStatusDataDecryptionKeyPendingPromise.promise;

      expect(requestStatus).to.deep.include({
        node_id: asNodeId,
        type: 'yourdata.request_status',
        requester_node_id: rpNodeId,
        as_node_id: asNodeId,
        request_id: requestId,
        request_timeout: createRequestParams.request_timeout,
        timed_out: false,
        status: yourDataRequestStatus.DATA_DECRYPTION_PENDING,
      });

      expect(order).to.be.greaterThan(as_currentStatusCallbackOrder);

      as_currentStatusCallbackOrder = order;
    });

    // request status callback at RP (yourDataRequestStatus.DATA_DECRYPTION_PENDING)
    it('RP should receive request data decryption pending status', async function () {
      this.timeout(10000);

      const { order, callbackData: requestStatus } =
        await rp_requestStatusDataDecryptionKeyPendingPromise.promise;

      expect(requestStatus).to.deep.include({
        node_id: rpNodeId,
        type: 'yourdata.request_status',
        requester_node_id: rpNodeId,
        as_node_id: asNodeId,
        request_id: requestId,
        request_timeout: createRequestParams.request_timeout,
        timed_out: false,
        status: yourDataRequestStatus.DATA_DECRYPTION_PENDING,
      });

      expect(order).to.be.greaterThan(rp_currentStatusCallbackOrder);

      rp_currentStatusCallbackOrder = order;
    });

    // request status callback at RP (yourDataRequestStatus.DATA_DECRYPTION_KEY_REQUESTED)
    it('RP should receive request data decryption requested status', async function () {
      this.timeout(10000);

      const { order, callbackData: requestStatus } =
        await rp_requestStatusDataDecryptionKeyRequestedPromise.promise;

      expect(requestStatus).to.deep.include({
        node_id: rpNodeId,
        type: 'yourdata.request_status',
        requester_node_id: rpNodeId,
        as_node_id: asNodeId,
        request_id: requestId,
        request_timeout: createRequestParams.request_timeout,
        timed_out: false,
        status: yourDataRequestStatus.DATA_DECRYPTION_KEY_REQUESTED,
      });

      expect(order).to.be.greaterThan(rp_currentStatusCallbackOrder);

      rp_currentStatusCallbackOrder = order;
    });

    // request status callback at AS (yourDataRequestStatus.DATA_DECRYPTION_KEY_REQUESTED)
    it('AS should receive request data decryption requested status', async function () {
      this.timeout(10000);

      const { order, callbackData: requestStatus } =
        await as_requestStatusDataDecryptionKeyRequestedPromise.promise;

      expect(requestStatus).to.deep.include({
        node_id: asNodeId,
        type: 'yourdata.request_status',
        requester_node_id: rpNodeId,
        as_node_id: asNodeId,
        request_id: requestId,
        request_timeout: createRequestParams.request_timeout,
        timed_out: false,
        status: yourDataRequestStatus.DATA_DECRYPTION_KEY_REQUESTED,
      });

      expect(order).to.be.greaterThan(as_currentStatusCallbackOrder);

      as_currentStatusCallbackOrder = order;
    });

    // request status callback at AS (yourDataRequestStatus.DATA_DECRYPTION_KEY_AVAILABLE)
    it('AS should receive request data decryption available status', async function () {
      this.timeout(10000);

      const { order, callbackData: requestStatus } =
        await as_requestStatusDataDecryptionKeyAvailablePromise.promise;

      expect(requestStatus).to.deep.include({
        node_id: asNodeId,
        type: 'yourdata.request_status',
        requester_node_id: rpNodeId,
        as_node_id: asNodeId,
        request_id: requestId,
        request_timeout: createRequestParams.request_timeout,
        timed_out: false,
        status: yourDataRequestStatus.DATA_DECRYPTION_KEY_AVAILABLE,
      });

      expect(order).to.be.greaterThan(as_currentStatusCallbackOrder);

      as_currentStatusCallbackOrder = order;
    });

    // request status callback at RP (yourDataRequestStatus.DATA_DECRYPTION_KEY_AVAILABLE)
    it('RP should receive request data decryption available status', async function () {
      this.timeout(10000);

      const { order, callbackData: requestStatus } =
        await rp_requestStatusDataDecryptionKeyAvailablePromise.promise;

      expect(requestStatus).to.deep.include({
        node_id: rpNodeId,
        type: 'yourdata.request_status',
        requester_node_id: rpNodeId,
        as_node_id: asNodeId,
        request_id: requestId,
        request_timeout: createRequestParams.request_timeout,
        timed_out: false,
        status: yourDataRequestStatus.DATA_DECRYPTION_KEY_AVAILABLE,
      });

      expect(order).to.be.greaterThan(rp_currentStatusCallbackOrder);

      rp_currentStatusCallbackOrder = order;
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

    it('RP should NOT be able to get request ID by reference ID after request is completed', async function () {
      this.timeout(10000);
      const response = await yourDataRpApi.getRequestIdByReferenceId('rp1', {
        reference_id: rpReferenceId,
      });
      expect(response.status).to.equal(404);
    });

    it('RP should get data received from AS successfully', async function () {
      this.timeout(10000);
      const response = await yourDataRpApi.getDataFromAS('rp1', {
        requestId,
      });

      const data = await response.json();
      expect(response.status).to.equal(200);

      const nodeInfoResponse = await apiHelpers.getResponseAndBody(
        commonApi.getNodeInfo('rp1', {
          node_id: 'as1',
        })
      );
      const asNodeInfo = nodeInfoResponse.responseBody;

      expect(data).to.deep.include({
        source_node_id: asNodeId,
        service_id: createRequestParams.service_id,
        signature_signing_algorithm: asNodeInfo.signing_public_key.algorithm,
        signature_signing_key_version: asNodeInfo.signing_public_key.version,
        data: completeConsentToken,
      });
      expect(data.source_signature).to.be.a('string').that.is.not.empty;
      expect(data.data_salt).to.be.a('string').that.is.not.empty;
    });

    it('RP should remove data received from AS successfully', async function () {
      const response = await yourDataRpApi.removeDataFromAS('rp1', {
        request_id: requestId,
      });
      expect(response.status).to.equal(204);
    });

    it('RP should have no saved data requested from AS left after removal', async function () {
      const response = await yourDataRpApi.getDataFromAS('rp1', {
        requestId,
      });
      expect(response.status).to.equal(404);
    });

    it('RP should have and able to get saved private messages', async function () {
      const response = await commonApi.getPrivateMessages('rp1', {
        request_id: requestId,
        skip_request_id_check: true,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.be.an('array').that.is.not.empty;
    });

    it('RP should remove saved private messages successfully', async function () {
      const response = await commonApi.removePrivateMessages('rp1', {
        request_id: requestId,
      });
      expect(response.status).to.equal(204);
    });

    it('RP should have no saved private messages left after removal', async function () {
      const response = await commonApi.getPrivateMessages('rp1', {
        request_id: requestId,
        skip_request_id_check: true,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.be.an('array').that.is.empty;
    });

    it('AS should have and able to get saved private messages', async function () {
      const response = await commonApi.getPrivateMessages('as1', {
        request_id: requestId,
        skip_request_id_check: true,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.be.an('array').that.is.not.empty;
    });

    it('AS should remove saved private messages successfully', async function () {
      const response = await commonApi.removePrivateMessages('as1', {
        request_id: requestId,
      });
      expect(response.status).to.equal(204);
    });

    it('AS should have no saved private messages left after removal', async function () {
      const response = await commonApi.getPrivateMessages('as1', {
        request_id: requestId,
        skip_request_id_check: true,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.be.an('array').that.is.empty;
    });

    after(function () {
      rpEventEmitter.removeAllListeners('callback');
      as1EventEmitter.removeAllListeners('callback');
    });
  });

  describe('Data request (off-chain) flow', function () {
    const rpReferenceId = generateReferenceId();

    const rp_requestStatusPendingPromise = createEventPromise();
    const rp_requestStatusDataDecryptionKeyPendingPromise =
      createEventPromise();
    const rp_requestStatusDataDecryptionKeyRequestedPromise =
      createEventPromise();
    const rp_requestStatusDataDecryptionKeyAvailablePromise =
      createEventPromise();
    const rp_requestStatusCompletedPromise = createEventPromise();

    const dataRequestReceivedPromise = createEventPromise();

    const as_requestStatusDataDecryptionKeyPendingPromise =
      createEventPromise();
    const as_requestStatusDataDecryptionKeyRequestedPromise =
      createEventPromise();
    const as_requestStatusDataDecryptionKeyAvailablePromise =
      createEventPromise();
    const as_requestStatusCompletedPromise = createEventPromise();

    const asData = '<TRANSACTIONS_DETAIL_DATA>';

    let createRequestParams;

    let requestId;

    let rp_statusCallbackOrder = 1;
    let as_statusCallbackOrder = 1;

    let rp_currentStatusCallbackOrder = 0;
    let as_currentStatusCallbackOrder = 0;

    before(async function () {
      createRequestParams = {
        service_id: dataRequestServiceId,
        service_version: 'v1',
        service_extension: 'transactions_detail',
        as_node_id: asNodeId,
        reference_id: rpReferenceId,
        callback_url: config.RP_CALLBACK_URL,
        namespace,
        identifier,
        request_params: JSON.stringify({
          fromBookingDateTime: '2025-05-01T00:07:00Z',
          toBookingDateTime: '2025-10-17T00:07:00Z',
          language: 'TH',
          auxilaryReferenceId: 'xxxxxxx',
        }),
        authorization: completeConsentToken,
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
          } else if (
            callbackData.status ===
            yourDataRequestStatus.DATA_DECRYPTION_PENDING
          ) {
            rp_requestStatusDataDecryptionKeyPendingPromise.resolve({
              order: rp_statusCallbackOrder++,
              callbackData,
            });
          } else if (
            callbackData.status ===
            yourDataRequestStatus.DATA_DECRYPTION_KEY_REQUESTED
          ) {
            rp_requestStatusDataDecryptionKeyRequestedPromise.resolve({
              order: rp_statusCallbackOrder++,
              callbackData,
            });
          } else if (
            callbackData.status ===
            yourDataRequestStatus.DATA_DECRYPTION_KEY_AVAILABLE
          ) {
            rp_requestStatusDataDecryptionKeyAvailablePromise.resolve({
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
          if (
            callbackData.status ===
            yourDataRequestStatus.DATA_DECRYPTION_PENDING
          ) {
            as_requestStatusDataDecryptionKeyPendingPromise.resolve({
              order: as_statusCallbackOrder++,
              callbackData,
            });
          } else if (
            callbackData.status ===
            yourDataRequestStatus.DATA_DECRYPTION_KEY_REQUESTED
          ) {
            as_requestStatusDataDecryptionKeyRequestedPromise.resolve({
              order: as_statusCallbackOrder++,
              callbackData,
            });
          } else if (
            callbackData.status ===
            yourDataRequestStatus.DATA_DECRYPTION_KEY_AVAILABLE
          ) {
            as_requestStatusDataDecryptionKeyAvailablePromise.resolve({
              order: as_statusCallbackOrder++,
              callbackData,
            });
          } else if (callbackData.status === yourDataRequestStatus.COMPLETED) {
            as_requestStatusCompletedPromise.resolve({
              order: as_statusCallbackOrder++,
              callbackData,
            });
          }
        }
      });

      // set AS callback
      let response = await yourDataAsApi.setCallbacks('as1', {
        incoming_request_status_update_url: config.AS1_CALLBACK_URL,
      });
      if (!response.ok) {
        throw new Error('error settings AS callbacks');
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

    it('AS should receive data request', async function () {
      this.timeout(15000);
      const dataRequest = await dataRequestReceivedPromise.promise;
      expect(dataRequest).to.deep.include({
        type: 'yourdata.data_request',
        request_id: requestId,
        service_id: createRequestParams.service_id,
        service_version: createRequestParams.service_version,
        service_extension: createRequestParams.service_extension,
        requester_node_id: rpNodeId,
        namespace: createRequestParams.namespace,
        identifier: createRequestParams.identifier,
        request_params: createRequestParams.request_params,
        authorization: createRequestParams.authorization,
        request_timeout: createRequestParams.request_timeout,
      });
      expect(dataRequest.request_time).to.be.a('number');
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

    // request status callback at AS (yourDataRequestStatus.DATA_DECRYPTION_PENDING)
    it('AS should receive request data decryption pending status', async function () {
      this.timeout(10000);

      const { order, callbackData: requestStatus } =
        await as_requestStatusDataDecryptionKeyPendingPromise.promise;

      expect(requestStatus).to.deep.include({
        node_id: asNodeId,
        type: 'yourdata.request_status',
        requester_node_id: rpNodeId,
        as_node_id: asNodeId,
        request_id: requestId,
        request_timeout: createRequestParams.request_timeout,
        timed_out: false,
        status: yourDataRequestStatus.DATA_DECRYPTION_PENDING,
      });

      expect(order).to.be.greaterThan(as_currentStatusCallbackOrder);

      as_currentStatusCallbackOrder = order;
    });

    // request status callback at RP (yourDataRequestStatus.DATA_DECRYPTION_PENDING)
    it('RP should receive request data decryption pending status', async function () {
      this.timeout(10000);

      const { order, callbackData: requestStatus } =
        await rp_requestStatusDataDecryptionKeyPendingPromise.promise;

      expect(requestStatus).to.deep.include({
        node_id: rpNodeId,
        type: 'yourdata.request_status',
        requester_node_id: rpNodeId,
        as_node_id: asNodeId,
        request_id: requestId,
        request_timeout: createRequestParams.request_timeout,
        timed_out: false,
        status: yourDataRequestStatus.DATA_DECRYPTION_PENDING,
      });

      expect(order).to.be.greaterThan(rp_currentStatusCallbackOrder);

      rp_currentStatusCallbackOrder = order;
    });

    // request status callback at RP (yourDataRequestStatus.DATA_DECRYPTION_KEY_REQUESTED)
    it('RP should receive request data decryption requested status', async function () {
      this.timeout(10000);

      const { order, callbackData: requestStatus } =
        await rp_requestStatusDataDecryptionKeyRequestedPromise.promise;

      expect(requestStatus).to.deep.include({
        node_id: rpNodeId,
        type: 'yourdata.request_status',
        requester_node_id: rpNodeId,
        as_node_id: asNodeId,
        request_id: requestId,
        request_timeout: createRequestParams.request_timeout,
        timed_out: false,
        status: yourDataRequestStatus.DATA_DECRYPTION_KEY_REQUESTED,
      });

      expect(order).to.be.greaterThan(rp_currentStatusCallbackOrder);

      rp_currentStatusCallbackOrder = order;
    });

    // request status callback at AS (yourDataRequestStatus.DATA_DECRYPTION_KEY_REQUESTED)
    it('AS should receive request data decryption requested status', async function () {
      this.timeout(10000);

      const { order, callbackData: requestStatus } =
        await as_requestStatusDataDecryptionKeyRequestedPromise.promise;

      expect(requestStatus).to.deep.include({
        node_id: asNodeId,
        type: 'yourdata.request_status',
        requester_node_id: rpNodeId,
        as_node_id: asNodeId,
        request_id: requestId,
        request_timeout: createRequestParams.request_timeout,
        timed_out: false,
        status: yourDataRequestStatus.DATA_DECRYPTION_KEY_REQUESTED,
      });

      expect(order).to.be.greaterThan(as_currentStatusCallbackOrder);

      as_currentStatusCallbackOrder = order;
    });

    // request status callback at AS (yourDataRequestStatus.DATA_DECRYPTION_KEY_AVAILABLE)
    it('AS should receive request data decryption available status', async function () {
      this.timeout(10000);

      const { order, callbackData: requestStatus } =
        await as_requestStatusDataDecryptionKeyAvailablePromise.promise;

      expect(requestStatus).to.deep.include({
        node_id: asNodeId,
        type: 'yourdata.request_status',
        requester_node_id: rpNodeId,
        as_node_id: asNodeId,
        request_id: requestId,
        request_timeout: createRequestParams.request_timeout,
        timed_out: false,
        status: yourDataRequestStatus.DATA_DECRYPTION_KEY_AVAILABLE,
      });

      expect(order).to.be.greaterThan(as_currentStatusCallbackOrder);

      as_currentStatusCallbackOrder = order;
    });

    // request status callback at RP (yourDataRequestStatus.DATA_DECRYPTION_KEY_AVAILABLE)
    it('RP should receive request data decryption available status', async function () {
      this.timeout(10000);

      const { order, callbackData: requestStatus } =
        await rp_requestStatusDataDecryptionKeyAvailablePromise.promise;

      expect(requestStatus).to.deep.include({
        node_id: rpNodeId,
        type: 'yourdata.request_status',
        requester_node_id: rpNodeId,
        as_node_id: asNodeId,
        request_id: requestId,
        request_timeout: createRequestParams.request_timeout,
        timed_out: false,
        status: yourDataRequestStatus.DATA_DECRYPTION_KEY_AVAILABLE,
      });

      expect(order).to.be.greaterThan(rp_currentStatusCallbackOrder);

      rp_currentStatusCallbackOrder = order;
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

    it('RP should get data received from AS successfully', async function () {
      this.timeout(10000);
      const response = await yourDataRpApi.getDataFromAS('rp1', {
        requestId,
      });

      const data = await response.json();
      expect(response.status).to.equal(200);

      const nodeInfoResponse = await apiHelpers.getResponseAndBody(
        commonApi.getNodeInfo('rp1', {
          node_id: 'as1',
        })
      );
      const asNodeInfo = nodeInfoResponse.responseBody;

      expect(data).to.deep.include({
        source_node_id: asNodeId,
        service_id: createRequestParams.service_id,
        signature_signing_algorithm: asNodeInfo.signing_public_key.algorithm,
        signature_signing_key_version: asNodeInfo.signing_public_key.version,
        data: asData,
      });
      expect(data.source_signature).to.be.a('string').that.is.not.empty;
      expect(data.data_salt).to.be.a('string').that.is.not.empty;
    });

    it('RP should remove data received from AS successfully', async function () {
      this.timeout(10000);
      const response = await yourDataRpApi.removeDataFromAS('rp1', {
        request_id: requestId,
      });
      expect(response.status).to.equal(204);
    });

    it('RP should have no saved data requested from AS left after removal', async function () {
      this.timeout(10000);
      const response = await yourDataRpApi.getDataFromAS('rp1', {
        requestId,
      });
      expect(response.status).to.equal(404);
    });

    it('RP should have and able to get saved private messages', async function () {
      const response = await commonApi.getPrivateMessages('rp1', {
        request_id: requestId,
        skip_request_id_check: true,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.be.an('array').that.is.not.empty;
    });

    it('RP should remove saved private messages successfully', async function () {
      const response = await commonApi.removePrivateMessages('rp1', {
        request_id: requestId,
      });
      expect(response.status).to.equal(204);
    });

    it('RP should have no saved private messages left after removal', async function () {
      const response = await commonApi.getPrivateMessages('rp1', {
        request_id: requestId,
        skip_request_id_check: true,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.be.an('array').that.is.empty;
    });

    it('AS should have and able to get saved private messages', async function () {
      const response = await commonApi.getPrivateMessages('as1', {
        request_id: requestId,
        skip_request_id_check: true,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.be.an('array').that.is.not.empty;
    });

    it('AS should remove saved private messages successfully', async function () {
      const response = await commonApi.removePrivateMessages('as1', {
        request_id: requestId,
      });
      expect(response.status).to.equal(204);
    });

    it('AS should have no saved private messages left after removal', async function () {
      const response = await commonApi.getPrivateMessages('as1', {
        request_id: requestId,
        skip_request_id_check: true,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.be.an('array').that.is.empty;
    });

    after(async function () {
      this.timeout(10000);

      await apiHelpers.getResponseAndBody(
        ndidApi.disableDomainNodeWhitelist('ndid1', {
          domain,
        })
      );

      await apiHelpers.getResponseAndBody(
        ndidApi.removeNodeFromDomainNodeWhitelist('ndid1', {
          domain,
          node_id: rpNodeId,
        })
      );
      await apiHelpers.getResponseAndBody(
        ndidApi.removeNodeFromDomainNodeWhitelist('ndid1', {
          domain,
          node_id: asNodeId,
        })
      );

      await apiHelpers.getResponseAndBody(
        ndidApi.disableServiceRequesterNodeWhitelist('ndid1', {
          service_id: preConsentServiceId,
        })
      );

      await apiHelpers.getResponseAndBody(
        ndidApi.removeNodeFromServiceRequesterNodeWhitelist('ndid1', {
          service_id: preConsentServiceId,
          node_id: rpNodeId,
        })
      );
      await apiHelpers.getResponseAndBody(
        ndidApi.removeNodeFromServiceRequesterNodeWhitelist('ndid1', {
          service_id: preConsentServiceId,
          node_id: asNodeId,
        })
      );

      rpEventEmitter.removeAllListeners('callback');
      as1EventEmitter.removeAllListeners('callback');
    });
  });
});
