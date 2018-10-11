import { expect } from 'chai';

import * as ndidApi from '../../../api/v2/ndid';
import * as commonApi from '../../../api/v2/common';
import * as rpApi from '../../../api/v2/rp';
import * as idpApi from '../../../api/v2/idp';
import * as asApi from '../../../api/v2/as';
import * as serverCommonApi from '../../../api/common';
import { wait } from '../../../utils';

import {
  proxy1EventEmitter,
  proxy2EventEmitter,
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

describe('NDID update node config', function() {
  it('NDID should update RP node (proxy1_rp4) config to KEY_ON_NODE', async function() {
    this.timeout(10000);
    const response = await ndidApi.updateNodeProxyNode('ndid1', {
      node_id: 'proxy1_rp4',
      proxy_node_id: 'proxy1',
      config: 'KEY_ON_NODE',
    });
    expect(response.status).to.equal(204);
    await wait(3000);
  });

  it('RP node (proxy1_rp4) should be updated config successfully', async function() {
    this.timeout(10000);
    const response = await commonApi.getNodeInfo('proxy1', {
      node_id: 'proxy1_rp4',
    });
    const responseBody = await response.json();
    expect(responseBody.role).to.equal('RP');
    expect(responseBody.public_key).to.be.a('string').that.is.not.empty;
    expect(responseBody.proxy.node_id).to.equal('proxy1');
    expect(responseBody.proxy.config).to.equal('KEY_ON_NODE');
  });

  after(async function() {
    this.timeout(15000);
    await ndidApi.updateNodeProxyNode('ndid1', {
      node_id: 'proxy1_rp4',
      proxy_node_id: 'proxy1',
      config: 'KEY_ON_PROXY',
    });
    await wait(3000);
  });
});

describe('NDID update RP node to other proxy node', function() {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise(); // RP
  const requestStatusPendingPromise = createEventPromise(); // RP
  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise(); // IDP
  const requestStatusCompletedPromise = createEventPromise(); // RP
  const requestClosedPromise = createEventPromise(); // RP

  let createRequestParams;

  let requestId;
  let requestMessageSalt;
  let requestMessageHash;

  const requestStatusUpdates = [];

  before(function() {
    if (db.idp1Identities[0] == null) {
      throw new Error('No created identity to use');
    }

    namespace = db.idp1Identities[0].namespace;
    identifier = db.idp1Identities[0].identifier;

    createRequestParams = {
      node_id: 'proxy1_rp4',
      reference_id: rpReferenceId,
      callback_url: config.PROXY2_CALLBACK_URL,
      mode: 3,
      namespace,
      identifier,
      idp_id_list: [],
      data_request_list: [],
      request_message:
        'Test request message (mode 3) ทดสอบภาษาไทย should\\|be|able\\\\|to|send\\\\\\|this',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    };

    proxy2EventEmitter.on('callback', function(callbackData) {
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
        callbackData.request_id === requestId
      ) {
        incomingRequestPromise.resolve(callbackData);
      } else if (callbackData.type === 'response_result') {
        responseResultPromise.resolve(callbackData);
      }
    });
  });

  it('NDID should update RP node (proxy1_rp4) from proxy1 to proxy2 (without config)', async function() {
    this.timeout(10000);
    const response = await ndidApi.updateNodeProxyNode('ndid1', {
      node_id: 'proxy1_rp4',
      proxy_node_id: 'proxy2',
    });
    expect(response.status).to.equal(204);
    await wait(3000);
  });

  it('RP node (proxy1_rp4) should be updated to proxy2 successfully', async function() {
    this.timeout(10000);
    const response = await commonApi.getNodeInfo('proxy2', {
      node_id: 'proxy1_rp4',
    });
    const responseBody = await response.json();
    expect(responseBody.role).to.equal('RP');
    expect(responseBody.public_key).to.be.a('string').that.is.not.empty;
    expect(responseBody.proxy.node_id).to.equal('proxy2');
    expect(responseBody.proxy.config).to.equal('KEY_ON_PROXY');
  });

  if (!config.USE_EXTERNAL_CRYPTO_SERVICE) {
    it('Re-initialize node keys on proxy2', async function() {
      const response = await serverCommonApi.reinitNodeKeys('proxy2');
      expect(response.status).to.equal(204);
    });
  }

  it('After update RP node (proxy1_rp4) to proxy2 should create a request successfully', async function() {
    this.timeout(10000);
    const response = await rpApi.createRequest('proxy2', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

    requestId = responseBody.request_id;

    const createRequestResult = await createRequestResultPromise.promise;
    expect(createRequestResult).to.deep.include({
      node_id: createRequestParams.node_id,
      success: true,
    });
  });

  it('RP should receive pending request status', async function() {
    this.timeout(10000);
    const requestStatus = await requestStatusPendingPromise.promise;
    expect(requestStatus).to.deep.include({
      node_id: createRequestParams.node_id,
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
    expect(requestStatus.block_height).is.a('number');
  });

  it('IdP should receive incoming request callback', async function() {
    this.timeout(15000);
    const incomingRequest = await incomingRequestPromise.promise;
    expect(incomingRequest).to.deep.include({
      node_id: 'idp1',
      mode: createRequestParams.mode,
      request_id: requestId,
      namespace: createRequestParams.namespace,
      identifier: createRequestParams.identifier,
      request_message: createRequestParams.request_message,
      request_message_hash: hashRequestMessageForConsent(
        createRequestParams.request_message,
        incomingRequest.initial_salt,
        requestId
      ),
      requester_node_id: createRequestParams.node_id,
      min_ial: createRequestParams.min_ial,
      min_aal: createRequestParams.min_aal,
      data_request_list: createRequestParams.data_request_list,
    });
    expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
      .empty;
    expect(incomingRequest.creation_time).to.be.a('number');
    expect(incomingRequest.creation_block_height).to.be.a('number');

    requestMessageSalt = incomingRequest.request_message_salt;
    requestMessageHash = incomingRequest.request_message_hash;
  });

  it('IdP should create response (accept) successfully', async function() {
    this.timeout(10000);
    const identity = db.idp1Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    const response = await idpApi.createResponse('idp1', {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
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

    const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      node_id: 'idp1',
      reference_id: idpReferenceId,
      request_id: requestId,
      success: true,
    });
  });

  it('RP should receive completed request status with valid proofs', async function() {
    this.timeout(15000);
    const requestStatus = await requestStatusCompletedPromise.promise;
    expect(requestStatus).to.deep.include({
      node_id: createRequestParams.node_id,
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
          valid_signature: true,
          valid_proof: true,
          valid_ial: true,
        },
      ],
    });
    expect(requestStatus).to.have.property('block_height');
    expect(requestStatus.block_height).is.a('number');
  });

  it('RP should receive request closed status', async function() {
    this.timeout(10000);
    const requestStatus = await requestClosedPromise.promise;
    expect(requestStatus).to.deep.include({
      node_id: createRequestParams.node_id,
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
          valid_signature: true,
          valid_proof: true,
          valid_ial: true,
        },
      ],
    });
    expect(requestStatus).to.have.property('block_height');
    expect(requestStatus.block_height).is.a('number');
  });

  it('RP should receive 3 request status updates', function() {
    expect(requestStatusUpdates).to.have.lengthOf(3);
  });

  after(async function() {
    this.timeout(15000);
    await ndidApi.updateNodeProxyNode('ndid1', {
      node_id: 'proxy1_rp4',
      proxy_node_id: 'proxy1',
    });
    await wait(3000);
  });
});

describe('NDID update IdP node to other proxy node', function() {
  const idpNodeId = 'proxy1_idp4';

  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise(); // RP
  const requestStatusPendingPromise = createEventPromise(); // RP
  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise(); // IDP
  const requestStatusCompletedPromise = createEventPromise(); // RP
  const requestClosedPromise = createEventPromise(); // RP

  let createRequestParams;

  let requestId;
  let requestMessageHash;

  const requestStatusUpdates = [];

  before(function() {
    if (db.proxy1Idp4Identities[0] == null) {
      throw new Error('No created identity to use');
    }

    namespace = db.proxy1Idp4Identities[0].namespace;
    identifier = db.proxy1Idp4Identities[0].identifier;

    createRequestParams = {
      node_id: 'proxy1_rp4',
      reference_id: rpReferenceId,
      callback_url: config.PROXY1_CALLBACK_URL,
      mode: 3,
      namespace,
      identifier,
      idp_id_list: [],
      data_request_list: [],
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
        createRequestResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === requestId
      ) {
        requestStatusUpdates.push(callbackData);
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

    proxy2EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId
      ) {
        incomingRequestPromise.resolve(callbackData);
      } else if (callbackData.type === 'response_result') {
        responseResultPromise.resolve(callbackData);
      }
    });
  });

  it('NDID should update IdP node (proxy1_idp4) from proxy1 to proxy2 (with config)', async function() {
    this.timeout(10000);
    const response = await ndidApi.updateNodeProxyNode('ndid1', {
      node_id: 'proxy1_idp4',
      proxy_node_id: 'proxy2',
      config: 'KEY_ON_PROXY',
    });
    expect(response.status).to.equal(204);
    await wait(3000);
  });

  it('IdP node (proxy1_idp4) should be updated successfully', async function() {
    this.timeout(10000);
    const response = await commonApi.getNodeInfo('proxy2', {
      node_id: 'proxy1_idp4',
    });
    const responseBody = await response.json();
    expect(responseBody.role).to.equal('IdP');
    expect(responseBody.public_key).to.be.a('string').that.is.not.empty;
    expect(responseBody.proxy.node_id).to.equal('proxy2');
    expect(responseBody.proxy.config).to.equal('KEY_ON_PROXY');
  });

  if (!config.USE_EXTERNAL_CRYPTO_SERVICE) {
    it('Re-initialize node keys on proxy2', async function() {
      const response = await serverCommonApi.reinitNodeKeys('proxy2');
      expect(response.status).to.equal(204);
    });
  }

  it('RP should create a request successfully', async function() {
    this.timeout(10000);
    const response = await rpApi.createRequest('proxy1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

    requestId = responseBody.request_id;

    const createRequestResult = await createRequestResultPromise.promise;
    expect(createRequestResult).to.deep.include({
      node_id: createRequestParams.node_id,
      success: true,
    });
  });

  it('RP should receive pending request status', async function() {
    this.timeout(10000);
    const requestStatus = await requestStatusPendingPromise.promise;
    expect(requestStatus).to.deep.include({
      node_id: createRequestParams.node_id,
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
    expect(requestStatus.block_height).is.a('number');
  });

  it('After update IdP node (proxy1_idp4) to proxy2 should receive incoming request callback', async function() {
    this.timeout(15000);
    const incomingRequest = await incomingRequestPromise.promise;
    expect(incomingRequest).to.deep.include({
      node_id: idpNodeId,
      mode: createRequestParams.mode,
      request_id: requestId,
      namespace: createRequestParams.namespace,
      identifier: createRequestParams.identifier,
      request_message: createRequestParams.request_message,
      request_message_hash: hashRequestMessageForConsent(
        createRequestParams.request_message,
        incomingRequest.initial_salt,
        requestId
      ),
      requester_node_id: createRequestParams.node_id,
      min_ial: createRequestParams.min_ial,
      min_aal: createRequestParams.min_aal,
      data_request_list: createRequestParams.data_request_list,
    });
    expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
      .empty;
    expect(incomingRequest.creation_time).to.be.a('number');
    expect(incomingRequest.creation_block_height).to.be.a('number');

    requestMessageHash = incomingRequest.request_message_hash;
  });

  it('IdP should create response (accept) successfully', async function() {
    this.timeout(10000);
    const identity = db.proxy1Idp4Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    const response = await idpApi.createResponse('proxy2', {
      node_id: idpNodeId,
      reference_id: idpReferenceId,
      callback_url: config.PROXY2_CALLBACK_URL,
      request_id: requestId,
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

    const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      node_id: idpNodeId,
      reference_id: idpReferenceId,
      request_id: requestId,
      success: true,
    });
  });

  it('RP should receive completed request status with valid proofs', async function() {
    this.timeout(15000);
    const requestStatus = await requestStatusCompletedPromise.promise;
    expect(requestStatus).to.deep.include({
      node_id: createRequestParams.node_id,
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
          idp_id: idpNodeId,
          valid_signature: true,
          valid_proof: true,
          valid_ial: true,
        },
      ],
    });
    expect(requestStatus).to.have.property('block_height');
    expect(requestStatus.block_height).is.a('number');
  });

  it('RP should receive request closed status', async function() {
    this.timeout(10000);
    const requestStatus = await requestClosedPromise.promise;
    expect(requestStatus).to.deep.include({
      node_id: createRequestParams.node_id,
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
          idp_id: idpNodeId,
          valid_signature: true,
          valid_proof: true,
          valid_ial: true,
        },
      ],
    });
    expect(requestStatus).to.have.property('block_height');
    expect(requestStatus.block_height).is.a('number');
  });

  it('RP should receive 3 request status updates', function() {
    expect(requestStatusUpdates).to.have.lengthOf(3);
  });

  after(async function() {
    this.timeout(15000);
    await ndidApi.updateNodeProxyNode('ndid1', {
      node_id: 'proxy1_idp4',
      proxy_node_id: 'proxy1',
    });
    await wait(3000);
  });
});

describe('NDID update AS node to other proxy node', function() {
  const asNodeId = 'proxy1_as4';

  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const asReferenceId = generateReferenceId();
  const bankStatementReferenceId = generateReferenceId();
  const customerInfoReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise(); // RP
  const requestStatusPendingPromise = createEventPromise(); // RP
  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise(); // IDP
  const requestStatusConfirmedPromise = createEventPromise(); // RP
  const dataRequestReceivedPromise = createEventPromise(); // AS
  const sendDataResultPromise = createEventPromise(); // AS
  const requestStatusSignedDataPromise = createEventPromise(); // RP
  const requestStatusCompletedPromise = createEventPromise(); // RP
  const requestClosedPromise = createEventPromise(); // RP
  const addOrUpdateServiceBankStatementResultPromise = createEventPromise(); // AS
  const addOrUpdateServiceCustomerInfoResultPromise = createEventPromise(); // AS

  let createRequestParams;
  const data = JSON.stringify({
    test: 'test',
    withEscapedChar: 'test|fff||ss\\|NN\\\\|',
    arr: [1, 2, 3],
  });

  let requestId;
  let requestMessageSalt;
  let requestMessageHash;

  const requestStatusUpdates = [];

  before(function() {
    if (db.idp1Identities[0] == null) {
      throw new Error('No created identity to use');
    }

    namespace = db.idp1Identities[0].namespace;
    identifier = db.idp1Identities[0].identifier;

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
      request_message: 'Test request message (data request) (mode 3)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    };

    rpEventEmitter.on('callback', function(callbackData) {
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

    idp1EventEmitter.on('callback', function(callbackData) {
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

    proxy2EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'data_request' &&
        callbackData.request_id === requestId
      ) {
        dataRequestReceivedPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'send_data_result' &&
        callbackData.reference_id === asReferenceId
      ) {
        sendDataResultPromise.resolve(callbackData);
      }
    });

    proxy2EventEmitter.on('callback', function(callbackData) {
      if (callbackData.type === 'add_or_update_service_result') {
        if (callbackData.reference_id === bankStatementReferenceId) {
          addOrUpdateServiceBankStatementResultPromise.resolve(callbackData);
        } else if (callbackData.reference_id === customerInfoReferenceId) {
          addOrUpdateServiceCustomerInfoResultPromise.resolve(callbackData);
        }
      }
    });
  });

  it('NDID should update AS node (proxy1_as4) from proxy1 to proxy2 (without config)', async function() {
    this.timeout(10000);
    const response = await ndidApi.updateNodeProxyNode('ndid1', {
      node_id: 'proxy1_as4',
      proxy_node_id: 'proxy2',
    });
    expect(response.status).to.equal(204);
    await wait(3000);
  });

  it('AS node (proxy1_as4) should be updated successfully', async function() {
    this.timeout(10000);
    const response = await commonApi.getNodeInfo('proxy2', {
      node_id: 'proxy1_as4',
    });
    const responseBody = await response.json();
    expect(responseBody.role).to.equal('AS');
    expect(responseBody.public_key).to.be.a('string').that.is.not.empty;
    expect(responseBody.proxy.node_id).to.equal('proxy2');
    expect(responseBody.proxy.config).to.equal('KEY_ON_PROXY');
  });

  if (!config.USE_EXTERNAL_CRYPTO_SERVICE) {
    it('Re-initialize node keys on proxy2', async function() {
      const response = await serverCommonApi.reinitNodeKeys('proxy2');
      expect(response.status).to.equal(204);
    });
  }

  it('AS node (proxy1_as4) should add offered service (bank_statement) successfully', async function() {
    this.timeout(10000);
    const response = await asApi.addOrUpdateService('proxy2', {
      node_id: asNodeId,
      serviceId: 'bank_statement',
      reference_id: bankStatementReferenceId,
      callback_url: config.PROXY2_CALLBACK_URL,
      min_ial: 1.1,
      min_aal: 1,
      url: config.PROXY2_CALLBACK_URL,
    });
    expect(response.status).to.equal(202);

    const addOrUpdateServiceResult = await addOrUpdateServiceBankStatementResultPromise.promise;
    expect(addOrUpdateServiceResult).to.deep.include({
      node_id: asNodeId,
      reference_id: bankStatementReferenceId,
      success: true,
    });
  });

  it('AS node (proxy1_as4) should have offered service (bank_statement)', async function() {
    const response = await asApi.getService('proxy2', {
      node_id: asNodeId,
      serviceId: 'bank_statement',
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.deep.equal({
      min_ial: 1.1,
      min_aal: 1,
      url: config.PROXY2_CALLBACK_URL,
      active: true,
      suspended: false,
    });
  });

  it('RP should create a request successfully', async function() {
    this.timeout(10000);
    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

    requestId = responseBody.request_id;

    const createRequestResult = await createRequestResultPromise.promise;
    expect(createRequestResult.success).to.equal(true);
  });

  it('RP should receive pending request status', async function() {
    this.timeout(10000);
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
    expect(requestStatus.block_height).is.a('number');
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
      request_id: requestId,
      namespace: createRequestParams.namespace,
      identifier: createRequestParams.identifier,
      request_message: createRequestParams.request_message,
      request_message_hash: hashRequestMessageForConsent(
        createRequestParams.request_message,
        incomingRequest.initial_salt,
        requestId
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
    expect(incomingRequest.creation_block_height).to.be.a('number');

    requestMessageSalt = incomingRequest.request_message_salt;
    requestMessageHash = incomingRequest.request_message_hash;
  });

  it('IdP should create response (accept) successfully', async function() {
    this.timeout(10000);
    const identity = db.idp1Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    const response = await idpApi.createResponse('idp1', {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
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

    const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      reference_id: idpReferenceId,
      request_id: requestId,
      success: true,
    });
  });

  it('RP should receive confirmed request status with valid proofs', async function() {
    this.timeout(15000);
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
          valid_signature: true,
          valid_proof: true,
          valid_ial: true,
        },
      ],
    });
    expect(requestStatus).to.have.property('block_height');
    expect(requestStatus.block_height).is.a('number');
  });

  it('After update AS node (proxy1_as4) to proxy2 should receive data request', async function() {
    this.timeout(15000);
    const dataRequest = await dataRequestReceivedPromise.promise;
    expect(dataRequest).to.deep.include({
      node_id: asNodeId,
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
    expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is.not
      .empty;
  });

  it('AS should send data successfully', async function() {
    this.timeout(15000);
    const response = await asApi.sendData('proxy2', {
      node_id: asNodeId,
      requestId,
      serviceId: createRequestParams.data_request_list[0].service_id,
      reference_id: asReferenceId,
      callback_url: config.PROXY2_CALLBACK_URL,
      data,
    });
    expect(response.status).to.equal(202);

    const sendDataResult = await sendDataResultPromise.promise;
    expect(sendDataResult).to.deep.include({
      node_id: asNodeId,
      reference_id: asReferenceId,
      success: true,
    });
  });

  it('RP should receive request status with signed data count = 1', async function() {
    this.timeout(15000);
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
          valid_signature: true,
          valid_proof: true,
          valid_ial: true,
        },
      ],
    });
    expect(requestStatus).to.have.property('block_height');
    expect(requestStatus.block_height).is.a('number');
  });

  it('RP should receive completed request status with received data count = 1', async function() {
    this.timeout(15000);
    const requestStatus = await requestStatusCompletedPromise.promise;
    expect(requestStatus).to.deep.include({
      request_id: requestId,
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
    expect(requestStatus.block_height).is.a('number');
  });

  it('RP should receive request closed status', async function() {
    this.timeout(10000);
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
          valid_signature: true,
          valid_proof: true,
          valid_ial: true,
        },
      ],
    });
    expect(requestStatus).to.have.property('block_height');
    expect(requestStatus.block_height).is.a('number');
  });

  it('RP should get the correct data received from AS', async function() {
    const response = await rpApi.getDataFromAS('rp1', {
      requestId,
    });
    const dataArr = await response.json();
    expect(response.status).to.equal(200);

    expect(dataArr).to.have.lengthOf(1);
    expect(dataArr[0]).to.deep.include({
      source_node_id: asNodeId,
      service_id: createRequestParams.data_request_list[0].service_id,
      signature_sign_method: 'RSA-SHA256',
      data,
    });
    expect(dataArr[0].source_signature).to.be.a('string').that.is.not.empty;
    expect(dataArr[0].data_salt).to.be.a('string').that.is.not.empty;
  });

  it('RP should receive 5 request status updates', function() {
    expect(requestStatusUpdates).to.have.lengthOf(5);
  });

  after(async function() {
    this.timeout(15000);
    await ndidApi.updateNodeProxyNode('ndid1', {
      node_id: 'proxy1_as4',
      proxy_node_id: 'proxy1',
    });
    await wait(3000);
  });
});
