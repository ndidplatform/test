import { expect } from 'chai';

import * as rpApi from '../../../../api/v3/rp';
import * as asApi from '../../../../api/v3/as';
import * as idpApi from '../../../../api/v3/idp';
import * as ndidApi from '../../../../api/v3/ndid';
import * as commonApi from '../../../../api/v3/common';
import * as db from '../../../../db';
import { ndidAvailable, proxy1Available, idp2Available } from '../../..';
import {
  as1EventEmitter,
  idp1EventEmitter,
  rpEventEmitter,
  proxy1EventEmitter,
} from '../../../../callback_server';
import {
  createEventPromise,
  generateReferenceId,
  wait,
  hash,
} from '../../../../utils';
import * as config from '../../../../config';

describe('NDID disable proxy node and enable proxy node test', function() {
  describe('RP node behind disabled proxy node (proxy1_rp4) making request to IdP node outside proxy (idp1) test', function() {
    let namespace;
    let identifier;

    const rpReferenceId = generateReferenceId();
    const idpReferenceId = generateReferenceId();
    const asReferenceId = generateReferenceId();

    const disableNodeCreateRequestResultPromise = createEventPromise(); // RP
    const enableNodeCreateRequestResultPromise = createEventPromise(); // RP
    const requestStatusPendingPromise = createEventPromise(); // RP
    const incomingRequestPromise = createEventPromise(); // IDP
    const responseResultPromise = createEventPromise(); // IDP
    const accessorEncryptPromise = createEventPromise(); // IDP
    const dataRequestReceivedPromise = createEventPromise(); // AS
    const sendDataResultPromise = createEventPromise(); // AS
    const requestStatusCompletedPromise = createEventPromise(); // RP
    const requestClosedPromise = createEventPromise(); // RP

    let createRequestParams;
    let disableNodeRequestId;
    let enableNodeRequestId;
    let requestMessageSalt;
    let requestMessageHash;

    let responseAccessorId;

    const data = JSON.stringify({
      test: 'test',
      withEscapedChar: 'test|fff||ss\\|NN\\\\|',
      arr: [1, 2, 3],
    });

    before(async function() {
      if (!ndidAvailable || !proxy1Available) {
        this.test.parent.pending = true;
        this.skip();
      }

      const identity = db.idp1Identities.find(
        identity => identity.mode === 3 && !identity.revokeIdentityAssociation
      );

      if (!identity) {
        throw new Error('No created identity to use');
      }

      namespace = identity.namespace;
      identifier = identity.identifier;

      createRequestParams = {
        node_id: 'proxy1_rp4',
        reference_id: rpReferenceId,
        callback_url: config.PROXY1_CALLBACK_URL,
        mode: 3,
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
        request_message:
          'Test request message (enable proxy node and disable proxy node test)',
        min_ial: 1.1,
        min_aal: 1,
        min_idp: 1,
        request_timeout: 86400,
      };

      proxy1EventEmitter.on('callback', function(callbackData) {
        if (
          callbackData.type === 'create_request_result' &&
          callbackData.request_id === disableNodeRequestId
        ) {
          disableNodeCreateRequestResultPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'create_request_result' &&
          callbackData.request_id === enableNodeRequestId
        ) {
          enableNodeCreateRequestResultPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'request_status' &&
          callbackData.request_id === enableNodeRequestId
        ) {
          if (callbackData.status === 'pending') {
            requestStatusPendingPromise.resolve(callbackData);
          } else if (callbackData.status === 'completed') {
            if (callbackData.closed) {
              requestClosedPromise.resolve(callbackData);
            } else {
              requestStatusCompletedPromise.resolve(callbackData);
            }
          }
        }
      });

      idp1EventEmitter.on('callback', function(callbackData) {
        if (
          callbackData.type === 'incoming_request' &&
          callbackData.request_id === enableNodeRequestId
        ) {
          incomingRequestPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'response_result' &&
          callbackData.reference_id === idpReferenceId
        ) {
          responseResultPromise.resolve(callbackData);
        }
      });

      idp1EventEmitter.on('accessor_encrypt_callback', function(callbackData) {
        if (callbackData.request_id === enableNodeRequestId) {
          accessorEncryptPromise.resolve(callbackData);
        }
      });

      as1EventEmitter.on('callback', function(callbackData) {
        if (
          callbackData.type === 'data_request' &&
          callbackData.request_id === enableNodeRequestId
        ) {
          dataRequestReceivedPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'send_data_result' &&
          callbackData.request_id === enableNodeRequestId
        ) {
          sendDataResultPromise.resolve(callbackData);
        }
      });
    });

    it('NDID should disable node proxy (proxy1) successfully', async function() {
      this.timeout(10000);

      const response = await ndidApi.disableNode('ndid1', {
        node_id: 'proxy1',
      });
      expect(response.status).to.equal(200);
      await wait(5000);
    });

    it('After NDID disable node proxy (proxy1) RP (proxy1_rp4) behind proxy should create a request unsuccessfully', async function() {
      this.timeout(15000);
      const response = await rpApi.createRequest('proxy1', createRequestParams);
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;
      disableNodeRequestId = responseBody.request_id;
      const createRequestResult = await disableNodeCreateRequestResultPromise.promise;
      expect(createRequestResult).to.deep.include({
        type: 'create_request_result',
        success: false,
        reference_id: createRequestParams.reference_id,
        request_id: disableNodeRequestId,
      });
      expect(createRequestResult.error.code).to.equal(15026);
    });

    it('NDID should enable node proxy (proxy1) successfully', async function() {
      this.timeout(10000);

      const response = await ndidApi.enableNode('ndid1', {
        node_id: 'proxy1',
      });
      expect(response.status).to.equal(200);
      await wait(5000);
    });

    it('After NDID enable node proxy (proxy1) RP (proxy1_rp4) behind proxy should create a request successfully', async function() {
      this.timeout(15000);
      const response = await rpApi.createRequest('proxy1', createRequestParams);
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;
      enableNodeRequestId = responseBody.request_id;
      const createRequestResult = await enableNodeCreateRequestResultPromise.promise;
      expect(createRequestResult).to.deep.include({
        type: 'create_request_result',
        success: true,
        reference_id: createRequestParams.reference_id,
        request_id: enableNodeRequestId,
      });
    });

    it('RP should receive pending request status', async function() {
      const requestStatus = await requestStatusPendingPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: enableNodeRequestId,
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

    it('IdP should receive incoming request callback', async function() {
      this.timeout(15000);
      const incomingRequest = await incomingRequestPromise.promise;

      const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
        dataRequest => {
          const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
          return {
            ...dataRequestWithoutParams,
          };
        }
      );
      expect(incomingRequest).to.deep.include({
        mode: createRequestParams.mode,
        request_id: enableNodeRequestId,
        request_message: createRequestParams.request_message,
        request_message_hash: hash(
          createRequestParams.request_message +
            incomingRequest.request_message_salt
        ),
        requester_node_id: createRequestParams.node_id,
        min_ial: createRequestParams.min_ial,
        min_aal: createRequestParams.min_aal,
        data_request_list: dataRequestListWithoutParams,
        request_timeout: createRequestParams.request_timeout,
      });
      expect(incomingRequest.reference_group_code).to.be.a('string').that.is.not
        .empty;
      expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
        .empty;
      expect(incomingRequest.creation_time).to.be.a('number');

      requestMessageSalt = incomingRequest.request_message_salt;
      requestMessageHash = incomingRequest.request_message_hash;
    });

    it('IdP should create response (accept) successfully', async function() {
      this.timeout(10000);
      const identity = db.idp1Identities.find(
        identity =>
          identity.namespace === namespace && identity.identifier === identifier
      );

      responseAccessorId = identity.accessors[0].accessorId;

      const response = await idpApi.createResponse('idp1', {
        reference_id: idpReferenceId,
        callback_url: config.IDP1_CALLBACK_URL,
        request_id: enableNodeRequestId,
        ial: 2.3,
        aal: 3,
        status: 'accept',
        accessor_id: responseAccessorId,
      });
      expect(response.status).to.equal(202);
    });

    it('IdP should receive accessor encrypt callback with correct data', async function() {
      this.timeout(15000);

      const accessorEncryptParams = await accessorEncryptPromise.promise;
      expect(accessorEncryptParams).to.deep.include({
        node_id: 'idp1',
        type: 'accessor_encrypt',
        accessor_id: responseAccessorId,
        key_type: 'RSA',
        padding: 'none',
        reference_id: idpReferenceId,
        request_id: enableNodeRequestId,
      });

      expect(accessorEncryptParams.request_message_padded_hash).to.be.a(
        'string'
      ).that.is.not.empty;
    });

    it('IdP shoud receive callback create response result with success = true', async function() {
      const responseResult = await responseResultPromise.promise;
      expect(responseResult).to.deep.include({
        node_id: 'idp1',
        type: 'response_result',
        reference_id: idpReferenceId,
        request_id: enableNodeRequestId,
        success: true,
      });
    });

    it('AS should receive data request', async function() {
      this.timeout(15000);
      const dataRequest = await dataRequestReceivedPromise.promise;
      expect(dataRequest).to.deep.include({
        request_id: enableNodeRequestId,
        mode: createRequestParams.mode,
        namespace,
        identifier,
        service_id: createRequestParams.data_request_list[0].service_id,
        request_params: createRequestParams.data_request_list[0].request_params,
        max_ial: 2.3,
        max_aal: 3,
        requester_node_id: createRequestParams.node_id,
      });
      expect(dataRequest.response_signature_list).to.have.lengthOf(1);
      expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is
        .not.empty;
    });

    it('AS should send data successfully', async function() {
      this.timeout(15000);
      const response = await asApi.sendData('as1', {
        requestId: enableNodeRequestId,
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

    it('RP should receive completed request status with received data count = 1', async function() {
      this.timeout(15000);
      const requestStatus = await requestStatusCompletedPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: enableNodeRequestId,
        status: 'completed',
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
            received_data_count: 1,
          },
        ],
        response_valid_list: [
          {
            idp_id: 'idp1',
            valid_signature: true,
            valid_ial: true,
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

    it('RP should receive request closed status', async function() {
      this.timeout(10000);
      const requestStatus = await requestClosedPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: enableNodeRequestId,
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
            valid_signature: true,
            valid_ial: true,
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

    it('RP should get the correct data received from AS', async function() {
      const response = await rpApi.getDataFromAS('proxy1', {
        node_id: createRequestParams.node_id,
        requestId: enableNodeRequestId,
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

    after(async function() {
      this.timeout(10000);
      await ndidApi.enableNode('ndid1', {
        node_id: 'proxy1',
      });
      await wait(5000);

      proxy1Available.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
      as1EventEmitter.removeAllListeners('callback');
    });
  });

  describe('RP node outside proxy (rp1) making request to IdP node behind disabled proxy node (proxy1_idp4) test', function() {
    let namespace;
    let identifier;

    const rpReferenceId = generateReferenceId();
    const idpReferenceId = generateReferenceId();
    const asReferenceId = generateReferenceId();

    const enableNodeCreateRequestResultPromise = createEventPromise(); // RP
    const requestStatusPendingPromise = createEventPromise(); // RP
    const incomingRequestPromise = createEventPromise(); // IDP
    const responseResultPromise = createEventPromise(); // IDP
    const accessorEncryptPromise = createEventPromise(); // IDP
    const dataRequestReceivedPromise = createEventPromise(); // AS
    const sendDataResultPromise = createEventPromise(); // AS
    const requestStatusCompletedPromise = createEventPromise(); // RP
    const requestClosedPromise = createEventPromise(); // RP

    let createRequestParams;
    let enableNodeRequestId;
    let requestMessageSalt;
    let requestMessageHash;

    let responseAccessorId;

    const data = JSON.stringify({
      test: 'test',
      withEscapedChar: 'test|fff||ss\\|NN\\\\|',
      arr: [1, 2, 3],
    });

    before(async function() {
      if (!ndidAvailable || !proxy1Available) {
        this.test.parent.pending = true;
        this.skip();
      }

      const identity = db.proxy1Idp4Identities.find(
        identity => identity.mode === 3
      );

      if (!identity) {
        throw new Error('No created identity to use');
      }

      namespace = identity.namespace;
      identifier = identity.identifier;

      createRequestParams = {
        reference_id: rpReferenceId,
        callback_url: config.RP_CALLBACK_URL,
        mode: 3,
        namespace,
        identifier,
        idp_id_list: ['proxy1_idp4'],
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
        request_message:
          'Test request message (RP node outside proxy (rp1) making request to IdP node behind proxy (proxy1_idp4) test)',
        min_ial: 1.1,
        min_aal: 1,
        min_idp: 1,
        request_timeout: 86400,
      };

      rpEventEmitter.on('callback', function(callbackData) {
        if (
          callbackData.type === 'create_request_result' &&
          callbackData.request_id === enableNodeRequestId
        ) {
          enableNodeCreateRequestResultPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'request_status' &&
          callbackData.request_id === enableNodeRequestId
        ) {
          if (callbackData.status === 'pending') {
            requestStatusPendingPromise.resolve(callbackData);
          } else if (callbackData.status === 'completed') {
            if (callbackData.closed) {
              requestClosedPromise.resolve(callbackData);
            } else {
              requestStatusCompletedPromise.resolve(callbackData);
            }
          }
        }
      });

      proxy1EventEmitter.on('callback', function(callbackData) {
        if (
          callbackData.type === 'incoming_request' &&
          callbackData.request_id === enableNodeRequestId
        ) {
          incomingRequestPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'response_result' &&
          callbackData.reference_id === idpReferenceId
        ) {
          responseResultPromise.resolve(callbackData);
        }
      });

      proxy1EventEmitter.on('accessor_encrypt_callback', function(
        callbackData
      ) {
        if (callbackData.request_id === enableNodeRequestId) {
          accessorEncryptPromise.resolve(callbackData);
        }
      });

      as1EventEmitter.on('callback', function(callbackData) {
        if (
          callbackData.type === 'data_request' &&
          callbackData.request_id === enableNodeRequestId
        ) {
          dataRequestReceivedPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'send_data_result' &&
          callbackData.request_id === enableNodeRequestId
        ) {
          sendDataResultPromise.resolve(callbackData);
        }
      });
    });

    it('NDID should disable proxy node (proxy1) successfully', async function() {
      this.timeout(10000);

      const response = await ndidApi.disableNode('ndid1', {
        node_id: 'proxy1',
      });
      expect(response.status).to.equal(200);
      await wait(5000);
    });

    // it('After NDID disable proxy node (proxy1) RP should query IdP behind proxy node (proxy1_idp4) not found', async function() {
    //   this.timeout(15000);
    //   const response = await commonApi.getIdP('rp1');
    //   const responseBody = await response.json();
    //   const foundIdp = responseBody.find(idp => idp.node_id === 'proxy1_idp4');
    //   expect(foundIdp).to.be.an('undefined');
    // });

    it('After NDID disable proxy node (proxy1) RP should create a request to idp (proxy1_idp4) behind disabled proxy node (proxy1) unsuccessfully', async function() {
      this.timeout(15000);
      const response = await rpApi.createRequest('rp1', createRequestParams);
      const responseBody = await response.json();
      expect(response.status).to.equal(400);
      expect(responseBody.error.code).to.equal(20005);
    });

    it('NDID should enable proxy node (proxy1) successfully', async function() {
      this.timeout(10000);
      const response = await ndidApi.enableNode('ndid1', {
        node_id: 'proxy1',
      });
      expect(response.status).to.equal(200);
      await wait(5000);
    });

    it('After NDID enable proxy node (proxy1) RP should query IdP behind proxy node (proxy1_idp4) found', async function() {
      this.timeout(15000);
      const response = await commonApi.getIdP('rp1');
      const responseBody = await response.json();
      const foundIdp = responseBody.find(idp => idp.node_id === 'proxy1_idp4');
      expect(foundIdp).to.be.an('object');
    });

    it('After NDID enable proxy node (proxy1) RP should create a request to proxy1_idp4 successfully', async function() {
      this.timeout(15000);
      const response = await rpApi.createRequest('rp1', createRequestParams);
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;
      enableNodeRequestId = responseBody.request_id;
      const createRequestResult = await enableNodeCreateRequestResultPromise.promise;
      expect(createRequestResult).to.deep.include({
        type: 'create_request_result',
        success: true,
        reference_id: createRequestParams.reference_id,
        request_id: enableNodeRequestId,
      });
    });

    it('RP should receive pending request status', async function() {
      const requestStatus = await requestStatusPendingPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: enableNodeRequestId,
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

    it('IdP should receive incoming request callback', async function() {
      this.timeout(15000);
      const incomingRequest = await incomingRequestPromise.promise;

      const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
        dataRequest => {
          const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
          return {
            ...dataRequestWithoutParams,
          };
        }
      );
      expect(incomingRequest).to.deep.include({
        mode: createRequestParams.mode,
        request_id: enableNodeRequestId,
        request_message: createRequestParams.request_message,
        request_message_hash: hash(
          createRequestParams.request_message +
            incomingRequest.request_message_salt
        ),
        requester_node_id: 'rp1',
        min_ial: createRequestParams.min_ial,
        min_aal: createRequestParams.min_aal,
        data_request_list: dataRequestListWithoutParams,
        request_timeout: createRequestParams.request_timeout,
      });
      expect(incomingRequest.reference_group_code).to.be.a('string').that.is.not
        .empty;
      expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
        .empty;
      expect(incomingRequest.creation_time).to.be.a('number');

      requestMessageSalt = incomingRequest.request_message_salt;
      requestMessageHash = incomingRequest.request_message_hash;
    });

    it('IdP should create response (accept) successfully', async function() {
      this.timeout(10000);
      const identity = db.proxy1Idp4Identities.find(
        identity =>
          identity.namespace === namespace && identity.identifier === identifier
      );

      responseAccessorId = identity.accessors[0].accessorId;

      const response = await idpApi.createResponse('proxy1', {
        node_id: 'proxy1_idp4',
        reference_id: idpReferenceId,
        callback_url: config.PROXY1_CALLBACK_URL,
        request_id: enableNodeRequestId,
        ial: 2.3,
        aal: 3,
        status: 'accept',
        accessor_id: responseAccessorId,
      });
      expect(response.status).to.equal(202);
    });

    it('IdP should receive accessor encrypt callback with correct data', async function() {
      this.timeout(15000);

      const accessorEncryptParams = await accessorEncryptPromise.promise;
      expect(accessorEncryptParams).to.deep.include({
        node_id: 'proxy1_idp4',
        type: 'accessor_encrypt',
        accessor_id: responseAccessorId,
        key_type: 'RSA',
        padding: 'none',
        reference_id: idpReferenceId,
        request_id: enableNodeRequestId,
      });

      expect(accessorEncryptParams.request_message_padded_hash).to.be.a(
        'string'
      ).that.is.not.empty;
    });

    it('IdP shoud receive callback create response result with success = true', async function() {
      const responseResult = await responseResultPromise.promise;
      expect(responseResult).to.deep.include({
        node_id: 'proxy1_idp4',
        type: 'response_result',
        reference_id: idpReferenceId,
        request_id: enableNodeRequestId,
        success: true,
      });
    });

    it('AS should receive data request', async function() {
      this.timeout(15000);
      const dataRequest = await dataRequestReceivedPromise.promise;
      expect(dataRequest).to.deep.include({
        request_id: enableNodeRequestId,
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

    it('AS should send data successfully', async function() {
      this.timeout(15000);
      const response = await asApi.sendData('as1', {
        requestId: enableNodeRequestId,
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

    it('RP should receive completed request status with received data count = 1', async function() {
      this.timeout(15000);
      const requestStatus = await requestStatusCompletedPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: enableNodeRequestId,
        status: 'completed',
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
            received_data_count: 1,
          },
        ],
        response_valid_list: [
          {
            idp_id: 'proxy1_idp4',
            valid_signature: true,
            valid_ial: true,
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

    it('RP should receive request closed status', async function() {
      this.timeout(10000);
      const requestStatus = await requestClosedPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: enableNodeRequestId,
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
            idp_id: 'proxy1_idp4',
            valid_signature: true,
            valid_ial: true,
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

    it('RP should get the correct data received from AS', async function() {
      const response = await rpApi.getDataFromAS('rp1', {
        requestId: enableNodeRequestId,
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

    after(async function() {
      this.timeout(10000);
      await ndidApi.enableNode('ndid1', {
        node_id: 'proxy1',
      });
      await wait(5000);

      rpEventEmitter.removeAllListeners('callback');
      proxy1EventEmitter.removeAllListeners('callback');
      proxy1EventEmitter.removeAllListeners('accessor_encrypt_callback');
      as1EventEmitter.removeAllListeners('callback');
    });
  });
  describe('RP node outside proxy (rp1) making request with data request to AS node behind disabled proxy node (proxy1_as4) test', function() {
    let namespace;
    let identifier;

    const rpReferenceId = generateReferenceId();
    const idpReferenceId = generateReferenceId();
    const asReferenceId = generateReferenceId();

    const enableNodeCreateRequestResultPromise = createEventPromise(); // RP
    const requestStatusPendingPromise = createEventPromise(); // RP
    const incomingRequestPromise = createEventPromise(); // IDP
    const responseResultPromise = createEventPromise(); // IDP
    const accessorEncryptPromise = createEventPromise(); // IDP
    const dataRequestReceivedPromise = createEventPromise(); // AS
    const sendDataResultPromise = createEventPromise(); // AS
    const requestStatusCompletedPromise = createEventPromise(); // RP
    const requestClosedPromise = createEventPromise(); // RP

    let createRequestParams;
    let enableNodeRequestId;
    let requestMessageSalt;
    let requestMessageHash;

    let responseAccessorId;

    const data = JSON.stringify({
      test: 'test',
      withEscapedChar: 'test|fff||ss\\|NN\\\\|',
      arr: [1, 2, 3],
    });

    before(async function() {
      if (!ndidAvailable || !proxy1Available) {
        this.skip();
      }

      const identity = db.idp1Identities.find(
        identity => identity.mode === 3 && !identity.revokeIdentityAssociation
      );

      if (!identity) {
        throw new Error('No created identity to use');
      }

      namespace = identity.namespace;
      identifier = identity.identifier;

      createRequestParams = {
        reference_id: rpReferenceId,
        callback_url: config.RP_CALLBACK_URL,
        mode: 3,
        namespace,
        identifier,
        idp_id_list: [],
        data_request_list: [
          {
            service_id: 'bank_statement',
            as_id_list: ['proxy1_as4'],
            min_as: 1,
            request_params: JSON.stringify({
              format: 'pdf',
            }),
          },
        ],
        request_message:
          'Test request message (enable AS node and disable AS node test)',
        min_ial: 1.1,
        min_aal: 1,
        min_idp: 1,
        request_timeout: 86400,
      };

      rpEventEmitter.on('callback', function(callbackData) {
        if (
          callbackData.type === 'create_request_result' &&
          callbackData.request_id === enableNodeRequestId
        ) {
          enableNodeCreateRequestResultPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'request_status' &&
          callbackData.request_id === enableNodeRequestId
        ) {
          if (callbackData.status === 'pending') {
            requestStatusPendingPromise.resolve(callbackData);
          } else if (callbackData.status === 'completed') {
            if (callbackData.closed) {
              requestClosedPromise.resolve(callbackData);
            } else {
              requestStatusCompletedPromise.resolve(callbackData);
            }
          }
        }
      });

      idp1EventEmitter.on('callback', function(callbackData) {
        if (
          callbackData.type === 'incoming_request' &&
          callbackData.request_id === enableNodeRequestId
        ) {
          incomingRequestPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'response_result' &&
          callbackData.reference_id === idpReferenceId
        ) {
          responseResultPromise.resolve(callbackData);
        }
      });

      idp1EventEmitter.on('accessor_encrypt_callback', function(callbackData) {
        if (callbackData.request_id === enableNodeRequestId) {
          accessorEncryptPromise.resolve(callbackData);
        }
      });

      proxy1EventEmitter.on('callback', function(callbackData) {
        if (
          callbackData.type === 'data_request' &&
          callbackData.request_id === enableNodeRequestId
        ) {
          dataRequestReceivedPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'send_data_result' &&
          callbackData.request_id === enableNodeRequestId
        ) {
          sendDataResultPromise.resolve(callbackData);
        }
      });
    });

    it('NDID should disable proxy node (proxy1) successfully', async function() {
      this.timeout(10000);

      const response = await ndidApi.disableNode('ndid1', {
        node_id: 'proxy1',
      });
      expect(response.status).to.equal(200);
      await wait(5000);
    });

    // it('After NDID disable proxy node (proxy1) RP should query list of AS behind disabled proxy node by service id not found', async function() {
    //   this.timeout(15000);
    //   const response = await commonApi.getASByServiceId(
    //     'rp1',
    //     'bank_statement'
    //   );
    //   const responseBody = await response.json();
    //   const foundAS = responseBody.find(as => as.node_id === 'proxy1_as4');
    //   expect(foundAS).to.be.an('undefined');
    // });

    it('After NDID disable proxy node (proxy1) RP should create a request with data request to AS node behind disabled proxy node (proxy1_as4) unsuccessfully', async function() {
      this.timeout(15000);
      const response = await rpApi.createRequest('rp1', createRequestParams);
      const responseBody = await response.json();
      expect(response.status).to.equal(400);
      expect(responseBody.error.code).to.equal(20024);
    });

    it('NDID should enable proxy node (proxy1) successfully', async function() {
      this.timeout(10000);
      const response = await ndidApi.enableNode('ndid1', {
        node_id: 'proxy1',
      });
      expect(response.status).to.equal(200);
      await wait(5000);
    });

    it('After NDID enable proxy node (proxy1) RP should query list of AS behind disabled proxy node by service id found', async function() {
      this.timeout(15000);
      const response = await commonApi.getASByServiceId(
        'rp1',
        'bank_statement'
      );
      const responseBody = await response.json();
      const foundAS = responseBody.find(as => as.node_id === 'proxy1_as4');
      expect(foundAS).to.be.an('object');
    });

    it('After NDID enable proxy node (proxy1) RP should create a request with data request to proxy1_as4 successfully', async function() {
      this.timeout(15000);
      const response = await rpApi.createRequest('rp1', createRequestParams);
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;
      enableNodeRequestId = responseBody.request_id;
      const createRequestResult = await enableNodeCreateRequestResultPromise.promise;
      expect(createRequestResult).to.deep.include({
        type: 'create_request_result',
        success: true,
        reference_id: createRequestParams.reference_id,
        request_id: enableNodeRequestId,
      });
    });

    it('RP should receive pending request status', async function() {
      const requestStatus = await requestStatusPendingPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: enableNodeRequestId,
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

    it('IdP should receive incoming request callback', async function() {
      this.timeout(15000);
      const incomingRequest = await incomingRequestPromise.promise;

      const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
        dataRequest => {
          const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
          return {
            ...dataRequestWithoutParams,
          };
        }
      );
      expect(incomingRequest).to.deep.include({
        mode: createRequestParams.mode,
        request_id: enableNodeRequestId,
        request_message: createRequestParams.request_message,
        request_message_hash: hash(
          createRequestParams.request_message +
            incomingRequest.request_message_salt
        ),
        requester_node_id: 'rp1',
        min_ial: createRequestParams.min_ial,
        min_aal: createRequestParams.min_aal,
        data_request_list: dataRequestListWithoutParams,
        request_timeout: createRequestParams.request_timeout,
      });
      expect(incomingRequest.reference_group_code).to.be.a('string').that.is.not
        .empty;
      expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
        .empty;
      expect(incomingRequest.creation_time).to.be.a('number');

      requestMessageSalt = incomingRequest.request_message_salt;
      requestMessageHash = incomingRequest.request_message_hash;
    });

    it('IdP should create response (accept) successfully', async function() {
      this.timeout(10000);
      const identity = db.idp1Identities.find(
        identity =>
          identity.namespace === namespace && identity.identifier === identifier
      );

      responseAccessorId = identity.accessors[0].accessorId;

      const response = await idpApi.createResponse('idp1', {
        reference_id: idpReferenceId,
        callback_url: config.IDP1_CALLBACK_URL,
        request_id: enableNodeRequestId,
        ial: 2.3,
        aal: 3,
        status: 'accept',
        accessor_id: responseAccessorId,
      });
      expect(response.status).to.equal(202);
    });

    it('IdP should receive accessor encrypt callback with correct data', async function() {
      this.timeout(15000);

      const accessorEncryptParams = await accessorEncryptPromise.promise;
      expect(accessorEncryptParams).to.deep.include({
        node_id: 'idp1',
        type: 'accessor_encrypt',
        accessor_id: responseAccessorId,
        key_type: 'RSA',
        padding: 'none',
        reference_id: idpReferenceId,
        request_id: enableNodeRequestId,
      });

      expect(accessorEncryptParams.request_message_padded_hash).to.be.a(
        'string'
      ).that.is.not.empty;
    });

    it('IdP shoud receive callback create response result with success = true', async function() {
      const responseResult = await responseResultPromise.promise;
      expect(responseResult).to.deep.include({
        node_id: 'idp1',
        type: 'response_result',
        reference_id: idpReferenceId,
        request_id: enableNodeRequestId,
        success: true,
      });
    });

    it('AS should receive data request', async function() {
      this.timeout(15000);
      const dataRequest = await dataRequestReceivedPromise.promise;
      expect(dataRequest).to.deep.include({
        request_id: enableNodeRequestId,
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

    it('AS should send data successfully', async function() {
      this.timeout(15000);
      const response = await asApi.sendData('proxy1', {
        node_id: 'proxy1_as4',
        requestId: enableNodeRequestId,
        serviceId: createRequestParams.data_request_list[0].service_id,
        reference_id: asReferenceId,
        callback_url: config.PROXY1_CALLBACK_URL,
        data,
      });
      expect(response.status).to.equal(202);

      const sendDataResult = await sendDataResultPromise.promise;
      expect(sendDataResult).to.deep.include({
        reference_id: asReferenceId,
        success: true,
      });
    });

    it('RP should receive completed request status with received data count = 1', async function() {
      this.timeout(15000);
      const requestStatus = await requestStatusCompletedPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: enableNodeRequestId,
        status: 'completed',
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
            received_data_count: 1,
          },
        ],
        response_valid_list: [
          {
            idp_id: 'idp1',
            valid_signature: true,
            valid_ial: true,
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

    it('RP should receive request closed status', async function() {
      this.timeout(10000);
      const requestStatus = await requestClosedPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: enableNodeRequestId,
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
            valid_signature: true,
            valid_ial: true,
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

    it('RP should get the correct data received from AS', async function() {
      const response = await rpApi.getDataFromAS('rp1', {
        requestId: enableNodeRequestId,
      });
      const dataArr = await response.json();
      expect(response.status).to.equal(200);

      expect(dataArr).to.have.lengthOf(1);
      expect(dataArr[0]).to.deep.include({
        source_node_id: 'proxy1_as4',
        service_id: createRequestParams.data_request_list[0].service_id,
        signature_sign_method: 'RSA-SHA256',
        data,
      });
      expect(dataArr[0].source_signature).to.be.a('string').that.is.not.empty;
      expect(dataArr[0].data_salt).to.be.a('string').that.is.not.empty;
    });

    after(async function() {
      this.timeout(10000);
      await ndidApi.enableNode('ndid1', {
        node_id: 'proxy1_as4',
      });
      await wait(5000);

      rpEventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
      proxy1EventEmitter.removeAllListeners('callback');
    });
  });
});

describe('NDID disable node RP behind proxy and enable node RP behind proxy test', function() {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const asReferenceId = generateReferenceId();

  const disableNodeCreateRequestResultPromise = createEventPromise(); // RP
  const enableNodeCreateRequestResultPromise = createEventPromise(); // RP
  const requestStatusPendingPromise = createEventPromise(); // RP
  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise(); // IDP
  const accessorEncryptPromise = createEventPromise(); // IDP
  const dataRequestReceivedPromise = createEventPromise(); // AS
  const sendDataResultPromise = createEventPromise(); // AS
  const requestStatusCompletedPromise = createEventPromise(); // RP
  const requestClosedPromise = createEventPromise(); // RP

  let createRequestParams;
  let disableNodeRequestId;
  let enableNodeRequestId;
  let requestMessageSalt;
  let requestMessageHash;

  let responseAccessorId;

  const data = JSON.stringify({
    test: 'test',
    withEscapedChar: 'test|fff||ss\\|NN\\\\|',
    arr: [1, 2, 3],
  });

  before(async function() {
    if (!ndidAvailable || !proxy1Available) {
      this.test.parent.pending = true;
      this.skip();
    }

    const identity = db.proxy1Idp4Identities.find(
      identity => identity.mode === 3
    );

    if (!identity) {
      throw new Error('No created identity to use');
    }

    namespace = identity.namespace;
    identifier = identity.identifier;

    createRequestParams = {
      node_id: 'proxy1_rp4',
      reference_id: rpReferenceId,
      callback_url: config.PROXY1_CALLBACK_URL,
      mode: 3,
      namespace,
      identifier,
      idp_id_list: ['proxy1_idp4'],
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
      request_message:
        'Test request message (enable proxy node and disable proxy node test)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    };

    proxy1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'create_request_result' &&
        callbackData.request_id === disableNodeRequestId
      ) {
        disableNodeCreateRequestResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'create_request_result' &&
        callbackData.request_id === enableNodeRequestId
      ) {
        enableNodeCreateRequestResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === enableNodeRequestId
      ) {
        if (callbackData.status === 'pending') {
          requestStatusPendingPromise.resolve(callbackData);
        } else if (callbackData.status === 'completed') {
          if (callbackData.closed) {
            requestClosedPromise.resolve(callbackData);
          } else {
            requestStatusCompletedPromise.resolve(callbackData);
          }
        }
      }
    });

    proxy1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === enableNodeRequestId
      ) {
        incomingRequestPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.reference_id === idpReferenceId
      ) {
        responseResultPromise.resolve(callbackData);
      }
    });

    proxy1EventEmitter.on('accessor_encrypt_callback', function(callbackData) {
      if (callbackData.request_id === enableNodeRequestId) {
        accessorEncryptPromise.resolve(callbackData);
      }
    });

    as1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'data_request' &&
        callbackData.request_id === enableNodeRequestId
      ) {
        dataRequestReceivedPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'send_data_result' &&
        callbackData.request_id === enableNodeRequestId
      ) {
        sendDataResultPromise.resolve(callbackData);
      }
    });
  });

  it('NDID should disable node RP behind proxy (proxy1_rp4) successfully', async function() {
    this.timeout(10000);

    const response = await ndidApi.disableNode('ndid1', {
      node_id: 'proxy1_rp4',
    });
    expect(response.status).to.equal(200);
    await wait(5000);
  });

  it('After NDID disable node RP behind proxy (proxy1_rp4) should create a request unsuccessfully', async function() {
    this.timeout(15000);
    const response = await rpApi.createRequest('proxy1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;
    disableNodeRequestId = responseBody.request_id;
    const createRequestResult = await disableNodeCreateRequestResultPromise.promise;
    expect(createRequestResult).to.deep.include({
      type: 'create_request_result',
      success: false,
      reference_id: createRequestParams.reference_id,
      request_id: disableNodeRequestId,
    });
    expect(createRequestResult.error.code).to.equal(15022);
  });

  it('NDID should enable node RP behind proxy (proxy1_rp4) successfully', async function() {
    this.timeout(10000);

    const response = await ndidApi.enableNode('ndid1', {
      node_id: 'proxy1_rp4',
    });
    expect(response.status).to.equal(200);
    await wait(5000);
  });

  it('After NDID enable node RP behind proxy (proxy1_rp4) should create a request successfully', async function() {
    this.timeout(15000);
    const response = await rpApi.createRequest('proxy1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;
    enableNodeRequestId = responseBody.request_id;
    const createRequestResult = await enableNodeCreateRequestResultPromise.promise;
    expect(createRequestResult).to.deep.include({
      type: 'create_request_result',
      success: true,
      reference_id: createRequestParams.reference_id,
      request_id: enableNodeRequestId,
    });
  });

  it('RP should receive pending request status', async function() {
    const requestStatus = await requestStatusPendingPromise.promise;
    expect(requestStatus).to.deep.include({
      request_id: enableNodeRequestId,
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

  it('IdP should receive incoming request callback', async function() {
    this.timeout(15000);
    const incomingRequest = await incomingRequestPromise.promise;

    const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
      dataRequest => {
        const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
        return {
          ...dataRequestWithoutParams,
        };
      }
    );
    expect(incomingRequest).to.deep.include({
      mode: createRequestParams.mode,
      request_id: enableNodeRequestId,
      request_message: createRequestParams.request_message,
      request_message_hash: hash(
        createRequestParams.request_message +
          incomingRequest.request_message_salt
      ),
      requester_node_id: createRequestParams.node_id,
      min_ial: createRequestParams.min_ial,
      min_aal: createRequestParams.min_aal,
      data_request_list: dataRequestListWithoutParams,
      request_timeout: createRequestParams.request_timeout,
    });
    expect(incomingRequest.reference_group_code).to.be.a('string').that.is.not
      .empty;
    expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
      .empty;
    expect(incomingRequest.creation_time).to.be.a('number');

    requestMessageSalt = incomingRequest.request_message_salt;
    requestMessageHash = incomingRequest.request_message_hash;
  });

  it('IdP should create response (accept) successfully', async function() {
    this.timeout(10000);
    const identity = db.proxy1Idp4Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    responseAccessorId = identity.accessors[0].accessorId;

    const response = await idpApi.createResponse('proxy1', {
      node_id: 'proxy1_idp4',
      reference_id: idpReferenceId,
      callback_url: config.PROXY1_CALLBACK_URL,
      request_id: enableNodeRequestId,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      accessor_id: responseAccessorId,
    });
    expect(response.status).to.equal(202);
  });

  it('IdP should receive accessor encrypt callback with correct data', async function() {
    this.timeout(15000);

    const accessorEncryptParams = await accessorEncryptPromise.promise;
    expect(accessorEncryptParams).to.deep.include({
      node_id: 'proxy1_idp4',
      type: 'accessor_encrypt',
      accessor_id: responseAccessorId,
      key_type: 'RSA',
      padding: 'none',
      reference_id: idpReferenceId,
      request_id: enableNodeRequestId,
    });

    expect(accessorEncryptParams.request_message_padded_hash).to.be.a('string')
      .that.is.not.empty;
  });

  it('IdP shoud receive callback create response result with success = true', async function() {
    const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      node_id: 'proxy1_idp4',
      type: 'response_result',
      reference_id: idpReferenceId,
      request_id: enableNodeRequestId,
      success: true,
    });
  });

  it('AS should receive data request', async function() {
    this.timeout(15000);
    const dataRequest = await dataRequestReceivedPromise.promise;
    expect(dataRequest).to.deep.include({
      request_id: enableNodeRequestId,
      mode: createRequestParams.mode,
      namespace,
      identifier,
      service_id: createRequestParams.data_request_list[0].service_id,
      request_params: createRequestParams.data_request_list[0].request_params,
      max_ial: 2.3,
      max_aal: 3,
      requester_node_id: createRequestParams.node_id,
    });
    expect(dataRequest.response_signature_list).to.have.lengthOf(1);
    expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is.not
      .empty;
  });

  it('AS should send data successfully', async function() {
    this.timeout(15000);
    const response = await asApi.sendData('as1', {
      requestId: enableNodeRequestId,
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

  it('RP should receive completed request status with received data count = 1', async function() {
    this.timeout(15000);
    const requestStatus = await requestStatusCompletedPromise.promise;
    expect(requestStatus).to.deep.include({
      request_id: enableNodeRequestId,
      status: 'completed',
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
          received_data_count: 1,
        },
      ],
      response_valid_list: [
        {
          idp_id: 'proxy1_idp4',
          valid_signature: true,
          valid_ial: true,
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

  it('RP should receive request closed status', async function() {
    this.timeout(10000);
    const requestStatus = await requestClosedPromise.promise;
    expect(requestStatus).to.deep.include({
      request_id: enableNodeRequestId,
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
          idp_id: 'proxy1_idp4',
          valid_signature: true,
          valid_ial: true,
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

  it('RP should get the correct data received from AS', async function() {
    const response = await rpApi.getDataFromAS('proxy1', {
      node_id: createRequestParams.node_id,
      requestId: enableNodeRequestId,
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

  after(async function() {
    this.timeout(10000);
    await ndidApi.enableNode('ndid1', {
      node_id: 'proxy1_rp4',
    });
    await wait(5000);

    proxy1EventEmitter.removeAllListeners('callback');
    proxy1EventEmitter.removeAllListeners('accessor_encrypt_callback');
    as1EventEmitter.removeAllListeners('callback');
  });
});

describe('NDID disable node IdP behind proxy and enable node IdP behind proxy test', function() {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const asReferenceId = generateReferenceId();

  const enableNodeCreateRequestResultPromise = createEventPromise(); // RP
  const requestStatusPendingPromise = createEventPromise(); // RP
  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise(); // IDP
  const accessorEncryptPromise = createEventPromise(); // IDP
  const dataRequestReceivedPromise = createEventPromise(); // AS
  const sendDataResultPromise = createEventPromise(); // AS
  const requestStatusCompletedPromise = createEventPromise(); // RP
  const requestClosedPromise = createEventPromise(); // RP

  let createRequestParams;
  let enableNodeRequestId;
  let requestMessageSalt;
  let requestMessageHash;

  let responseAccessorId;

  const data = JSON.stringify({
    test: 'test',
    withEscapedChar: 'test|fff||ss\\|NN\\\\|',
    arr: [1, 2, 3],
  });

  before(async function() {
    if (!ndidAvailable || !proxy1Available) {
      this.skip();
    }

    const identity = db.proxy1Idp4Identities.find(
      identity => identity.mode === 3
    );

    if (!identity) {
      throw new Error('No created identity to use');
    }

    namespace = identity.namespace;
    identifier = identity.identifier;

    createRequestParams = {
      node_id: 'proxy1_rp4',
      reference_id: rpReferenceId,
      callback_url: config.PROXY1_CALLBACK_URL,
      mode: 3,
      namespace,
      identifier,
      idp_id_list: ['proxy1_idp4'],
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
      request_message:
        'Test request message (enable IdP node and disable IdP node test)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    };

    proxy1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'create_request_result' &&
        callbackData.request_id === enableNodeRequestId
      ) {
        enableNodeCreateRequestResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === enableNodeRequestId
      ) {
        if (callbackData.status === 'pending') {
          requestStatusPendingPromise.resolve(callbackData);
        } else if (callbackData.status === 'completed') {
          if (callbackData.closed) {
            requestClosedPromise.resolve(callbackData);
          } else {
            requestStatusCompletedPromise.resolve(callbackData);
          }
        }
      }
    });

    proxy1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === enableNodeRequestId
      ) {
        incomingRequestPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.reference_id === idpReferenceId
      ) {
        responseResultPromise.resolve(callbackData);
      }
    });

    proxy1EventEmitter.on('accessor_encrypt_callback', function(callbackData) {
      if (callbackData.request_id === enableNodeRequestId) {
        accessorEncryptPromise.resolve(callbackData);
      }
    });

    as1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'data_request' &&
        callbackData.request_id === enableNodeRequestId
      ) {
        dataRequestReceivedPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'send_data_result' &&
        callbackData.request_id === enableNodeRequestId
      ) {
        sendDataResultPromise.resolve(callbackData);
      }
    });
  });

  it('NDID should disable node IdP behind proxy (proxy1_idp4) successfully', async function() {
    this.timeout(10000);

    const response = await ndidApi.disableNode('ndid1', {
      node_id: 'proxy1_idp4',
    });
    expect(response.status).to.equal(200);
    await wait(5000);
  });

  it('After NDID disable node IdP (proxy1_idp4) RP should query proxy1_idp4 not found', async function() {
    this.timeout(15000);
    const response = await commonApi.getIdP('rp1');
    const responseBody = await response.json();
    const foundIdp = responseBody.find(idp => idp.node_id === 'proxy1_idp4');
    expect(foundIdp).to.be.an('undefined');
  });

  it('After NDID disable node IdP behind proxy (proxy1_idp4) should create a request to disabled IdP (proxy1_idp4) unsuccessfully', async function() {
    this.timeout(15000);
    const response = await rpApi.createRequest('proxy1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20005);
  });

  it('NDID should enable node IdP behind proxy (proxy1_idp4) successfully', async function() {
    this.timeout(10000);
    const response = await ndidApi.enableNode('ndid1', {
      node_id: 'proxy1_idp4',
    });
    expect(response.status).to.equal(200);
    await wait(5000);
  });

  it('After NDID enable node IdP (proxy1_idp4) RP should query proxy1_idp4 found', async function() {
    this.timeout(15000);
    const response = await commonApi.getIdP('rp1');
    const responseBody = await response.json();
    const foundIdp = responseBody.find(idp => idp.node_id === 'proxy1_idp4');
    expect(foundIdp).to.be.an('object');
  });

  it('After NDID enable node IdP behind proxy (proxy1_idp4) RP should create a request to proxy1_idp4 successfully', async function() {
    this.timeout(15000);
    const response = await rpApi.createRequest('proxy1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;
    enableNodeRequestId = responseBody.request_id;
    const createRequestResult = await enableNodeCreateRequestResultPromise.promise;
    expect(createRequestResult).to.deep.include({
      type: 'create_request_result',
      success: true,
      reference_id: createRequestParams.reference_id,
      request_id: enableNodeRequestId,
    });
  });

  it('RP should receive pending request status', async function() {
    const requestStatus = await requestStatusPendingPromise.promise;
    expect(requestStatus).to.deep.include({
      request_id: enableNodeRequestId,
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

  it('IdP should receive incoming request callback', async function() {
    this.timeout(15000);
    const incomingRequest = await incomingRequestPromise.promise;

    const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
      dataRequest => {
        const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
        return {
          ...dataRequestWithoutParams,
        };
      }
    );
    expect(incomingRequest).to.deep.include({
      mode: createRequestParams.mode,
      request_id: enableNodeRequestId,
      request_message: createRequestParams.request_message,
      request_message_hash: hash(
        createRequestParams.request_message +
          incomingRequest.request_message_salt
      ),
      requester_node_id: createRequestParams.node_id,
      min_ial: createRequestParams.min_ial,
      min_aal: createRequestParams.min_aal,
      data_request_list: dataRequestListWithoutParams,
      request_timeout: createRequestParams.request_timeout,
    });
    expect(incomingRequest.reference_group_code).to.be.a('string').that.is.not
      .empty;
    expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
      .empty;
    expect(incomingRequest.creation_time).to.be.a('number');

    requestMessageSalt = incomingRequest.request_message_salt;
    requestMessageHash = incomingRequest.request_message_hash;
  });

  it('IdP should create response (accept) successfully', async function() {
    this.timeout(10000);
    const identity = db.proxy1Idp4Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    responseAccessorId = identity.accessors[0].accessorId;

    const response = await idpApi.createResponse('proxy1', {
      node_id: 'proxy1_idp4',
      reference_id: idpReferenceId,
      callback_url: config.PROXY1_CALLBACK_URL,
      request_id: enableNodeRequestId,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      accessor_id: responseAccessorId,
    });
    expect(response.status).to.equal(202);
  });

  it('IdP should receive accessor encrypt callback with correct data', async function() {
    this.timeout(15000);

    const accessorEncryptParams = await accessorEncryptPromise.promise;
    expect(accessorEncryptParams).to.deep.include({
      node_id: 'proxy1_idp4',
      type: 'accessor_encrypt',
      accessor_id: responseAccessorId,
      key_type: 'RSA',
      padding: 'none',
      reference_id: idpReferenceId,
      request_id: enableNodeRequestId,
    });

    expect(accessorEncryptParams.request_message_padded_hash).to.be.a('string')
      .that.is.not.empty;
  });

  it('IdP shoud receive callback create response result with success = true', async function() {
    const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      node_id: 'proxy1_idp4',
      type: 'response_result',
      reference_id: idpReferenceId,
      request_id: enableNodeRequestId,
      success: true,
    });
  });

  it('AS should receive data request', async function() {
    this.timeout(15000);
    const dataRequest = await dataRequestReceivedPromise.promise;
    expect(dataRequest).to.deep.include({
      request_id: enableNodeRequestId,
      mode: createRequestParams.mode,
      namespace,
      identifier,
      service_id: createRequestParams.data_request_list[0].service_id,
      request_params: createRequestParams.data_request_list[0].request_params,
      max_ial: 2.3,
      max_aal: 3,
      requester_node_id: createRequestParams.node_id,
    });
    expect(dataRequest.response_signature_list).to.have.lengthOf(1);
    expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is.not
      .empty;
  });

  it('AS should send data successfully', async function() {
    this.timeout(15000);
    const response = await asApi.sendData('as1', {
      requestId: enableNodeRequestId,
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

  it('RP should receive completed request status with received data count = 1', async function() {
    this.timeout(15000);
    const requestStatus = await requestStatusCompletedPromise.promise;
    expect(requestStatus).to.deep.include({
      request_id: enableNodeRequestId,
      status: 'completed',
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
          received_data_count: 1,
        },
      ],
      response_valid_list: [
        {
          idp_id: 'proxy1_idp4',
          valid_signature: true,
          valid_ial: true,
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

  it('RP should receive request closed status', async function() {
    this.timeout(10000);
    const requestStatus = await requestClosedPromise.promise;
    expect(requestStatus).to.deep.include({
      request_id: enableNodeRequestId,
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
          idp_id: 'proxy1_idp4',
          valid_signature: true,
          valid_ial: true,
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

  it('RP should get the correct data received from AS', async function() {
    const response = await rpApi.getDataFromAS('proxy1', {
      node_id: createRequestParams.node_id,
      requestId: enableNodeRequestId,
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

  after(async function() {
    this.timeout(10000);
    await ndidApi.enableNode('ndid1', {
      node_id: 'proxy1_idp4',
    });
    await wait(5000);

    proxy1EventEmitter.removeAllListeners('callback');
    proxy1EventEmitter.removeAllListeners('accessor_encrypt_callback');
    as1EventEmitter.removeAllListeners('callback');
  });
});

describe('NDID disable node AS behind proxy and enable node AS behind proxy test', function() {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const asReferenceId = generateReferenceId();

  const enableNodeCreateRequestResultPromise = createEventPromise(); // RP
  const requestStatusPendingPromise = createEventPromise(); // RP
  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise(); // IDP
  const accessorEncryptPromise = createEventPromise(); // IDP
  const dataRequestReceivedPromise = createEventPromise(); // AS
  const sendDataResultPromise = createEventPromise(); // AS
  const requestStatusCompletedPromise = createEventPromise(); // RP
  const requestClosedPromise = createEventPromise(); // RP

  let createRequestParams;
  let enableNodeRequestId;
  let requestMessageSalt;
  let requestMessageHash;

  let responseAccessorId;

  const data = JSON.stringify({
    test: 'test',
    withEscapedChar: 'test|fff||ss\\|NN\\\\|',
    arr: [1, 2, 3],
  });

  before(async function() {
    if (!ndidAvailable || !proxy1Available) {
      this.skip();
    }

    const identity = db.idp1Identities.find(
      identity => identity.mode === 3 && !identity.revokeIdentityAssociation
    );

    if (!identity) {
      throw new Error('No created identity to use');
    }

    namespace = identity.namespace;
    identifier = identity.identifier;

    createRequestParams = {
      node_id: 'proxy1_rp4',
      reference_id: rpReferenceId,
      callback_url: config.PROXY1_CALLBACK_URL,
      mode: 3,
      namespace,
      identifier,
      idp_id_list: ['idp1'],
      data_request_list: [
        {
          service_id: 'bank_statement',
          as_id_list: ['proxy1_as4'],
          min_as: 1,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
      ],
      request_message:
        'Test request message (enable AS node and disable AS node test)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    };

    proxy1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'create_request_result' &&
        callbackData.request_id === enableNodeRequestId
      ) {
        enableNodeCreateRequestResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === enableNodeRequestId
      ) {
        if (callbackData.status === 'pending') {
          requestStatusPendingPromise.resolve(callbackData);
        } else if (callbackData.status === 'completed') {
          if (callbackData.closed) {
            requestClosedPromise.resolve(callbackData);
          } else {
            requestStatusCompletedPromise.resolve(callbackData);
          }
        }
      }
    });

    idp1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === enableNodeRequestId
      ) {
        incomingRequestPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.reference_id === idpReferenceId
      ) {
        responseResultPromise.resolve(callbackData);
      }
    });

    idp1EventEmitter.on('accessor_encrypt_callback', function(callbackData) {
      if (callbackData.request_id === enableNodeRequestId) {
        accessorEncryptPromise.resolve(callbackData);
      }
    });

    proxy1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'data_request' &&
        callbackData.request_id === enableNodeRequestId
      ) {
        dataRequestReceivedPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'send_data_result' &&
        callbackData.request_id === enableNodeRequestId
      ) {
        sendDataResultPromise.resolve(callbackData);
      }
    });
  });

  it('NDID should disable node AS behind proxy (proxy1_as4) successfully', async function() {
    this.timeout(10000);

    const response = await ndidApi.disableNode('ndid1', {
      node_id: 'proxy1_as4',
    });
    expect(response.status).to.equal(200);
    await wait(5000);
  });

  it('After NDID disable node AS (proxy1_as4) RP should query list of AS by service id not found', async function() {
    this.timeout(15000);
    const response = await commonApi.getASByServiceId('rp1', 'bank_statement');
    const responseBody = await response.json();
    const foundAS = responseBody.find(as => as.node_id === 'proxy1_as4');
    expect(foundAS).to.be.an('undefined');
  });

  it('After NDID disable node AS behind proxy (proxy1_as4) RP should create a request with data request to disabled AS (proxy1_as4) unsuccessfully', async function() {
    this.timeout(15000);
    const response = await rpApi.createRequest('proxy1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20024);
  });

  it('NDID should enable node behind proxy (proxy1_as4) successfully', async function() {
    this.timeout(10000);
    const response = await ndidApi.enableNode('ndid1', {
      node_id: 'proxy1_as4',
    });
    expect(response.status).to.equal(200);
    await wait(5000);
  });

  it('After NDID enable node AS (proxy1_as4) RP should query list of AS by service id found', async function() {
    this.timeout(15000);
    const response = await commonApi.getASByServiceId('rp1', 'bank_statement');
    const responseBody = await response.json();
    const foundAS = responseBody.find(as => as.node_id === 'proxy1_as4');
    expect(foundAS).to.be.an('object');
  });

  it('After NDID enable node AS behind proxy (proxy1_as4) RP should create a request with data request to proxy1_as4 successfully', async function() {
    this.timeout(15000);
    const response = await rpApi.createRequest('proxy1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;
    enableNodeRequestId = responseBody.request_id;
    const createRequestResult = await enableNodeCreateRequestResultPromise.promise;
    expect(createRequestResult).to.deep.include({
      type: 'create_request_result',
      success: true,
      reference_id: createRequestParams.reference_id,
      request_id: enableNodeRequestId,
    });
  });

  it('RP should receive pending request status', async function() {
    const requestStatus = await requestStatusPendingPromise.promise;
    expect(requestStatus).to.deep.include({
      request_id: enableNodeRequestId,
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

  it('IdP should receive incoming request callback', async function() {
    this.timeout(15000);
    const incomingRequest = await incomingRequestPromise.promise;

    const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
      dataRequest => {
        const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
        return {
          ...dataRequestWithoutParams,
        };
      }
    );
    expect(incomingRequest).to.deep.include({
      mode: createRequestParams.mode,
      request_id: enableNodeRequestId,
      request_message: createRequestParams.request_message,
      request_message_hash: hash(
        createRequestParams.request_message +
          incomingRequest.request_message_salt
      ),
      requester_node_id: createRequestParams.node_id,
      min_ial: createRequestParams.min_ial,
      min_aal: createRequestParams.min_aal,
      data_request_list: dataRequestListWithoutParams,
      request_timeout: createRequestParams.request_timeout,
    });
    expect(incomingRequest.reference_group_code).to.be.a('string').that.is.not
      .empty;
    expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
      .empty;
    expect(incomingRequest.creation_time).to.be.a('number');

    requestMessageSalt = incomingRequest.request_message_salt;
    requestMessageHash = incomingRequest.request_message_hash;
  });

  it('IdP should create response (accept) successfully', async function() {
    this.timeout(10000);
    const identity = db.idp1Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    responseAccessorId = identity.accessors[0].accessorId;

    const response = await idpApi.createResponse('idp1', {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: enableNodeRequestId,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      accessor_id: responseAccessorId,
    });
    expect(response.status).to.equal(202);
  });

  it('IdP should receive accessor encrypt callback with correct data', async function() {
    this.timeout(15000);

    const accessorEncryptParams = await accessorEncryptPromise.promise;
    expect(accessorEncryptParams).to.deep.include({
      node_id: 'idp1',
      type: 'accessor_encrypt',
      accessor_id: responseAccessorId,
      key_type: 'RSA',
      padding: 'none',
      reference_id: idpReferenceId,
      request_id: enableNodeRequestId,
    });

    expect(accessorEncryptParams.request_message_padded_hash).to.be.a('string')
      .that.is.not.empty;
  });

  it('IdP shoud receive callback create response result with success = true', async function() {
    const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      node_id: 'idp1',
      type: 'response_result',
      reference_id: idpReferenceId,
      request_id: enableNodeRequestId,
      success: true,
    });
  });

  it('AS should receive data request', async function() {
    this.timeout(15000);
    const dataRequest = await dataRequestReceivedPromise.promise;
    expect(dataRequest).to.deep.include({
      request_id: enableNodeRequestId,
      mode: createRequestParams.mode,
      namespace,
      identifier,
      service_id: createRequestParams.data_request_list[0].service_id,
      request_params: createRequestParams.data_request_list[0].request_params,
      max_ial: 2.3,
      max_aal: 3,
      requester_node_id: createRequestParams.node_id,
    });
    expect(dataRequest.response_signature_list).to.have.lengthOf(1);
    expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is.not
      .empty;
  });

  it('AS should send data successfully', async function() {
    this.timeout(15000);
    const response = await asApi.sendData('proxy1', {
      node_id: 'proxy1_as4',
      requestId: enableNodeRequestId,
      serviceId: createRequestParams.data_request_list[0].service_id,
      reference_id: asReferenceId,
      callback_url: config.PROXY1_CALLBACK_URL,
      data,
    });
    expect(response.status).to.equal(202);

    const sendDataResult = await sendDataResultPromise.promise;
    expect(sendDataResult).to.deep.include({
      reference_id: asReferenceId,
      success: true,
    });
  });

  it('RP should receive completed request status with received data count = 1', async function() {
    this.timeout(15000);
    const requestStatus = await requestStatusCompletedPromise.promise;
    expect(requestStatus).to.deep.include({
      request_id: enableNodeRequestId,
      status: 'completed',
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
          received_data_count: 1,
        },
      ],
      response_valid_list: [
        {
          idp_id: 'idp1',
          valid_signature: true,
          valid_ial: true,
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

  it('RP should receive request closed status', async function() {
    this.timeout(10000);
    const requestStatus = await requestClosedPromise.promise;
    expect(requestStatus).to.deep.include({
      request_id: enableNodeRequestId,
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
          valid_signature: true,
          valid_ial: true,
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

  it('RP should get the correct data received from AS', async function() {
    const response = await rpApi.getDataFromAS('proxy1', {
      node_id: createRequestParams.node_id,
      requestId: enableNodeRequestId,
    });
    const dataArr = await response.json();
    expect(response.status).to.equal(200);

    expect(dataArr).to.have.lengthOf(1);
    expect(dataArr[0]).to.deep.include({
      source_node_id: 'proxy1_as4',
      service_id: createRequestParams.data_request_list[0].service_id,
      signature_sign_method: 'RSA-SHA256',
      data,
    });
    expect(dataArr[0].source_signature).to.be.a('string').that.is.not.empty;
    expect(dataArr[0].data_salt).to.be.a('string').that.is.not.empty;
  });

  after(async function() {
    this.timeout(10000);
    await ndidApi.enableNode('ndid1', {
      node_id: 'proxy1_as4',
    });
    await wait(5000);

    proxy1EventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
  });
});
