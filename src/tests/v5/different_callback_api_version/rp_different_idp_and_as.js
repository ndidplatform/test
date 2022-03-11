import { expect } from 'chai';

import * as rpApi from '../../../api/v4/rp'; //v4

import * as idpApi from '../../../api/v5/idp'; // v5
import * as asApi from '../../../api/v5/as'; // v5

import * as commonApi from '../../../api/common';
import {
  rpEventEmitter,
  idp1EventEmitter,
  as1EventEmitter,
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
import { receiveMessagequeueSendSuccessCallback } from '../_fragments/common';

describe('RP callback api version v4 create request to IdP and AS with callback api version v5', function () {
  describe('AS (v5) response data request test', function () {
    let namespace;
    let identifier;

    const rpReferenceId = generateReferenceId();
    const idpReferenceId = generateReferenceId();
    const asReferenceId = generateReferenceId();

    const createRequestResultPromise = createEventPromise(); // RP
    const requestStatusPendingPromise = createEventPromise(); // RP

    const incomingRequestPromise = createEventPromise(); // IDP
    const responseResultPromise = createEventPromise(); // IDP
    const requestStatusConfirmedPromise = createEventPromise(); // RP
    const requestStatusSignedDataPromise = createEventPromise();
    const requestStatusCompletedPromise = createEventPromise();
    const requestClosedPromise = createEventPromise(); // RP

    const dataRequestReceivedPromise = createEventPromise(); // AS
    const errorCallbackPromise = createEventPromise(); // AS
    const sendDataResultPromise = createEventPromise(); // AS

    const mqSendSuccessRpToIdpCallbackPromise = createEventPromise();
    const mqSendSuccessRpToAsCallbackPromise = createEventPromise();
    const mqSendSuccessIdpToRpCallbackPromise = createEventPromise();
    const mqSendSuccessAsToRpCallbackPromise = createEventPromise();

    let createRequestParams;

    let requestId;
    let initialSalt;

    const requestStatusUpdates = [];
    let lastStatusUpdateBlockHeight;

    const data = JSON.stringify({
      test: 'test',
      withEscapedChar: 'test|fff||ss\\|NN\\\\|',
      arr: [1, 2, 3],
    });

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
        data_request_list: [
          {
            service_id: 'bank_statement',
            as_id_list: ['as1'],
            min_as: 1,
            request_params: JSON.stringify({
              format: 'pdf',
            }),
          },
        ],
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
            }
            requestStatusCompletedPromise.resolve(callbackData);
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
        } else if (callbackData.type === 'error') {
          errorCallbackPromise.resolve(callbackData);
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
        CALLBACK_API_VERSION: '4.0',
      });

      const responseBody = await response.json();
      expect(responseBody.callbackApiVersion).to.equal('4.0');

      await wait(3000);

      const responseGetConfig = await commonApi.getConfig('rp1');
      const responseBodyGetConfig = await responseGetConfig.json();
      expect(responseBodyGetConfig.callbackApiVersion).to.equal('4.0');
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
        service_list: [
          {
            service_id: createRequestParams.data_request_list[0].service_id,
            min_as: createRequestParams.data_request_list[0].min_as,
            signed_data_count: 0,
            received_data_count: 0,
          },
        ],
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

      const response = await idpApi.createResponse('idp1', idpResponse);
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

    it('IdP should receive message queue send success (To rp1) callback', async function () {
      this.timeout(15000);
      await receiveMessagequeueSendSuccessCallback({
        nodeId: 'idp1',
        requestId,
        mqSendSuccessCallbackPromise: mqSendSuccessIdpToRpCallbackPromise,
        destinationNodeId: 'rp1',
      });
    });

    it('RP should receive confirmed request status ', async function () {
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
        service_list: [
          {
            service_id: createRequestParams.data_request_list[0].service_id,
            min_as: createRequestParams.data_request_list[0].min_as,
            signed_data_count: 0,
            received_data_count: 0,
          },
        ],
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

    it('RP should receive message queue send success (To as1) callback', async function () {
      this.timeout(15000);
      await receiveMessagequeueSendSuccessCallback({
        nodeId: 'rp1',
        requestId,
        mqSendSuccessCallbackPromise: mqSendSuccessRpToAsCallbackPromise,
        destinationNodeId: 'as1',
      });
    });

    it('AS should receive data request', async function () {
      this.timeout(15000);
      const dataRequest = await dataRequestReceivedPromise.promise;
      expect(dataRequest).to.deep.include({
        request_id: requestId,
        mode: createRequestParams.mode,
        namespace,
        identifier,
        service_id: createRequestParams.data_request_list[0].service_id,
        request_params: createRequestParams.data_request_list[0].request_params,
        max_ial: 2.3,
        max_aal: 3,
        requester_node_id: 'rp1',
      });
      expect(dataRequest.response_signature_list).to.have.lengthOf(1);
      expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is
        .not.empty;
    });

    it('AS should send data successfully', async function () {
      this.timeout(35000);
      const response = await asApi.sendData('as1', {
        requestId,
        serviceId: createRequestParams.data_request_list[0].service_id,
        reference_id: asReferenceId,
        callback_url: config.AS1_CALLBACK_URL,
        data,
      });
      expect(response.status).to.equal(202);

      const sendDataResult = await sendDataResultPromise.promise;
      expect(sendDataResult).to.deep.include({
        reference_id: asReferenceId,
        success: true,
      });
    });

    it('AS should receive message queue send success (To rp1) callback', async function () {
      this.timeout(15000);
      await receiveMessagequeueSendSuccessCallback({
        nodeId: 'as1',
        requestId,
        mqSendSuccessCallbackPromise: mqSendSuccessAsToRpCallbackPromise,
        destinationNodeId: 'rp1',
      });
    });

    it('RP should receive confirmed with signed data count request status ', async function () {
      this.timeout(25000);
      const requestStatus = await requestStatusSignedDataPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: requestId,
        status: 'confirmed',
        mode: createRequestParams.mode,
        min_idp: createRequestParams.min_idp,
        answered_idp_count: 1,
        closed: false,
        timed_out: false,
        service_list: [
          {
            service_id: createRequestParams.data_request_list[0].service_id,
            min_as: createRequestParams.data_request_list[0].min_as,
            signed_data_count: 1,
            received_data_count: 0,
          },
        ],
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

    it('RP should receive closed request status ', async function () {
      this.timeout(25000);
      const requestStatus = await requestClosedPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: requestId,
        status: 'completed',
        mode: createRequestParams.mode,
        min_idp: createRequestParams.min_idp,
        answered_idp_count: 1,
        closed: true,
        timed_out: false,
        service_list: [
          {
            service_id: createRequestParams.data_request_list[0].service_id,
            min_as: createRequestParams.data_request_list[0].min_as,
            signed_data_count: 1,
            received_data_count: 1,
          },
        ],
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

    it('RP should get the correct data received from AS', async function () {
      this.timeout(150000);
      const response = await rpApi.getDataFromAS('rp1', {
        requestId,
      });
      const dataArr = await response.json();
      expect(response.status).to.equal(200);

      expect(dataArr).to.have.lengthOf(1);
      expect(dataArr[0]).to.deep.include({
        source_node_id: 'as1',
        service_id: createRequestParams.data_request_list[0].service_id,
        signature_sign_method: 'RSA-SHA256',
        data,
      });
      expect(dataArr[0].source_signature).to.be.a('string').that.is.not.empty;
      expect(dataArr[0].data_salt).to.be.a('string').that.is.not.empty;
    });

    after(function () {
      rpEventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
      nodeCallbackEventEmitter.removeAllListeners('callback');
    });
  });

  describe('AS (v5) error response request test', function () {
    let namespace;
    let identifier;

    const rpReferenceId = generateReferenceId();
    const idpReferenceId = generateReferenceId();
    const asReferenceId = generateReferenceId();

    const createRequestResultPromise = createEventPromise(); // RP
    const requestStatusPendingPromise = createEventPromise(); // RP

    const incomingRequestPromise = createEventPromise(); // IDP
    const responseResultPromise = createEventPromise(); // IDP
    const requestStatusConfirmedPromise = createEventPromise(); // RP
    const requestStatusErroredPromise = createEventPromise();
    const requestClosedPromise = createEventPromise(); // RP

    const dataRequestReceivedPromise = createEventPromise(); // AS
    const errorCallbackPromise = createEventPromise(); // AS
    const sendDataResultPromise = createEventPromise(); // AS

    const mqSendSuccessRpToIdpCallbackPromise = createEventPromise();
    const mqSendSuccessRpToAsCallbackPromise = createEventPromise();
    const mqSendSuccessIdpToRpCallbackPromise = createEventPromise();
    const mqSendSuccessAsToRpCallbackPromise = createEventPromise();

    let createRequestParams;

    let requestId;
    let initialSalt;

    const requestStatusUpdates = [];
    let lastStatusUpdateBlockHeight;
    let blockHeight = 0; //for test AS error response

    let asResponseErrorCode = 1000;

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
        data_request_list: [
          {
            service_id: 'bank_statement',
            as_id_list: ['as1'],
            min_as: 1,
            request_params: JSON.stringify({
              format: 'pdf',
            }),
          },
        ],
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
            if (callbackData.closed) {
              requestClosedPromise.resolve(callbackData);
            } else if (blockHeight === 0) {
              requestStatusConfirmedPromise.resolve(callbackData);
            } else if (blockHeight != 0) {
              requestStatusErroredPromise.resolve(callbackData);
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
        } else if (callbackData.type === 'error') {
          errorCallbackPromise.resolve(callbackData);
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
        CALLBACK_API_VERSION: '4.0',
      });

      const responseBody = await response.json();
      expect(responseBody.callbackApiVersion).to.equal('4.0');

      await wait(3000);

      const responseGetConfig = await commonApi.getConfig('rp1');
      const responseBodyGetConfig = await responseGetConfig.json();
      expect(responseBodyGetConfig.callbackApiVersion).to.equal('4.0');
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
        service_list: [
          {
            service_id: createRequestParams.data_request_list[0].service_id,
            min_as: createRequestParams.data_request_list[0].min_as,
            signed_data_count: 0,
            received_data_count: 0,
          },
        ],
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

      const response = await idpApi.createResponse('idp1', idpResponse);
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

    it('IdP should receive message queue send success (To rp1) callback', async function () {
      this.timeout(15000);
      await receiveMessagequeueSendSuccessCallback({
        nodeId: 'idp1',
        requestId,
        mqSendSuccessCallbackPromise: mqSendSuccessIdpToRpCallbackPromise,
        destinationNodeId: 'rp1',
      });
    });

    it('RP should receive confirmed request status ', async function () {
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
        service_list: [
          {
            service_id: createRequestParams.data_request_list[0].service_id,
            min_as: createRequestParams.data_request_list[0].min_as,
            signed_data_count: 0,
            received_data_count: 0,
          },
        ],
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
      blockHeight = parseInt(splittedBlockHeight[1]); // for test as error response
    });

    it('RP should receive message queue send success (To as1) callback', async function () {
      this.timeout(15000);
      await receiveMessagequeueSendSuccessCallback({
        nodeId: 'rp1',
        requestId,
        mqSendSuccessCallbackPromise: mqSendSuccessRpToAsCallbackPromise,
        destinationNodeId: 'as1',
      });
    });

    it('AS should receive data request', async function () {
      this.timeout(15000);
      const dataRequest = await dataRequestReceivedPromise.promise;
      expect(dataRequest).to.deep.include({
        request_id: requestId,
        mode: createRequestParams.mode,
        namespace,
        identifier,
        service_id: createRequestParams.data_request_list[0].service_id,
        request_params: createRequestParams.data_request_list[0].request_params,
        max_ial: 2.3,
        max_aal: 3,
        requester_node_id: 'rp1',
      });
      expect(dataRequest.response_signature_list).to.have.lengthOf(1);
      expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is
        .not.empty;
    });

    it('AS should send data successfully', async function () {
      this.timeout(35000);
      const response = await asApi.sendDataError('as1', {
        requestId,
        serviceId: createRequestParams.data_request_list[0].service_id,
        reference_id: asReferenceId,
        callback_url: config.AS1_CALLBACK_URL,
        error_code: asResponseErrorCode,
      });
      expect(response.status).to.equal(202);
      expect(response.status).to.equal(202);

      const sendDataResult = await sendDataResultPromise.promise;
      expect(sendDataResult).to.deep.include({
        reference_id: asReferenceId,
        success: true,
      });
    });

    it('AS should receive message queue send success (To rp1) callback', async function () {
      this.timeout(15000);
      await receiveMessagequeueSendSuccessCallback({
        nodeId: 'as1',
        requestId,
        mqSendSuccessCallbackPromise: mqSendSuccessAsToRpCallbackPromise,
        destinationNodeId: 'rp1',
      });
    });

    it('RP should receive confirmed with increase block hieght request status ', async function () {
      this.timeout(25000);
      const requestStatus = await requestStatusErroredPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: requestId,
        status: 'confirmed',
        mode: createRequestParams.mode,
        min_idp: createRequestParams.min_idp,
        answered_idp_count: 1,
        closed: false,
        timed_out: false,
        service_list: [
          {
            service_id: createRequestParams.data_request_list[0].service_id,
            min_as: createRequestParams.data_request_list[0].min_as,
            signed_data_count: 0,
            received_data_count: 0,
          },
        ],
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
      expect(parseInt(splittedBlockHeight[1])).to.above(blockHeight);
    });

    it('RP should get the correct data received from AS', async function () {
      this.timeout(100000);
      const response = await rpApi.getDataFromAS('rp1', {
        requestId,
      });
      expect(response.status).to.equal(200);
      const dataArr = await response.json();
      expect(dataArr).to.be.an('array').to.be.empty;
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
      CALLBACK_API_VERSION: '5.2',
    });
  });
});
