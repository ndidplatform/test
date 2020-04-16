import { expect } from 'chai';

import * as rpApi from '../../../api/v4/rp'; //v4

import * as idpApi from '../../../api/v5/idp'; // v5

import * as commonApi from '../../../api/common';
import {
  rpEventEmitter,
  idp1EventEmitter,
  idp2EventEmitter,
} from '../../../callback_server';
import * as db from '../../../db';
import {
  createEventPromise,
  generateReferenceId,
  hash,
  wait,
} from '../../../utils';
import * as config from '../../../config';
import { eventEmitter as nodeCallbackEventEmitter } from '../../../callback_server/node';
import {} from '../_fragments/request_flow_fragments/idp';
import { receiveMessagequeueSendSuccessCallback } from '../_fragments/common';

describe('RP callback api version v4 create request to IdP with callback api version v5', function () {
  describe('Idp (v5) accept request test', function () {
    let namespace;
    let identifier;

    const rpReferenceId = generateReferenceId();
    const idpReferenceId = generateReferenceId();

    const createRequestResultPromise = createEventPromise(); // RP
    const requestStatusPendingPromise = createEventPromise(); // RP
    const incomingRequestPromise = createEventPromise(); // IDP
    const responseResultPromise = createEventPromise(); // IDP
    const requestStatusConfirmedPromise = createEventPromise(); // RP
    const requestStatusSignedDataPromise = createEventPromise(); // RP
    const requestStatusCompletedPromise = createEventPromise(); // RP
    const requestClosedPromise = createEventPromise(); // RP

    const mqSendSuccessRpToIdpCallbackPromise = createEventPromise();
    const mqSendSuccessRpToAsCallbackPromise = createEventPromise();
    const mqSendSuccessIdpToRpCallbackPromise = createEventPromise();
    const mqSendSuccessAsToRpCallbackPromise = createEventPromise();

    let createRequestParams;

    const data = JSON.stringify({
      test: 'test',
      withEscapedChar: 'test|fff||ss\\|NN\\\\|',
      arr: [1, 2, 3],
    });

    let requestId;
    let initialSalt;

    const requestStatusUpdates = [];
    let idpResponseParams = [];
    let lastStatusUpdateBlockHeight;

    before(function () {
      namespace = 'citizen_id';
      identifier = '01234567890123';

      createRequestParams = {
        reference_id: rpReferenceId,
        callback_url: config.RP_CALLBACK_URL,
        mode: 1,
        namespace,
        identifier,
        idp_id_list: ['idp1'],
        data_request_list: [],
        request_message: 'Test request message',
        min_ial: 1.1,
        min_aal: 1,
        min_idp: 1,
        request_timeout: 86400,
        bypass_identity_check: false,
      };

      // callback v4
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
            if (callbackData.service_list[0].signed_data_count === 1) {
              requestStatusSignedDataPromise.resolve(callbackData);
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
        }
      });

      nodeCallbackEventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'message_queue_send_success' &&
          callbackData.request_id === requestId
        ) {
          if (callbackData.node_id === 'rp1') {
            if (callbackData.destination_node_id === 'idp1') {
              mqSendSuccessRpToIdpCallbackPromise.resolve(callbackData);
            } else if (callbackData.destination_node_id === 'as1') {
              mqSendSuccessRpToAsCallbackPromise.resolve(callbackData);
            }
          } else if (callbackData.node_id === 'idp1') {
            if (callbackData.destination_node_id === 'rp1') {
              mqSendSuccessIdpToRpCallbackPromise.resolve(callbackData);
            }
          } else if (callbackData.node_id === 'as1') {
            if (callbackData.destination_node_id === 'rp1') {
              mqSendSuccessAsToRpCallbackPromise.resolve(callbackData);
            }
          }
        }
      });
    });

    it('RP should set config callback api version v4 successfully', async function () {
      this.timeout(15000);

      const response = await commonApi.setConfig('rp1', {
        CALLBACK_API_VERSION: 4,
      });

      const responseBody = await response.json();
      expect(responseBody.callbackApiVersion).to.equal(4);

      await wait(3000);

      const responseGetConfig = await commonApi.getConfig('rp1');
      const responseBodyGetConfig = await responseGetConfig.json();
      expect(responseBodyGetConfig.callbackApiVersion).to.equal(4);
    });

    it('RP should create a request successfully', async function () {
      this.timeout(10000);
      const response = await rpApi.createRequest('rp1', createRequestParams);
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

      requestId = responseBody.request_id;
      initialSalt = responseBody.initial_salt;

      const createRequestResult = await createRequestResultPromise.promise;
      expect(createRequestResult.success).to.equal(true);
      expect(createRequestResult.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = createRequestResult.creation_block_height.split(
        ':',
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
      lastStatusUpdateBlockHeight = parseInt(splittedCreationBlockHeight[1]);
    });

    it('RP should receive pending request status (v4)', async function () {
      this.timeout(20000);
      const requestStatus = await requestStatusPendingPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: requestId,
        status: 'pending',
        mode: createRequestParams.mode,
        min_idp: createRequestParams.min_idp,
        answered_idp_count: 0,
        closed: false,
        timed_out: false,
        service_list: [],
        response_valid_list: [],
      });
      expect(requestStatus).to.have.property('block_height');
      expect(requestStatus.block_height).is.a('string');
      const splittedBlockHeight = requestStatus.block_height.split(':');
      expect(splittedBlockHeight).to.have.lengthOf(2);
      expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('RP should receive message queue send success (To idp1) callback', async function () {
      this.timeout(15000);
      await receiveMessagequeueSendSuccessCallback({
        nodeId: 'rp1',
        requestId,
        mqSendSuccessCallbackPromise: mqSendSuccessRpToIdpCallbackPromise,
        destinationNodeId: 'idp1',
      });
    });

    it('IdP should receive incoming request callback', async function () {
      this.timeout(15000);
      const incomingRequest = await incomingRequestPromise.promise;

      const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
        (dataRequest) => {
          const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
          return {
            ...dataRequestWithoutParams,
          };
        },
      );
      expect(incomingRequest).to.deep.include({
        mode: createRequestParams.mode,
        request_id: requestId,
        request_message: createRequestParams.request_message,
        request_message_hash: hash(
          createRequestParams.request_message +
            incomingRequest.request_message_salt,
        ),
        requester_node_id: 'rp1',
        min_ial: createRequestParams.min_ial,
        min_aal: createRequestParams.min_aal,
        data_request_list: dataRequestListWithoutParams,
        request_timeout: createRequestParams.request_timeout,
      });
      expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
        .empty;
      expect(incomingRequest.creation_time).to.be.a('number');
      expect(incomingRequest.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
        ':',
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('IdP should create response (accept) successfully', async function () {
      this.timeout(10000);

      let idpResponse = {
        reference_id: idpReferenceId,
        callback_url: config.IDP1_CALLBACK_URL,
        request_id: requestId,
        ial: 2.3,
        aal: 3,
        status: 'accept',
        signature: 'some-signature',
      };

      idpResponseParams.push({
        ...idpResponse,
        idp_id: 'idp1',
        valid_signature: null,
        valid_ial: null,
      });

      const response = await idpApi.createResponse('idp1', idpResponse);
      expect(response.status).to.equal(202);
    });

    it('IdP shoud receive callback create response result with success = true', async function () {
      const responseResult = await responseResultPromise.promise;
      expect(responseResult).to.deep.include({
        node_id: 'idp1',
        type: 'response_result',
        reference_id: idpReferenceId,
        request_id: requestId,
        success: true,
      });
    });

    it('IdP should receive message queue send success (To rp1) callback', async function () {
      this.timeout(15000);
      await receiveMessagequeueSendSuccessCallback({
        nodeId: 'idp1',
        requestId,
        mqSendSuccessCallbackPromise: mqSendSuccessIdpToRpCallbackPromise,
        destinationNodeId: 'rp1',
      });
    });

    it('RP should receive completed request status', async function () {
      this.timeout(25000);
      const requestStatus = await requestStatusCompletedPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: requestId,
        status: 'completed',
        mode: createRequestParams.mode,
        min_idp: createRequestParams.min_idp,
        answered_idp_count: 1,
        closed: false,
        timed_out: false,
        service_list: [],
        response_valid_list: [
          {
            idp_id: 'idp1',
            valid_signature: null,
            valid_ial: null,
          },
        ],
      });
      expect(requestStatus).to.have.property('block_height');
      expect(requestStatus.block_height).is.a('string');
      const splittedBlockHeight = requestStatus.block_height.split(':');
      expect(splittedBlockHeight).to.have.lengthOf(2);
      expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('RP should receive request closed status', async function () {
      this.timeout(20000);
      const requestStatus = await requestClosedPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: requestId,
        status: 'completed',
        mode: createRequestParams.mode,
        min_idp: createRequestParams.min_idp,
        answered_idp_count: 1,
        closed: true,
        timed_out: false,
        service_list: [],
        response_valid_list: [
          {
            idp_id: 'idp1',
            valid_signature: null,
            valid_ial: null,
          },
        ],
      });
      expect(requestStatus).to.have.property('block_height');
      expect(requestStatus.block_height).is.a('string');
      const splittedBlockHeight = requestStatus.block_height.split(':');
      expect(splittedBlockHeight).to.have.lengthOf(2);
      expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    after(function () {
      rpEventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
      nodeCallbackEventEmitter.removeAllListeners('callback');
    });
  });

  describe('Idp (v5) reject request test', function () {
    let namespace;
    let identifier;

    const rpReferenceId = generateReferenceId();
    const idpReferenceId = generateReferenceId();

    const createRequestResultPromise = createEventPromise(); // RP
    const requestStatusPendingPromise = createEventPromise(); // RP
    const incomingRequestPromise = createEventPromise(); // IDP
    const responseResultPromise = createEventPromise(); // IDP
    const requestStatusConfirmedPromise = createEventPromise(); // RP
    const requestStatusSignedDataPromise = createEventPromise(); // RP
    const requestStatusRejectPromise = createEventPromise(); // RP
    const requestClosedPromise = createEventPromise(); // RP

    const mqSendSuccessRpToIdpCallbackPromise = createEventPromise();
    const mqSendSuccessRpToAsCallbackPromise = createEventPromise();
    const mqSendSuccessIdpToRpCallbackPromise = createEventPromise();
    const mqSendSuccessAsToRpCallbackPromise = createEventPromise();

    let createRequestParams;

    const data = JSON.stringify({
      test: 'test',
      withEscapedChar: 'test|fff||ss\\|NN\\\\|',
      arr: [1, 2, 3],
    });

    let requestId;
    let initialSalt;

    const requestStatusUpdates = [];
    let idpResponseParams = [];
    let lastStatusUpdateBlockHeight;

    before(function () {
      namespace = 'citizen_id';
      identifier = '01234567890123';

      createRequestParams = {
        reference_id: rpReferenceId,
        callback_url: config.RP_CALLBACK_URL,
        mode: 1,
        namespace,
        identifier,
        idp_id_list: ['idp1'],
        data_request_list: [],
        request_message: 'Test request message',
        min_ial: 1.1,
        min_aal: 1,
        min_idp: 1,
        request_timeout: 86400,
        bypass_identity_check: false,
      };

      // callback v4
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
            if (callbackData.service_list[0].signed_data_count === 1) {
              requestStatusSignedDataPromise.resolve(callbackData);
            } else {
              requestStatusConfirmedPromise.resolve(callbackData);
            }
          } else if (callbackData.status === 'rejected') {
            if (callbackData.closed) {
              requestClosedPromise.resolve(callbackData);
            } else {
              requestStatusRejectPromise.resolve(callbackData);
            }
          }
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
        }
      });

      nodeCallbackEventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'message_queue_send_success' &&
          callbackData.request_id === requestId
        ) {
          if (callbackData.node_id === 'rp1') {
            if (callbackData.destination_node_id === 'idp1') {
              mqSendSuccessRpToIdpCallbackPromise.resolve(callbackData);
            } else if (callbackData.destination_node_id === 'as1') {
              mqSendSuccessRpToAsCallbackPromise.resolve(callbackData);
            }
          } else if (callbackData.node_id === 'idp1') {
            if (callbackData.destination_node_id === 'rp1') {
              mqSendSuccessIdpToRpCallbackPromise.resolve(callbackData);
            }
          } else if (callbackData.node_id === 'as1') {
            if (callbackData.destination_node_id === 'rp1') {
              mqSendSuccessAsToRpCallbackPromise.resolve(callbackData);
            }
          }
        }
      });
    });

    it('RP should set config callback api version v4 successfully', async function () {
      this.timeout(15000);

      const response = await commonApi.setConfig('rp1', {
        CALLBACK_API_VERSION: 4,
      });

      const responseBody = await response.json();
      expect(responseBody.callbackApiVersion).to.equal(4);

      await wait(3000);

      const responseGetConfig = await commonApi.getConfig('rp1');
      const responseBodyGetConfig = await responseGetConfig.json();
      expect(responseBodyGetConfig.callbackApiVersion).to.equal(4);
    });

    it('RP should create a request successfully', async function () {
      this.timeout(10000);
      const response = await rpApi.createRequest('rp1', createRequestParams);
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

      requestId = responseBody.request_id;
      initialSalt = responseBody.initial_salt;

      const createRequestResult = await createRequestResultPromise.promise;
      expect(createRequestResult.success).to.equal(true);
      expect(createRequestResult.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = createRequestResult.creation_block_height.split(
        ':',
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
      lastStatusUpdateBlockHeight = parseInt(splittedCreationBlockHeight[1]);
    });

    it('RP should receive pending request status (v4)', async function () {
      this.timeout(20000);
      const requestStatus = await requestStatusPendingPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: requestId,
        status: 'pending',
        mode: createRequestParams.mode,
        min_idp: createRequestParams.min_idp,
        answered_idp_count: 0,
        closed: false,
        timed_out: false,
        service_list: [],
        response_valid_list: [],
      });
      expect(requestStatus).to.have.property('block_height');
      expect(requestStatus.block_height).is.a('string');
      const splittedBlockHeight = requestStatus.block_height.split(':');
      expect(splittedBlockHeight).to.have.lengthOf(2);
      expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('RP should receive message queue send success (To idp1) callback', async function () {
      this.timeout(15000);
      await receiveMessagequeueSendSuccessCallback({
        nodeId: 'rp1',
        requestId,
        mqSendSuccessCallbackPromise: mqSendSuccessRpToIdpCallbackPromise,
        destinationNodeId: 'idp1',
      });
    });

    it('IdP should receive incoming request callback', async function () {
      this.timeout(15000);
      const incomingRequest = await incomingRequestPromise.promise;

      const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
        (dataRequest) => {
          const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
          return {
            ...dataRequestWithoutParams,
          };
        },
      );
      expect(incomingRequest).to.deep.include({
        mode: createRequestParams.mode,
        request_id: requestId,
        request_message: createRequestParams.request_message,
        request_message_hash: hash(
          createRequestParams.request_message +
            incomingRequest.request_message_salt,
        ),
        requester_node_id: 'rp1',
        min_ial: createRequestParams.min_ial,
        min_aal: createRequestParams.min_aal,
        data_request_list: dataRequestListWithoutParams,
        request_timeout: createRequestParams.request_timeout,
      });
      expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
        .empty;
      expect(incomingRequest.creation_time).to.be.a('number');
      expect(incomingRequest.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
        ':',
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('IdP should create response (accept) successfully', async function () {
      this.timeout(10000);

      let idpResponse = {
        reference_id: idpReferenceId,
        callback_url: config.IDP1_CALLBACK_URL,
        request_id: requestId,
        ial: 2.3,
        aal: 3,
        status: 'reject',
        signature: 'some-signature',
      };

      const response = await idpApi.createResponse('idp1', idpResponse);
      expect(response.status).to.equal(202);
    });

    it('IdP shoud receive callback create response result with success = true', async function () {
      const responseResult = await responseResultPromise.promise;
      expect(responseResult).to.deep.include({
        node_id: 'idp1',
        type: 'response_result',
        reference_id: idpReferenceId,
        request_id: requestId,
        success: true,
      });
    });

    it('IdP should receive message queue send success (To rp1) callback', async function () {
      this.timeout(15000);
      await receiveMessagequeueSendSuccessCallback({
        nodeId: 'idp1',
        requestId,
        mqSendSuccessCallbackPromise: mqSendSuccessIdpToRpCallbackPromise,
        destinationNodeId: 'rp1',
      });
    });

    it('RP should receive rejected request status', async function () {
      this.timeout(25000);
      const requestStatus = await requestStatusRejectPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: requestId,
        status: 'rejected',
        mode: createRequestParams.mode,
        min_idp: createRequestParams.min_idp,
        answered_idp_count: 1,
        closed: false,
        timed_out: false,
        service_list: [],
        response_valid_list: [
          {
            idp_id: 'idp1',
            valid_signature: null,
            valid_ial: null,
          },
        ],
      });
      expect(requestStatus).to.have.property('block_height');
      expect(requestStatus.block_height).is.a('string');
      const splittedBlockHeight = requestStatus.block_height.split(':');
      expect(splittedBlockHeight).to.have.lengthOf(2);
      expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    });
    after(function () {
      rpEventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
      nodeCallbackEventEmitter.removeAllListeners('callback');
    });
  });

  describe('Idp (v5) error response request test', function () {
    let namespace;
    let identifier;

    const rpReferenceId = generateReferenceId();
    const idpReferenceId = generateReferenceId();

    const createRequestResultPromise = createEventPromise(); // RP
    const requestStatusPendingPromise = createEventPromise(); // RP
    const incomingRequestPromise = createEventPromise(); // IDP
    const responseResultPromise = createEventPromise(); // IDP
    const requestStatusConfirmedPromise = createEventPromise(); // RP
    const requestClosedPromise = createEventPromise(); // RP

    const mqSendSuccessRpToIdpCallbackPromise = createEventPromise();
    const mqSendSuccessRpToAsCallbackPromise = createEventPromise();
    const mqSendSuccessIdpToRpCallbackPromise = createEventPromise();
    const mqSendSuccessAsToRpCallbackPromise = createEventPromise();

    let createRequestParams;

    let requestId;
    let initialSalt;

    const requestStatusUpdates = [];
    let lastStatusUpdateBlockHeight;

    let idpResponseErrorCode = 1000;

    before(function () {
      namespace = 'citizen_id';
      identifier = '01234567890123';

      createRequestParams = {
        reference_id: rpReferenceId,
        callback_url: config.RP_CALLBACK_URL,
        mode: 1,
        namespace,
        identifier,
        idp_id_list: ['idp1'],
        data_request_list: [],
        request_message: 'Test request message',
        min_ial: 1.1,
        min_aal: 1,
        min_idp: 1,
        request_timeout: 86400,
        bypass_identity_check: false,
      };

      // callback v4
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
            if (callbackData.closed) {
              requestClosedPromise.resolve(callbackData);
            } else if (callbackData.answered_idp_count === 1) {
              requestStatusConfirmedPromise.resolve(callbackData);
            } else {
              requestStatusPendingPromise.resolve(callbackData);
            }
          }
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
        }
      });

      nodeCallbackEventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'message_queue_send_success' &&
          callbackData.request_id === requestId
        ) {
          if (callbackData.node_id === 'rp1') {
            if (callbackData.destination_node_id === 'idp1') {
              mqSendSuccessRpToIdpCallbackPromise.resolve(callbackData);
            } else if (callbackData.destination_node_id === 'as1') {
              mqSendSuccessRpToAsCallbackPromise.resolve(callbackData);
            }
          } else if (callbackData.node_id === 'idp1') {
            if (callbackData.destination_node_id === 'rp1') {
              mqSendSuccessIdpToRpCallbackPromise.resolve(callbackData);
            }
          } else if (callbackData.node_id === 'as1') {
            if (callbackData.destination_node_id === 'rp1') {
              mqSendSuccessAsToRpCallbackPromise.resolve(callbackData);
            }
          }
        }
      });
    });

    it('RP should set config callback api version v4 successfully', async function () {
      this.timeout(15000);

      const response = await commonApi.setConfig('rp1', {
        CALLBACK_API_VERSION: 4,
      });

      const responseBody = await response.json();
      expect(responseBody.callbackApiVersion).to.equal(4);

      await wait(3000);

      const responseGetConfig = await commonApi.getConfig('rp1');
      const responseBodyGetConfig = await responseGetConfig.json();
      expect(responseBodyGetConfig.callbackApiVersion).to.equal(4);
    });

    it('RP should create a request successfully', async function () {
      this.timeout(10000);
      const response = await rpApi.createRequest('rp1', createRequestParams);
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

      requestId = responseBody.request_id;
      initialSalt = responseBody.initial_salt;

      const createRequestResult = await createRequestResultPromise.promise;
      expect(createRequestResult.success).to.equal(true);
      expect(createRequestResult.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = createRequestResult.creation_block_height.split(
        ':',
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
      lastStatusUpdateBlockHeight = parseInt(splittedCreationBlockHeight[1]);
    });

    it('RP should receive pending request status (v4)', async function () {
      this.timeout(20000);
      const requestStatus = await requestStatusPendingPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: requestId,
        status: 'pending',
        mode: createRequestParams.mode,
        min_idp: createRequestParams.min_idp,
        answered_idp_count: 0,
        closed: false,
        timed_out: false,
        service_list: [],
        response_valid_list: [],
      });
      expect(requestStatus).to.have.property('block_height');
      expect(requestStatus.block_height).is.a('string');
      const splittedBlockHeight = requestStatus.block_height.split(':');
      expect(splittedBlockHeight).to.have.lengthOf(2);
      expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('RP should receive message queue send success (To idp1) callback', async function () {
      this.timeout(15000);
      await receiveMessagequeueSendSuccessCallback({
        nodeId: 'rp1',
        requestId,
        mqSendSuccessCallbackPromise: mqSendSuccessRpToIdpCallbackPromise,
        destinationNodeId: 'idp1',
      });
    });

    it('IdP should receive incoming request callback', async function () {
      this.timeout(15000);
      const incomingRequest = await incomingRequestPromise.promise;

      const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
        (dataRequest) => {
          const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
          return {
            ...dataRequestWithoutParams,
          };
        },
      );
      expect(incomingRequest).to.deep.include({
        mode: createRequestParams.mode,
        request_id: requestId,
        request_message: createRequestParams.request_message,
        request_message_hash: hash(
          createRequestParams.request_message +
            incomingRequest.request_message_salt,
        ),
        requester_node_id: 'rp1',
        min_ial: createRequestParams.min_ial,
        min_aal: createRequestParams.min_aal,
        data_request_list: dataRequestListWithoutParams,
        request_timeout: createRequestParams.request_timeout,
      });
      expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
        .empty;
      expect(incomingRequest.creation_time).to.be.a('number');
      expect(incomingRequest.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
        ':',
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('IdP should create response (error) successfully', async function () {
      this.timeout(10000);

      let idpResponse = {
        reference_id: idpReferenceId,
        callback_url: config.IDP1_CALLBACK_URL,
        request_id: requestId,
        error_code: idpResponseErrorCode,
      };
      const response = await idpApi.createErrorResponse('idp1', idpResponse);
      expect(response.status).to.equal(202);
    });

    it('IdP shoud receive callback create response result with success = true', async function () {
      const responseResult = await responseResultPromise.promise;
      expect(responseResult).to.deep.include({
        node_id: 'idp1',
        type: 'response_result',
        reference_id: idpReferenceId,
        request_id: requestId,
        success: true,
      });
    });

    it('IdP should receive message queue send success (To rp1) callback', async function () {
      this.timeout(15000);
      await receiveMessagequeueSendSuccessCallback({
        nodeId: 'idp1',
        requestId,
        mqSendSuccessCallbackPromise: mqSendSuccessIdpToRpCallbackPromise,
        destinationNodeId: 'rp1',
      });
    });

    it('RP should receive pending and answered_idp_count = 1 request status ', async function () {
      this.timeout(25000);
      const requestStatus = await requestStatusConfirmedPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: requestId,
        status: 'pending',
        mode: createRequestParams.mode,
        min_idp: createRequestParams.min_idp,
        answered_idp_count: 1,
        closed: false,
        timed_out: false,
        service_list: [],
        response_valid_list: [
          {
            idp_id: 'idp1',
            valid_signature: null,
            valid_ial: null,
          },
        ],
      });
      expect(requestStatus).to.have.property('block_height');
      expect(requestStatus.block_height).is.a('string');
      const splittedBlockHeight = requestStatus.block_height.split(':');
      expect(splittedBlockHeight).to.have.lengthOf(2);
      expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('RP should receive pending and closed request status', async function () {
      this.timeout(25000);
      const requestStatus = await requestClosedPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: requestId,
        status: 'pending',
        mode: createRequestParams.mode,
        min_idp: createRequestParams.min_idp,
        answered_idp_count: 1,
        closed: true,
        timed_out: false,
        service_list: [],
        response_valid_list: [
          {
            idp_id: 'idp1',
            valid_signature: null,
            valid_ial: null,
          },
        ],
      });
      expect(requestStatus).to.have.property('block_height');
      expect(requestStatus.block_height).is.a('string');
      const splittedBlockHeight = requestStatus.block_height.split(':');
      expect(splittedBlockHeight).to.have.lengthOf(2);
      expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    });
    after(function () {
      rpEventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
      nodeCallbackEventEmitter.removeAllListeners('callback');
    });
  });

  describe('Idp (v5) min_idp = 1 to 2 IdPs, 1st IdP error response and 2nd IdP accept request test', function () {
    let namespace;
    let identifier;

    const rpReferenceId = generateReferenceId();
    const idpReferenceId = generateReferenceId();
    const idp2ReferenceId = generateReferenceId();

    const createRequestResultPromise = createEventPromise(); // RP
    const requestStatusPendingPromise = createEventPromise(); // RP
    const requestStatusErroredPromise = createEventPromise();

    const incomingRequestPromise = createEventPromise(); // IDP
    const responseResultPromise = createEventPromise(); // IDP

    const incomingRequestPromise2 = createEventPromise(); // IDP2
    const responseResultPromise2 = createEventPromise(); // IDP2

    const requestStatusConfirmedPromise = createEventPromise(); // RP
    const requestClosedPromise = createEventPromise(); // RP

    const mqSendSuccessRpToIdpCallbackPromise = createEventPromise();
    const mqSendSuccessRpToAsCallbackPromise = createEventPromise();
    const mqSendSuccessIdpToRpCallbackPromise = createEventPromise();
    const mqSendSuccessAsToRpCallbackPromise = createEventPromise();

    let createRequestParams;

    let requestId;
    let initialSalt;

    const requestStatusUpdates = [];
    let lastStatusUpdateBlockHeight;

    let idpResponseErrorCode = 1000;

    before(function () {
      namespace = 'citizen_id';
      identifier = '01234567890123';

      createRequestParams = {
        reference_id: rpReferenceId,
        callback_url: config.RP_CALLBACK_URL,
        mode: 1,
        namespace,
        identifier,
        idp_id_list: ['idp1', 'idp2'],
        data_request_list: [],
        request_message: 'Test request message',
        min_ial: 1.1,
        min_aal: 1,
        min_idp: 1,
        request_timeout: 86400,
        bypass_identity_check: false,
      };

      // callback v4
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
            if (callbackData.answered_idp_count === 1) {
              requestStatusErroredPromise.resolve(callbackData);
            } else {
              requestStatusPendingPromise.resolve(callbackData);
            }
          } else if (callbackData.status === 'completed') {
            if (callbackData.closed) {
              requestClosedPromise.resolve(callbackData);
            } else {
              requestStatusConfirmedPromise.resolve(callbackData);
            }
          }
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
        }
      });

      idp2EventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'incoming_request' &&
          callbackData.request_id === requestId
        ) {
          incomingRequestPromise2.resolve(callbackData);
        } else if (
          callbackData.type === 'response_result' &&
          callbackData.reference_id === idp2ReferenceId
        ) {
          responseResultPromise2.resolve(callbackData);
        }
      });

      nodeCallbackEventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'message_queue_send_success' &&
          callbackData.request_id === requestId
        ) {
          if (callbackData.node_id === 'rp1') {
            if (callbackData.destination_node_id === 'idp1') {
              mqSendSuccessRpToIdpCallbackPromise.resolve(callbackData);
            } else if (callbackData.destination_node_id === 'as1') {
              mqSendSuccessRpToAsCallbackPromise.resolve(callbackData);
            }
          } else if (callbackData.node_id === 'idp1') {
            if (callbackData.destination_node_id === 'rp1') {
              mqSendSuccessIdpToRpCallbackPromise.resolve(callbackData);
            }
          } else if (callbackData.node_id === 'as1') {
            if (callbackData.destination_node_id === 'rp1') {
              mqSendSuccessAsToRpCallbackPromise.resolve(callbackData);
            }
          }
        }
      });
    });

    it('RP should set config callback api version v4 successfully', async function () {
      this.timeout(15000);

      const response = await commonApi.setConfig('rp1', {
        CALLBACK_API_VERSION: 4,
      });

      const responseBody = await response.json();
      expect(responseBody.callbackApiVersion).to.equal(4);

      await wait(3000);

      const responseGetConfig = await commonApi.getConfig('rp1');
      const responseBodyGetConfig = await responseGetConfig.json();
      expect(responseBodyGetConfig.callbackApiVersion).to.equal(4);
    });

    it('RP should create a request successfully', async function () {
      this.timeout(10000);
      const response = await rpApi.createRequest('rp1', createRequestParams);
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

      requestId = responseBody.request_id;
      initialSalt = responseBody.initial_salt;

      const createRequestResult = await createRequestResultPromise.promise;
      expect(createRequestResult.success).to.equal(true);
      expect(createRequestResult.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = createRequestResult.creation_block_height.split(
        ':',
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
      lastStatusUpdateBlockHeight = parseInt(splittedCreationBlockHeight[1]);
    });

    it('RP should receive pending request status (v4)', async function () {
      this.timeout(20000);
      const requestStatus = await requestStatusPendingPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: requestId,
        status: 'pending',
        mode: createRequestParams.mode,
        min_idp: createRequestParams.min_idp,
        answered_idp_count: 0,
        closed: false,
        timed_out: false,
        service_list: [],
        response_valid_list: [],
      });
      expect(requestStatus).to.have.property('block_height');
      expect(requestStatus.block_height).is.a('string');
      const splittedBlockHeight = requestStatus.block_height.split(':');
      expect(splittedBlockHeight).to.have.lengthOf(2);
      expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('RP should receive message queue send success (To idp1) callback', async function () {
      this.timeout(15000);
      await receiveMessagequeueSendSuccessCallback({
        nodeId: 'rp1',
        requestId,
        mqSendSuccessCallbackPromise: mqSendSuccessRpToIdpCallbackPromise,
        destinationNodeId: 'idp1',
      });
    });

    it('IdP (idp1) should receive incoming request callback', async function () {
      this.timeout(15000);
      const incomingRequest = await incomingRequestPromise.promise;

      const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
        (dataRequest) => {
          const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
          return {
            ...dataRequestWithoutParams,
          };
        },
      );
      expect(incomingRequest).to.deep.include({
        mode: createRequestParams.mode,
        request_id: requestId,
        request_message: createRequestParams.request_message,
        request_message_hash: hash(
          createRequestParams.request_message +
            incomingRequest.request_message_salt,
        ),
        requester_node_id: 'rp1',
        min_ial: createRequestParams.min_ial,
        min_aal: createRequestParams.min_aal,
        data_request_list: dataRequestListWithoutParams,
        request_timeout: createRequestParams.request_timeout,
      });
      expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
        .empty;
      expect(incomingRequest.creation_time).to.be.a('number');
      expect(incomingRequest.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
        ':',
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('IdP (idp2) should receive incoming request callback', async function () {
      this.timeout(15000);
      const incomingRequest = await incomingRequestPromise2.promise;

      const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
        (dataRequest) => {
          const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
          return {
            ...dataRequestWithoutParams,
          };
        },
      );
      expect(incomingRequest).to.deep.include({
        mode: createRequestParams.mode,
        request_id: requestId,
        request_message: createRequestParams.request_message,
        request_message_hash: hash(
          createRequestParams.request_message +
            incomingRequest.request_message_salt,
        ),
        requester_node_id: 'rp1',
        min_ial: createRequestParams.min_ial,
        min_aal: createRequestParams.min_aal,
        data_request_list: dataRequestListWithoutParams,
        request_timeout: createRequestParams.request_timeout,
      });
      expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
        .empty;
      expect(incomingRequest.creation_time).to.be.a('number');
      expect(incomingRequest.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
        ':',
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('IdP (idp1) should create response (error) successfully', async function () {
      this.timeout(10000);

      let idpResponse = {
        reference_id: idpReferenceId,
        callback_url: config.IDP1_CALLBACK_URL,
        request_id: requestId,
        error_code: idpResponseErrorCode,
      };
      const response = await idpApi.createErrorResponse('idp1', idpResponse);
      expect(response.status).to.equal(202);
    });

    it('IdP (idp1) shoud receive callback create response result with success = true', async function () {
      const responseResult = await responseResultPromise.promise;
      expect(responseResult).to.deep.include({
        node_id: 'idp1',
        type: 'response_result',
        reference_id: idpReferenceId,
        request_id: requestId,
        success: true,
      });
    });

    it('IdP should receive message queue send success (To rp1) callback', async function () {
      this.timeout(15000);
      await receiveMessagequeueSendSuccessCallback({
        nodeId: 'idp1',
        requestId,
        mqSendSuccessCallbackPromise: mqSendSuccessIdpToRpCallbackPromise,
        destinationNodeId: 'rp1',
      });
    });

    it('RP should receive pending and answered_idp_count = 1 request status ', async function () {
      this.timeout(25000);
      const requestStatus = await requestStatusErroredPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: requestId,
        status: 'pending',
        mode: createRequestParams.mode,
        min_idp: createRequestParams.min_idp,
        answered_idp_count: 1,
        closed: false,
        timed_out: false,
        service_list: [],
        response_valid_list: [
          {
            idp_id: 'idp1',
            valid_signature: null,
            valid_ial: null,
          },
        ],
      });
      expect(requestStatus).to.have.property('block_height');
      expect(requestStatus.block_height).is.a('string');
      const splittedBlockHeight = requestStatus.block_height.split(':');
      expect(splittedBlockHeight).to.have.lengthOf(2);
      expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('IdP (idp2) should create response (accept) successfully', async function () {
      this.timeout(10000);

      let idpResponse = {
        reference_id: idp2ReferenceId,
        callback_url: config.IDP2_CALLBACK_URL,
        request_id: requestId,
        ial: 2.3,
        aal: 3,
        status: 'accept',
        signature: 'some-signature',
      };

      const response = await idpApi.createResponse('idp2', idpResponse);
      expect(response.status).to.equal(202);
    });

    it('IdP (idp2) shoud receive callback create response result with success = true', async function () {
      const responseResult = await responseResultPromise2.promise;
      expect(responseResult).to.deep.include({
        node_id: 'idp2',
        type: 'response_result',
        reference_id: idp2ReferenceId,
        request_id: requestId,
        success: true,
      });
    });

    it('RP should receive completed request status ', async function () {
      this.timeout(25000);
      const requestStatus = await requestStatusConfirmedPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: requestId,
        status: 'completed',
        mode: createRequestParams.mode,
        min_idp: createRequestParams.min_idp,
        answered_idp_count: 2,
        closed: false,
        timed_out: false,
        service_list: [],
        response_valid_list: [
          {
            idp_id: 'idp1',
            valid_signature: null,
            valid_ial: null,
          },
          {
            idp_id: 'idp2',
            valid_signature: null,
            valid_ial: null,
          },
        ],
      });
      expect(requestStatus).to.have.property('block_height');
      expect(requestStatus.block_height).is.a('string');
      const splittedBlockHeight = requestStatus.block_height.split(':');
      expect(splittedBlockHeight).to.have.lengthOf(2);
      expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('RP should receive completed and closed request status', async function () {
      this.timeout(25000);
      const requestStatus = await requestClosedPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: requestId,
        status: 'completed',
        mode: createRequestParams.mode,
        min_idp: createRequestParams.min_idp,
        answered_idp_count: 2,
        closed: true,
        timed_out: false,
        service_list: [],
        response_valid_list: [
          {
            idp_id: 'idp1',
            valid_signature: null,
            valid_ial: null,
          },
          {
            idp_id: 'idp2',
            valid_signature: null,
            valid_ial: null,
          },
        ],
      });
      expect(requestStatus).to.have.property('block_height');
      expect(requestStatus.block_height).is.a('string');
      const splittedBlockHeight = requestStatus.block_height.split(':');
      expect(splittedBlockHeight).to.have.lengthOf(2);
      expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    });
    after(function () {
      rpEventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
      nodeCallbackEventEmitter.removeAllListeners('callback');
    });
  });

  describe('Idp (v5) min_idp = 2 to 2 IdPs, 1st IdP accept and 2nd error response test', function () {
    let namespace;
    let identifier;

    const rpReferenceId = generateReferenceId();
    const idpReferenceId = generateReferenceId();
    const idp2ReferenceId = generateReferenceId();

    const createRequestResultPromise = createEventPromise(); // RP
    const requestStatusPendingPromise = createEventPromise(); // RP
    const requestStatusErroredPromise = createEventPromise();

    const incomingRequestPromise = createEventPromise(); // IDP
    const responseResultPromise = createEventPromise(); // IDP

    const incomingRequestPromise2 = createEventPromise(); // IDP2
    const responseResultPromise2 = createEventPromise(); // IDP2

    const requestStatusConfirmedPromise = createEventPromise(); // RP
    const requestClosedPromise = createEventPromise(); // RP

    const mqSendSuccessRpToIdpCallbackPromise = createEventPromise();
    const mqSendSuccessRpToAsCallbackPromise = createEventPromise();
    const mqSendSuccessIdpToRpCallbackPromise = createEventPromise();
    const mqSendSuccessAsToRpCallbackPromise = createEventPromise();

    let createRequestParams;

    let requestId;
    let initialSalt;

    const requestStatusUpdates = [];
    let lastStatusUpdateBlockHeight;

    let idpResponseErrorCode = 1000;

    before(function () {
      namespace = 'citizen_id';
      identifier = '01234567890123';

      createRequestParams = {
        reference_id: rpReferenceId,
        callback_url: config.RP_CALLBACK_URL,
        mode: 1,
        namespace,
        identifier,
        idp_id_list: ['idp1', 'idp2'],
        data_request_list: [],
        request_message: 'Test request message',
        min_ial: 1.1,
        min_aal: 1,
        min_idp: 2,
        request_timeout: 86400,
        bypass_identity_check: false,
      };

      // callback v4
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
            if (callbackData.closed) {
              requestClosedPromise.resolve(callbackData);
            } else if (callbackData.answered_idp_count === 2) {
              requestStatusErroredPromise.resolve(callbackData);
            } else {
              requestStatusConfirmedPromise.resolve(callbackData);
            }
          }
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
        }
      });

      idp2EventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'incoming_request' &&
          callbackData.request_id === requestId
        ) {
          incomingRequestPromise2.resolve(callbackData);
        } else if (
          callbackData.type === 'response_result' &&
          callbackData.reference_id === idp2ReferenceId
        ) {
          responseResultPromise2.resolve(callbackData);
        }
      });

      nodeCallbackEventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'message_queue_send_success' &&
          callbackData.request_id === requestId
        ) {
          if (callbackData.node_id === 'rp1') {
            if (callbackData.destination_node_id === 'idp1') {
              mqSendSuccessRpToIdpCallbackPromise.resolve(callbackData);
            } else if (callbackData.destination_node_id === 'as1') {
              mqSendSuccessRpToAsCallbackPromise.resolve(callbackData);
            }
          } else if (callbackData.node_id === 'idp1') {
            if (callbackData.destination_node_id === 'rp1') {
              mqSendSuccessIdpToRpCallbackPromise.resolve(callbackData);
            }
          } else if (callbackData.node_id === 'as1') {
            if (callbackData.destination_node_id === 'rp1') {
              mqSendSuccessAsToRpCallbackPromise.resolve(callbackData);
            }
          }
        }
      });
    });

    it('RP should set config callback api version v4 successfully', async function () {
      this.timeout(15000);

      const response = await commonApi.setConfig('rp1', {
        CALLBACK_API_VERSION: 4,
      });

      const responseBody = await response.json();
      expect(responseBody.callbackApiVersion).to.equal(4);

      await wait(3000);

      const responseGetConfig = await commonApi.getConfig('rp1');
      const responseBodyGetConfig = await responseGetConfig.json();
      expect(responseBodyGetConfig.callbackApiVersion).to.equal(4);
    });

    it('RP should create a request successfully', async function () {
      this.timeout(10000);
      const response = await rpApi.createRequest('rp1', createRequestParams);
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

      requestId = responseBody.request_id;
      initialSalt = responseBody.initial_salt;

      const createRequestResult = await createRequestResultPromise.promise;
      expect(createRequestResult.success).to.equal(true);
      expect(createRequestResult.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = createRequestResult.creation_block_height.split(
        ':',
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
      lastStatusUpdateBlockHeight = parseInt(splittedCreationBlockHeight[1]);
    });

    it('RP should receive pending request status (v4)', async function () {
      this.timeout(20000);
      const requestStatus = await requestStatusPendingPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: requestId,
        status: 'pending',
        mode: createRequestParams.mode,
        min_idp: createRequestParams.min_idp,
        answered_idp_count: 0,
        closed: false,
        timed_out: false,
        service_list: [],
        response_valid_list: [],
      });
      expect(requestStatus).to.have.property('block_height');
      expect(requestStatus.block_height).is.a('string');
      const splittedBlockHeight = requestStatus.block_height.split(':');
      expect(splittedBlockHeight).to.have.lengthOf(2);
      expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('RP should receive message queue send success (To idp1) callback', async function () {
      this.timeout(15000);
      await receiveMessagequeueSendSuccessCallback({
        nodeId: 'rp1',
        requestId,
        mqSendSuccessCallbackPromise: mqSendSuccessRpToIdpCallbackPromise,
        destinationNodeId: 'idp1',
      });
    });

    it('IdP (idp1) should receive incoming request callback', async function () {
      this.timeout(15000);
      const incomingRequest = await incomingRequestPromise.promise;

      const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
        (dataRequest) => {
          const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
          return {
            ...dataRequestWithoutParams,
          };
        },
      );
      expect(incomingRequest).to.deep.include({
        mode: createRequestParams.mode,
        request_id: requestId,
        request_message: createRequestParams.request_message,
        request_message_hash: hash(
          createRequestParams.request_message +
            incomingRequest.request_message_salt,
        ),
        requester_node_id: 'rp1',
        min_ial: createRequestParams.min_ial,
        min_aal: createRequestParams.min_aal,
        data_request_list: dataRequestListWithoutParams,
        request_timeout: createRequestParams.request_timeout,
      });
      expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
        .empty;
      expect(incomingRequest.creation_time).to.be.a('number');
      expect(incomingRequest.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
        ':',
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('IdP (idp2) should receive incoming request callback', async function () {
      this.timeout(15000);
      const incomingRequest = await incomingRequestPromise2.promise;

      const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
        (dataRequest) => {
          const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
          return {
            ...dataRequestWithoutParams,
          };
        },
      );
      expect(incomingRequest).to.deep.include({
        mode: createRequestParams.mode,
        request_id: requestId,
        request_message: createRequestParams.request_message,
        request_message_hash: hash(
          createRequestParams.request_message +
            incomingRequest.request_message_salt,
        ),
        requester_node_id: 'rp1',
        min_ial: createRequestParams.min_ial,
        min_aal: createRequestParams.min_aal,
        data_request_list: dataRequestListWithoutParams,
        request_timeout: createRequestParams.request_timeout,
      });
      expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
        .empty;
      expect(incomingRequest.creation_time).to.be.a('number');
      expect(incomingRequest.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
        ':',
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('IdP (idp1) should create response (error) successfully', async function () {
      this.timeout(10000);

      let idpResponse = {
        reference_id: idpReferenceId,
        callback_url: config.IDP1_CALLBACK_URL,
        request_id: requestId,
        ial: 2.3,
        aal: 3,
        status: 'accept',
        signature: 'some-signature',
      };

      const response = await idpApi.createResponse('idp1', idpResponse);
      expect(response.status).to.equal(202);
    });

    it('IdP (idp1) shoud receive callback create response result with success = true', async function () {
      const responseResult = await responseResultPromise.promise;
      expect(responseResult).to.deep.include({
        node_id: 'idp1',
        type: 'response_result',
        reference_id: idpReferenceId,
        request_id: requestId,
        success: true,
      });
    });

    it('IdP should receive message queue send success (To rp1) callback', async function () {
      this.timeout(15000);
      await receiveMessagequeueSendSuccessCallback({
        nodeId: 'idp1',
        requestId,
        mqSendSuccessCallbackPromise: mqSendSuccessIdpToRpCallbackPromise,
        destinationNodeId: 'rp1',
      });
    });

    it('RP should receive confirmed and answered_idp_count = 1 request status ', async function () {
      this.timeout(25000);
      const requestStatus = await requestStatusConfirmedPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: requestId,
        status: 'confirmed',
        mode: createRequestParams.mode,
        min_idp: createRequestParams.min_idp,
        answered_idp_count: 1,
        closed: false,
        timed_out: false,
        service_list: [],
        response_valid_list: [
          {
            idp_id: 'idp1',
            valid_signature: null,
            valid_ial: null,
          },
        ],
      });
      expect(requestStatus).to.have.property('block_height');
      expect(requestStatus.block_height).is.a('string');
      const splittedBlockHeight = requestStatus.block_height.split(':');
      expect(splittedBlockHeight).to.have.lengthOf(2);
      expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('IdP (idp2) should create response (accept) successfully', async function () {
      this.timeout(10000);

      let idpResponse = {
        reference_id: idp2ReferenceId,
        callback_url: config.IDP2_CALLBACK_URL,
        request_id: requestId,
        error_code: idpResponseErrorCode,
      };

      const response = await idpApi.createErrorResponse('idp2', idpResponse);
      expect(response.status).to.equal(202);
    });

    it('IdP (idp2) shoud receive callback create response result with success = true', async function () {
      const responseResult = await responseResultPromise2.promise;
      expect(responseResult).to.deep.include({
        node_id: 'idp2',
        type: 'response_result',
        reference_id: idp2ReferenceId,
        request_id: requestId,
        success: true,
      });
    });

    it('RP should receive confirmed request status ', async function () {
      this.timeout(25000);
      const requestStatus = await requestStatusErroredPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: requestId,
        status: 'confirmed',
        mode: createRequestParams.mode,
        min_idp: createRequestParams.min_idp,
        answered_idp_count: 2,
        closed: false,
        timed_out: false,
        service_list: [],
        response_valid_list: [
          {
            idp_id: 'idp1',
            valid_signature: null,
            valid_ial: null,
          },
          {
            idp_id: 'idp2',
            valid_signature: null,
            valid_ial: null,
          },
        ],
      });
      expect(requestStatus).to.have.property('block_height');
      expect(requestStatus.block_height).is.a('string');
      const splittedBlockHeight = requestStatus.block_height.split(':');
      expect(splittedBlockHeight).to.have.lengthOf(2);
      expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('RP should receive confirmed and closed request status', async function () {
      this.timeout(25000);
      const requestStatus = await requestClosedPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: requestId,
        status: 'confirmed',
        mode: createRequestParams.mode,
        min_idp: createRequestParams.min_idp,
        answered_idp_count: 2,
        closed: true,
        timed_out: false,
        service_list: [],
        response_valid_list: [
          {
            idp_id: 'idp1',
            valid_signature: null,
            valid_ial: null,
          },
          {
            idp_id: 'idp2',
            valid_signature: null,
            valid_ial: null,
          },
        ],
      });
      expect(requestStatus).to.have.property('block_height');
      expect(requestStatus.block_height).is.a('string');
      const splittedBlockHeight = requestStatus.block_height.split(':');
      expect(splittedBlockHeight).to.have.lengthOf(2);
      expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    });
    after(function () {
      rpEventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
      nodeCallbackEventEmitter.removeAllListeners('callback');
    });
  });

  after(async function () {
    await commonApi.setConfig('rp1', {
      CALLBACK_API_VERSION: 5,
    });
  });
});
