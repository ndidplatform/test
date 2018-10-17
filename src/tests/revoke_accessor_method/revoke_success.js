import { expect } from 'chai';
import forge from 'node-forge';

import { idp1Available, rpAvailable, as1Available, idp2Available } from '..';
import * as rpApi from '../../api/v2/rp';
import * as idpApi from '../../api/v2/idp';
import * as asApi from '../../api/v2/as';
import * as commonApi from '../../api/v2/common';
import {
  idp1EventEmitter,
  rpEventEmitter,
  as1EventEmitter,
} from '../../callback_server';
import * as db from '../../db';
import {
  createEventPromise,
  generateReferenceId,
  hash,
  wait,
  hashRequestMessageForConsent,
  createResponseSignature,
} from '../../utils';
import * as config from '../../config';

// add accessor by idp1
describe('IdP (idp1) add accessor method for revoke success test', function() {
  let namespace;
  let identifier;
  const addAccessorRequestMessage =
    'Add accessor consent request custom message ข้อความสำหรับขอเพิ่ม accessor บนระบบ';
  const keypair = forge.pki.rsa.generateKeyPair(2048);
  const accessorPrivateKey = forge.pki.privateKeyToPem(keypair.privateKey);
  const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);

  const referenceId = generateReferenceId();
  const idp1ReferenceId = generateReferenceId();

  const addAccessorRequestResultPromise = createEventPromise();
  const addAccessorResultPromise = createEventPromise();
  const accessorSignPromise = createEventPromise();
  const incomingRequestPromise = createEventPromise();
  const responseResultPromise = createEventPromise();

  let requestId;
  let accessorId;
  let requestMessageHash;

  db.createIdentityReferences.push({
    referenceId,
    accessorPrivateKey,
  });

  before(function() {
    if (db.idp1Identities[0] == null) {
      throw new Error('No created identity to use');
    }

    namespace = db.idp1Identities[0].namespace;
    identifier = db.idp1Identities[0].identifier;

    idp1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId
      ) {
        incomingRequestPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.reference_id === idp1ReferenceId
      ) {
        responseResultPromise.resolve(callbackData);
      }
      if (
        callbackData.type === 'add_accessor_request_result' &&
        callbackData.reference_id === referenceId
      ) {
        addAccessorRequestResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'add_accessor_result' &&
        callbackData.reference_id === referenceId
      ) {
        addAccessorResultPromise.resolve(callbackData);
      }
    });

    idp1EventEmitter.on('accessor_sign_callback', function(callbackData) {
      if (callbackData.reference_id === referenceId) {
        accessorSignPromise.resolve(callbackData);
      }
    });
  });

  it('should add accessor method successfully', async function() {
    this.timeout(10000);
    const response = await idpApi.addAccessorMethod('idp1', {
      namespace: namespace,
      identifier: identifier,
      reference_id: referenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      accessor_type: 'RSA',
      accessor_public_key: accessorPublicKey,
      //accessor_id: accessorId,
      request_message: addAccessorRequestMessage,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;

    requestId = responseBody.request_id;
    accessorId = responseBody.accessor_id;

    const addAccessorRequestResult = await addAccessorRequestResultPromise.promise;
    expect(addAccessorRequestResult).to.deep.include({
      reference_id: referenceId,
      request_id: requestId,
      accessor_id: accessorId,
      success: true,
    });
    expect(addAccessorRequestResult.creation_block_height).to.be.a('number');
  });

  it('should receive accessor sign callback with correct data', async function() {
    this.timeout(15000);
    const sid = `${namespace}:${identifier}`;
    const sid_hash = hash(sid);

    const accessorSignParams = await accessorSignPromise.promise;
    expect(accessorSignParams).to.deep.equal({
      type: 'accessor_sign',
      node_id: 'idp1',
      reference_id: referenceId,
      accessor_id: accessorId,
      sid,
      sid_hash,
      hash_method: 'SHA256',
      key_type: 'RSA',
      sign_method: 'RSA-SHA256',
      padding: 'PKCS#1v1.5',
    });
  });

  it('1st IdP should receive add accessor method request', async function() {
    this.timeout(15000);
    const incomingRequest = await incomingRequestPromise.promise;
    expect(incomingRequest).to.deep.include({
      mode: 3,
      request_id: requestId,
      namespace,
      identifier,
      request_message: addAccessorRequestMessage,
      request_message_hash: hashRequestMessageForConsent(
        addAccessorRequestMessage,
        incomingRequest.initial_salt,
        requestId
      ),
      requester_node_id: 'idp1',
      min_ial: 1.1,
      min_aal: 1,
      data_request_list: [],
    });
    expect(incomingRequest.creation_time).to.be.a('number');
    expect(incomingRequest.creation_block_height).to.be.a('number');
    expect(incomingRequest.request_timeout).to.be.a('number');

    requestMessageHash = incomingRequest.request_message_hash;
  });

  it('1st IdP should create response (accept) successfully', async function() {
    this.timeout(10000);
    const identity = db.idp1Identities.find(
      (identity) =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    const response = await idpApi.createResponse('idp1', {
      reference_id: idp1ReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      namespace,
      identifier,
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
      reference_id: idp1ReferenceId,
      request_id: requestId,
      success: true,
    });
  });

  it('Accessor id should be added successfully', async function() {
    this.timeout(15000);
    const addAccessorResult = await addAccessorResultPromise.promise;
    expect(addAccessorResult).to.deep.include({
      reference_id: referenceId,
      request_id: requestId,
      success: true,
    });
    expect(addAccessorResult.secret).to.be.a('string').that.is.not.empty;

    const secret = addAccessorResult.secret;

    const identity = db.idp1Identities.find(
      (identity) =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    identity.accessors.push({
      accessorId,
      accessorPrivateKey,
      accessorPublicKey,
      secret,
    });
  });

  it('Special request status for add accessor method should be completed and closed', async function() {
    this.timeout(10000);
    //wait for API close request
    await wait(3000);
    const response = await commonApi.getRequest('idp1', { requestId });
    const responseBody = await response.json();
    expect(responseBody).to.deep.include({
      request_id: requestId,
      min_idp: 1,
      min_aal: 1,
      min_ial: 1.1,
      request_timeout: 86400,
      data_request_list: [],
      closed: true,
      timed_out: false,
      mode: 3,
      status: 'completed',
      requester_node_id: 'idp1',
    });
  });

  after(function() {
    idp1EventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('accessor_sign_callback');
  });
});

//revoke by idp1
describe('Revoke accessor by the owner', function() {
  let namespace;
  let identifier;
  let accessorId;
  let requestId;

  const idpReferenceIdRevoke = generateReferenceId();
  const idpReferenceIdResponse = generateReferenceId();

  const incomingRequestPromise = createEventPromise(); // IDP
  const revokeResultPromise = createEventPromise(); // IDP
  const revokeRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise(); // IDP

  let requestMessageHash;

  before(function() {

    namespace = db.idp1Identities[0].namespace;
    identifier = db.idp1Identities[0].identifier;

    const identity = db.idp1Identities.find(
      (identity) =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    const latestAccessor = identity.accessors.length - 1;
    accessorId = identity.accessors[latestAccessor].accessorId;

    idp1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId
      ) {
        incomingRequestPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.reference_id === idpReferenceIdResponse
      ) {
        responseResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'revoke_accessor_request_result' &&
        callbackData.reference_id === idpReferenceIdRevoke
      ) {
        revokeRequestPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'revoke_accessor_result' &&
        callbackData.reference_id === idpReferenceIdRevoke
      ) {
        revokeResultPromise.resolve(callbackData);
      }
    });

  });

  it('Revoke accessor should success', async function() {
    const response = await idpApi.revokeAccessorMethod('idp1', {
      reference_id: idpReferenceIdRevoke,
      callback_url: config.IDP1_CALLBACK_URL,
      namespace,
      identifier,
      accessor_id: accessorId,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    requestId = responseBody.request_id;
  });

  it('Idp1 should get callback for revoke request', async function() {
    this.timeout(15000);
    const revokeRequest = await revokeRequestPromise.promise;
    expect(revokeRequest).to.deep.include({
      reference_id: idpReferenceIdRevoke,
      request_id: requestId,
      accessor_id: accessorId,
      type: 'revoke_accessor_request_result',
      node_id: 'idp1',
      success: true,
    });
    expect(revokeRequest.creation_block_height).to.be.a('number');
  });

  it('Idp1 should get incoming request for revoke request', async function() {
    this.timeout(15000);
    const incomingRequest = await incomingRequestPromise.promise;
    expect(incomingRequest).to.deep.include({
      mode: 3,
      request_id: requestId,
      namespace,
      identifier,
      requester_node_id: 'idp1',
    });
    expect(incomingRequest.creation_block_height).to.be.a('number');
    requestMessageHash = incomingRequest.request_message_hash;
  });

  it('Idp1 should response successfully', async function() {
    this.timeout(25000);
    const identity = db.idp1Identities.find(
      (identity) =>
        identity.namespace === namespace && identity.identifier === identifier
    );
    let latestAccessor;
    if (identity) {
      latestAccessor = identity.accessors.length - 1;
    } else {
      throw new Error('Identity not found');
    }
    const response = await idpApi.createResponse('idp1', {
      reference_id: idpReferenceIdResponse,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      namespace,
      identifier,
      ial: 2.3,
      aal: 3,
      secret: identity.accessors[latestAccessor].secret,
      status: 'accept',
      signature: createResponseSignature(
        identity.accessors[latestAccessor].accessorPrivateKey,
        requestMessageHash
      ),
      accessor_id: identity.accessors[latestAccessor].accessorId,
    });
    expect(response.status).to.equal(202);

    const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      reference_id: idpReferenceIdResponse,
      request_id: requestId,
      success: true,
    });
  });

  it('Idp1 should get revoke status success', async function() {
    this.timeout(30000);
    const revokeResult = await revokeResultPromise.promise;
    expect(revokeResult).to.deep.include({
      reference_id: idpReferenceIdRevoke,
      request_id: requestId,
      type: 'revoke_accessor_result',
      node_id: 'idp1',
      success: true,
    });
  });
});

describe('Revoked accessor must be unusable', function() {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const asReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise(); // RP
  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise(); // IDP
  const requestStatusConfirmedPromise = createEventPromise(); // RP
  const dataRequestReceivedPromise = createEventPromise(); // AS
  const sendDataResultPromise = createEventPromise(); // AS
  const requestStatusSignedDataPromise = createEventPromise(); // RP
  const requestStatusCompletedPromise = createEventPromise(); // RP
  const requestClosedPromise = createEventPromise(); // RP

  let createRequestParams;
  const data = JSON.stringify({
    test: 'test',
    withEscapedChar: 'test|fff||ss\\|NN\\\\|',
    arr: [1, 2, 3],
  });

  let requestId;
  let requestMessageSalt;
  let requestMessageHash;

  before(function() {
    if (!as1Available) {
      this.test.parent.pending = true;
      this.skip();
    }
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
        'Test request message (idp1 response with new accessor id) (mode 3)',
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
        if (callbackData.status === 'confirmed') {
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

    as1EventEmitter.on('callback', function(callbackData) {
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

  it('IdP should receive incoming request callback', async function() {
    this.timeout(15000);
    const incomingRequest = await incomingRequestPromise.promise;

    const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
      (dataRequest) => {
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
    });
    expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
      .empty;
    expect(incomingRequest.creation_time).to.be.a('number');
    expect(incomingRequest.creation_block_height).to.be.a('number');

    requestMessageSalt = incomingRequest.request_message_salt;
    requestMessageHash = incomingRequest.request_message_hash;
  });

  it('IdP should should not be able to create response (accept) with the revoked accessor', async function() {
    this.timeout(15000);
    const identity = db.idp1Identities.find(
      (identity) =>
        identity.namespace === namespace && identity.identifier === identifier
    );
    let latestAccessor;
    if (identity) {
      latestAccessor = identity.accessors.length - 1;
    } else {
      throw new Error('Identity not found');
    }
    const response = await idpApi.createResponse('idp1', {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      namespace: createRequestParams.namespace,
      identifier: createRequestParams.identifier,
      ial: 2.3,
      aal: 3,
      secret: identity.accessors[latestAccessor].secret,
      status: 'accept',
      signature: createResponseSignature(
        identity.accessors[latestAccessor].accessorPrivateKey,
        requestMessageHash
      ),
      accessor_id: identity.accessors[latestAccessor].accessorId,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20011);

    /*const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      reference_id: idpReferenceId,
      request_id: requestId,
      success: true,
    });*/
  });

  /*it('RP should receive confirmed request status with invalid proofs and signature', async function() {
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
          valid_signature: false,
          valid_proof: false,
          valid_ial: true,
        },
      ],
    });
    expect(requestStatus).to.have.property('block_height');
    expect(requestStatus.block_height).is.a('number');
  });

  it('AS should receive data request', async function() {
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
    expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is.not
      .empty;
  });

  it('AS should send data successfully', async function() {
    this.timeout(15000);
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
      source_node_id: 'as1',
      service_id: createRequestParams.data_request_list[0].service_id,
      signature_sign_method: 'RSA-SHA256',
      data,
    });
    expect(dataArr[0].source_signature).to.be.a('string').that.is.not.empty;
    expect(dataArr[0].data_salt).to.be.a('string').that.is.not.empty;
  });*/

  after(function() {
    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
    as1EventEmitter.removeAllListeners('callback');
  });
});