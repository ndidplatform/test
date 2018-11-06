import { expect } from 'chai';

import * as ndidApi from '../../../api/v2/ndid';
import * as commonApi from '../../../api/v2/common';
import * as rpApi from '../../../api/v2/rp';
import * as idpApi from '../../../api/v2/idp';
import * as asApi from '../../../api/v2/as';
import * as debugApi from '../../../api/v2/debug';
import { wait } from '../../../utils';

import {
  proxy1EventEmitter,
  idp1EventEmitter,
  rpEventEmitter,
} from '../../../callback_server';
import * as db from '../../../db';
import {
  createEventPromise,
  generateReferenceId,
  hashRequestMessageForConsent,
  createResponseSignature,
} from '../../../utils';
import * as config from '../../../config';

describe('NDID add RP node to proxy node and remove RP node from proxy node tests', function() {
  const asNodeId = 'proxy1_as4';

  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const asReferenceId = generateReferenceId();

  const ProxyCreateRequestResultPromise = createEventPromise(); // Proxy RP
  const ProxyRequestStatusPendingPromise = createEventPromise(); // Proxy RP
  const incomingRequestPromise1 = createEventPromise(); // Proxy IDP
  const responseResultPromise1 = createEventPromise(); // Proxy IDP
  const ProxyRequestStatusConfirmedPromise = createEventPromise(); // Proxy RP
  const ProxyRequestStatusCompletedPromise = createEventPromise(); // Proxy RP
  const ProxyRequestClosedPromise = createEventPromise(); // Proxy RP
  const dataRequestReceivedPromise1 = createEventPromise(); // Proxy AS
  const sendDataResultPromise1 = createEventPromise(); // Proxy AS

  const createRequestResultPromise = createEventPromise(); // RP
  const requestStatusPendingPromise = createEventPromise(); // RP
  const requestStatusConfirmedPromise = createEventPromise(); // RP
  const incomingRequestPromise2 = createEventPromise(); // IDP
  const responseResultPromise2 = createEventPromise(); // IDP
  const requestStatusCompletedPromise = createEventPromise(); // RP
  const requestClosedPromise = createEventPromise(); // RP
  const dataRequestReceivedPromise2 = createEventPromise(); // AS
  const sendDataResultPromise2 = createEventPromise(); // AS

  let proxyCreateRequestParams;
  let createRequestParams;

  let requestId1;
  let requestId2;
  let requestMessageSalt;
  let requestMessageHash;

  let originalRPMqAddresses;

  const data = JSON.stringify({
    test: 'test',
    withEscapedChar: 'test|fff||ss\\|NN\\\\|',
    arr: [1, 2, 3],
  });

  before(async function() {
    if (!config.USE_EXTERNAL_CRYPTO_SERVICE) {
      this.test.parent.pending = true;
      this.skip();
    }
    this.timeout(10000);
    if (db.idp1Identities[0] == null) {
      throw new Error('No created identity to use');
    }

    const response = await commonApi.getNodeInfo('rp1');
    const responseBody = await response.json();
    originalRPMqAddresses = responseBody.mq;

    namespace = db.idp1Identities[0].namespace;
    identifier = db.idp1Identities[0].identifier;

    proxyCreateRequestParams = {
      node_id: 'rp1',
      reference_id: rpReferenceId,
      callback_url: config.PROXY1_CALLBACK_URL,
      mode: 3,
      namespace,
      identifier,
      idp_id_list: [],
      data_request_list: [
        {
          service_id: 'bank_statement',
          as_id_list: [asNodeId],
          min_as: 1,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
      ],
      request_message:
        'Test request message (mode 3) ทดสอบภาษาไทย should\\|be|able\\\\|to|send\\\\\\|this',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    };

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
          as_id_list: [asNodeId],
          min_as: 1,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
      ],
      request_message:
        'Test request message (mode 3) ทดสอบภาษาไทย should\\|be|able\\\\|to|send\\\\\\|this',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    };

    proxy1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'create_request_result' &&
        callbackData.reference_id === rpReferenceId
      ) {
        ProxyCreateRequestResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === requestId1
      ) {
        if (callbackData.status === 'pending') {
          ProxyRequestStatusPendingPromise.resolve(callbackData);
        } else if (callbackData.status === 'confirmed') {
          ProxyRequestStatusConfirmedPromise.resolve(callbackData);
        } else if (callbackData.status === 'completed') {
          if (callbackData.closed) {
            ProxyRequestClosedPromise.resolve(callbackData);
          } else {
            ProxyRequestStatusCompletedPromise.resolve(callbackData);
          }
        }
      }
    });

    proxy1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'data_request' &&
        callbackData.request_id === requestId1
      ) {
        dataRequestReceivedPromise1.resolve(callbackData);
      } else if (
        callbackData.type === 'send_data_result' &&
        callbackData.request_id === requestId1
      ) {
        sendDataResultPromise1.resolve(callbackData);
      } else if (
        callbackData.type === 'data_request' &&
        callbackData.request_id === requestId2
      ) {
        dataRequestReceivedPromise2.resolve(callbackData);
      } else if (
        callbackData.type === 'send_data_result' &&
        callbackData.request_id === requestId2
      ) {
        sendDataResultPromise2.resolve(callbackData);
      }
    });

    idp1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId1
      ) {
        incomingRequestPromise1.resolve(callbackData);
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.request_id === requestId1
      ) {
        responseResultPromise1.resolve(callbackData);
      } else if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId2
      ) {
        incomingRequestPromise2.resolve(callbackData);
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.request_id === requestId2
      ) {
        responseResultPromise2.resolve(callbackData);
      }
    });

    rpEventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'create_request_result' &&
        callbackData.reference_id === rpReferenceId
      ) {
        createRequestResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === requestId2
      ) {
        if (callbackData.status === 'pending') {
          requestStatusPendingPromise.resolve(callbackData);
        } else if (callbackData.status === 'confirmed') {
          requestStatusConfirmedPromise.resolve(callbackData);
        } else if (callbackData.status === 'completed') {
          if (callbackData.closed) {
            requestClosedPromise.resolve(callbackData);
          } else {
            requestStatusCompletedPromise.resolve(callbackData);
          }
        }
      }
    });
  });

  it('NDID should add RP node (rp1) to proxy1', async function() {
    this.timeout(10000);
    const response = await ndidApi.addNodeToProxyNode('ndid1', {
      node_id: 'rp1',
      proxy_node_id: 'proxy1',
      config: 'KEY_ON_PROXY',
    });
    expect(response.status).to.equal(204);
    await wait(3000);
  });

  it('RP node (rp1) should add to proxy1 successfully', async function() {
    this.timeout(10000);
    const response = await commonApi.getNodeInfo('proxy1', {
      node_id: 'rp1',
    });
    const responseBody = await response.json();
    expect(responseBody.role).to.equal('RP');
    expect(responseBody.public_key).to.be.a('string').that.is.not.empty;
    expect(responseBody.proxy.config).to.equal('KEY_ON_PROXY');
  });

  it('After add RP node (rp1) to proxy1 should it create a request successfully', async function() {
    this.timeout(10000);
    const response = await rpApi.createRequest(
      'proxy1',
      proxyCreateRequestParams
    );
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

    requestId1 = responseBody.request_id;

    const createRequestResult = await ProxyCreateRequestResultPromise.promise;
    expect(createRequestResult).to.deep.include({
      node_id: proxyCreateRequestParams.node_id,
      success: true,
    });
  });

  it('RP should receive pending request status', async function() {
    this.timeout(15000);
    const requestStatus = await ProxyRequestStatusPendingPromise.promise;
    expect(requestStatus).to.deep.include({
      node_id: proxyCreateRequestParams.node_id,
      request_id: requestId1,
      status: 'pending',
      mode: proxyCreateRequestParams.mode,
      min_idp: proxyCreateRequestParams.min_idp,
      answered_idp_count: 0,
      closed: false,
      timed_out: false,
      service_list: [
        {
          service_id: proxyCreateRequestParams.data_request_list[0].service_id,
          min_as: proxyCreateRequestParams.data_request_list[0].min_as,
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
    const incomingRequest = await incomingRequestPromise1.promise;
    const dataRequestListWithoutParams = proxyCreateRequestParams.data_request_list.map(
      (dataRequest) => {
        const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
        return {
          ...dataRequestWithoutParams,
        };
      }
    );

    expect(incomingRequest).to.deep.include({
      node_id: 'idp1',
      mode: proxyCreateRequestParams.mode,
      request_id: requestId1,
      namespace: proxyCreateRequestParams.namespace,
      identifier: proxyCreateRequestParams.identifier,
      request_message: proxyCreateRequestParams.request_message,
      request_message_hash: hashRequestMessageForConsent(
        proxyCreateRequestParams.request_message,
        incomingRequest.initial_salt,
        requestId1
      ),
      requester_node_id: proxyCreateRequestParams.node_id,
      min_ial: proxyCreateRequestParams.min_ial,
      min_aal: proxyCreateRequestParams.min_aal,
      data_request_list: dataRequestListWithoutParams,
    });
    expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
      .empty;
    expect(incomingRequest.creation_time).to.be.a('number');

    requestMessageSalt = incomingRequest.request_message_salt;
    requestMessageHash = incomingRequest.request_message_hash;
  });

  it('IdP should create response (accept) successfully', async function() {
    this.timeout(15000);
    const identity = db.idp1Identities.find(
      (identity) =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    const response = await idpApi.createResponse('idp1', {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId1,
      namespace: proxyCreateRequestParams.namespace,
      identifier: proxyCreateRequestParams.identifier,
      ial: 2.3,
      aal: 3,
      secret: identity.accessors[0].secret,
      status: 'accept',
      signature: createResponseSignature(
        identity.accessors[0].accessorPrivateKey,
        requestMessageHash
      ),
      accessor_id: identity.accessors[0].accessorId,
    });
    expect(response.status).to.equal(202);

    const responseResult = await responseResultPromise1.promise;
    expect(responseResult).to.deep.include({
      node_id: 'idp1',
      reference_id: idpReferenceId,
      request_id: requestId1,
      success: true,
    });
  });

  it('RP should receive confirmed request status with valid proofs', async function() {
    this.timeout(15000);
    const requestStatus = await ProxyRequestStatusConfirmedPromise.promise;
    expect(requestStatus).to.deep.include({
      request_id: requestId1,
      status: 'confirmed',
      mode: proxyCreateRequestParams.mode,
      min_idp: proxyCreateRequestParams.min_idp,
      answered_idp_count: 1,
      closed: false,
      timed_out: false,
      service_list: [
        {
          service_id: proxyCreateRequestParams.data_request_list[0].service_id,
          min_as: proxyCreateRequestParams.data_request_list[0].min_as,
          signed_data_count: 0,
          received_data_count: 0,
        },
      ],
      response_valid_list: [
        {
          idp_id: 'idp1',
          valid_signature: true,
          valid_proof: true,
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

  it('AS should receive data request', async function() {
    this.timeout(15000);
    const dataRequest = await dataRequestReceivedPromise1.promise;
    expect(dataRequest).to.deep.include({
      request_id: requestId1,
      mode: proxyCreateRequestParams.mode,
      namespace,
      identifier,
      service_id: proxyCreateRequestParams.data_request_list[0].service_id,
      request_params:
        proxyCreateRequestParams.data_request_list[0].request_params,
      max_ial: 2.3,
      max_aal: 3,
      requester_node_id: 'rp1',
    });
    expect(dataRequest.response_signature_list).to.have.lengthOf(1);
    expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is.not
      .empty;
  });

  it('AS should send data successfully', async function() {
    this.timeout(15000);
    const response = await asApi.sendData('proxy1', {
      node_id: asNodeId,
      requestId: requestId1,
      serviceId: proxyCreateRequestParams.data_request_list[0].service_id,
      reference_id: asReferenceId,
      callback_url: config.PROXY1_CALLBACK_URL,
      data,
    });
    expect(response.status).to.equal(202);

    const sendDataResult = await sendDataResultPromise1.promise;
    expect(sendDataResult).to.deep.include({
      node_id: asNodeId,
      reference_id: asReferenceId,
      success: true,
    });
  });

  it('RP should receive completed request status with valid proofs', async function() {
    this.timeout(15000);
    const requestStatus = await ProxyRequestStatusCompletedPromise.promise;
    expect(requestStatus).to.deep.include({
      node_id: proxyCreateRequestParams.node_id,
      request_id: requestId1,
      status: 'completed',
      mode: proxyCreateRequestParams.mode,
      min_idp: proxyCreateRequestParams.min_idp,
      answered_idp_count: 1,
      closed: false,
      timed_out: false,
      service_list: [
        {
          service_id: proxyCreateRequestParams.data_request_list[0].service_id,
          min_as: proxyCreateRequestParams.data_request_list[0].min_as,
          signed_data_count: 1,
          received_data_count: 1,
        },
      ],
      response_valid_list: [
        {
          idp_id: 'idp1',
          valid_signature: true,
          valid_proof: true,
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
    this.timeout(15000);
    const requestStatus = await ProxyRequestClosedPromise.promise;
    expect(requestStatus).to.deep.include({
      node_id: proxyCreateRequestParams.node_id,
      request_id: requestId1,
      status: 'completed',
      mode: proxyCreateRequestParams.mode,
      min_idp: proxyCreateRequestParams.min_idp,
      answered_idp_count: 1,
      closed: true,
      timed_out: false,
      service_list: [
        {
          service_id: proxyCreateRequestParams.data_request_list[0].service_id,
          min_as: proxyCreateRequestParams.data_request_list[0].min_as,
          signed_data_count: 1,
          received_data_count: 1,
        },
      ],
      response_valid_list: [
        {
          idp_id: 'idp1',
          valid_signature: true,
          valid_proof: true,
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

  it('NDID should remove RP node (rp1) from proxy1', async function() {
    this.timeout(10000);
    const response = await ndidApi.removeNodeFromProxyNode('ndid1', {
      node_id: 'rp1',
    });
    expect(response.status).to.equal(204);
    await wait(3000);
  });

  it('RP node (rp1) should remove from proxy1 successfully', async function() {
    this.timeout(10000);
    const response = await commonApi.getNodeInfo('rp1');
    const responseBody = await response.json();
    expect(responseBody.role).to.equal('RP');
    expect(responseBody.public_key).to.be.a('string').that.is.not.empty;
    expect(responseBody.proxy).to.be.undefined;
    expect(responseBody.mq).to.be.null;
  });

  it('Should set MQ addresses (use debug) for RP node (rp1) successfully', async function() {
    this.timeout(20000);

    await debugApi.transact('rp1', {
      nodeId: 'rp1',
      fnName: 'SetMqAddresses',
      addresses: originalRPMqAddresses,
    });

    await wait(3000);
  });

  it('RP node (rp1) should set MQ addresses successfully', async function() {
    this.timeout(10000);
    const response = await commonApi.getNodeInfo('rp1');
    const responseBody = await response.json();
    expect(responseBody.role).to.equal('RP');
    expect(responseBody.public_key).to.be.a('string').that.is.not.empty;
    expect(responseBody.proxy).to.be.undefined;
    expect(responseBody.mq).to.deep.equal(originalRPMqAddresses);
  });

  it('After remove RP node (rp1) from proxy1 it should create a request successfully', async function() {
    this.timeout(15000);

    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

    requestId2 = responseBody.request_id;

    const createRequestResult = await createRequestResultPromise.promise;
    expect(createRequestResult).to.deep.include({
      node_id: 'rp1',
      success: true,
    });
  });

  it('RP should receive pending request status', async function() {
    this.timeout(15000);
    const requestStatus = await requestStatusPendingPromise.promise;
    expect(requestStatus).to.deep.include({
      request_id: requestId2,
      status: 'pending',
      mode: createRequestParams.mode,
      min_idp: createRequestParams.min_idp,
      answered_idp_count: 0,
      closed: false,
      timed_out: false,
      service_list: [
        {
          service_id: proxyCreateRequestParams.data_request_list[0].service_id,
          min_as: proxyCreateRequestParams.data_request_list[0].min_as,
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
    const incomingRequest = await incomingRequestPromise2.promise;
    const dataRequestListWithoutParams = proxyCreateRequestParams.data_request_list.map(
      (dataRequest) => {
        const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
        return {
          ...dataRequestWithoutParams,
        };
      }
    );
    expect(incomingRequest).to.deep.include({
      node_id: 'idp1',
      mode: createRequestParams.mode,
      request_id: requestId2,
      namespace: createRequestParams.namespace,
      identifier: createRequestParams.identifier,
      request_message: createRequestParams.request_message,
      request_message_hash: hashRequestMessageForConsent(
        createRequestParams.request_message,
        incomingRequest.initial_salt,
        requestId2
      ),
      requester_node_id: 'rp1',
      min_ial: createRequestParams.min_ial,
      min_aal: createRequestParams.min_aal,
      data_request_list: dataRequestListWithoutParams,
    });
    expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
      .empty;
    expect(incomingRequest.creation_time).to.be.a('number');

    requestMessageSalt = incomingRequest.request_message_salt;
    requestMessageHash = incomingRequest.request_message_hash;
  });

  it('IdP should create response (accept) successfully', async function() {
    this.timeout(15000);
    const identity = db.idp1Identities.find(
      (identity) =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    const response = await idpApi.createResponse('idp1', {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId2,
      namespace: createRequestParams.namespace,
      identifier: createRequestParams.identifier,
      ial: 2.3,
      aal: 3,
      secret: identity.accessors[0].secret,
      status: 'accept',
      signature: createResponseSignature(
        identity.accessors[0].accessorPrivateKey,
        requestMessageHash
      ),
      accessor_id: identity.accessors[0].accessorId,
    });
    expect(response.status).to.equal(202);

    const responseResult = await responseResultPromise2.promise;
    expect(responseResult).to.deep.include({
      node_id: 'idp1',
      reference_id: idpReferenceId,
      request_id: requestId2,
      success: true,
    });
  });

  it('RP should receive confirmed request status with valid proofs', async function() {
    this.timeout(15000);
    const requestStatus = await requestStatusConfirmedPromise.promise;
    expect(requestStatus).to.deep.include({
      request_id: requestId2,
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
          valid_signature: true,
          valid_proof: true,
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

  it('AS should receive data request', async function() {
    this.timeout(15000);
    const dataRequest = await dataRequestReceivedPromise2.promise;
    expect(dataRequest).to.deep.include({
      request_id: requestId2,
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
    expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is.not
      .empty;
  });

  it('AS should send data successfully', async function() {
    this.timeout(15000);
    const response = await asApi.sendData('proxy1', {
      node_id: asNodeId,
      requestId: requestId2,
      serviceId: createRequestParams.data_request_list[0].service_id,
      reference_id: asReferenceId,
      callback_url: config.PROXY1_CALLBACK_URL,
      data,
    });
    expect(response.status).to.equal(202);

    const sendDataResult = await sendDataResultPromise2.promise;
    expect(sendDataResult).to.deep.include({
      node_id: asNodeId,
      reference_id: asReferenceId,
      request_id: requestId2,
      success: true,
    });
  });

  it('RP should receive completed request status with valid proofs', async function() {
    this.timeout(15000);
    const requestStatus = await requestStatusCompletedPromise.promise;
    expect(requestStatus).to.deep.include({
      node_id: 'rp1',
      request_id: requestId2,
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
          valid_proof: true,
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
    this.timeout(15000);
    const requestStatus = await requestClosedPromise.promise;
    expect(requestStatus).to.deep.include({
      node_id: 'rp1',
      request_id: requestId2,
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
          valid_proof: true,
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

  after(async function() {
    this.timeout(15000);
    const response = await commonApi.getNodeInfo('rp1');
    const responseBody = await response.json();
    if (responseBody.proxy) {
      await ndidApi.removeNodeFromProxyNode('ndid1', {
        node_id: 'rp1',
      });
      await debugApi.transact('rp1', {
        nodeId: 'rp1',
        fnName: 'SetMqAddresses',
        addresses: originalRPMqAddresses,
      });
      await wait(3000);
    }
  });
});
