import { expect } from 'chai';
import forge from 'node-forge';
import uuidv4 from 'uuid/v4';

import * as rpApi from '../../api/v2/rp';
import * as idpApi from '../../api/v2/idp';
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

const accessorId = uuidv4();

describe('Close add accessor method request (providing accessor id) test', function() {
  let namespace;
  let identifier;
  const addAccessorRequestMessage =
    'Add accessor consent request custom message ข้อความสำหรับขอเพิ่ม accessor บนระบบ';
  const keypair = forge.pki.rsa.generateKeyPair(2048);
  const accessorPrivateKey = forge.pki.privateKeyToPem(keypair.privateKey);
  const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);

  const referenceId = generateReferenceId();
  const idp1ReferenceId = generateReferenceId();
  const idpReferenceIdCloseAddAccessor = generateReferenceId();

  const addAccessorRequestResultPromise = createEventPromise();
  const addAccessorResultPromise = createEventPromise();
  const accessorSignPromise = createEventPromise();
  const incomingRequestPromise = createEventPromise();
  const responseResultPromise = createEventPromise();
  const closeAddAccessorRequestResultPromise = createEventPromise();

  let requestId;
  //let accessorId;
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
      } else if (
        callbackData.type === 'close_request_result' &&
        callbackData.reference_id === idpReferenceIdCloseAddAccessor
      ) {
        closeAddAccessorRequestResultPromise.resolve(callbackData);
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
      accessor_id: accessorId,
      request_message: addAccessorRequestMessage,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;

    requestId = responseBody.request_id;
    //accessorId = responseBody.accessor_id;

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

  it('1st IdP should get request_id by reference_id while request is unfinished (not closed or timed out) successfully', async function() {
    this.timeout(10000);
    const response = await idpApi.getRequestIdByReferenceId('idp1', {
      reference_id: referenceId,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.deep.equal({
      request_id: requestId,
      accessor_id: accessorId,
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

  it('1st IdP should close add accessor method request successfully', async function() {
    this.timeout(25000);
    const response = await idpApi.closeIdentityRequest('idp1', {
      request_id: requestId,
      callback_url: config.IDP1_CALLBACK_URL,
      reference_id: idpReferenceIdCloseAddAccessor,
    });

    expect(response.status).to.equal(202);

    const closeAddAccessorRequestResult = await closeAddAccessorRequestResultPromise.promise;
    expect(closeAddAccessorRequestResult).to.deep.include({
      success: true,
      reference_id: idpReferenceIdCloseAddAccessor,
      request_id: requestId,
    });

    const AddAccessorResult = await addAccessorResultPromise.promise;
    expect(AddAccessorResult).to.deep.include({
      node_id: 'idp1',
      type: 'add_accessor_result',
      success: false,
      reference_id: referenceId,
      request_id: requestId,
      error: { code: 20025, message: 'Request is already closed' },
    });
    await wait(2000);
  });

  it('1st IdP should get response status code 404 when get request_id by reference_id after request is finished (closed)', async function() {
    this.timeout(10000);
    const response = await idpApi.getRequestIdByReferenceId('idp1', {
      reference_id: referenceId,
    });
    expect(response.status).to.equal(404);
  });

  it('After close add accessor method request 1st IdP should create response (accept) unsuccessfully', async function() {
    this.timeout(10000);
    const identity = db.idp1Identities.find(
      identity =>
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

    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20025);
  });

  it('Special request status for add accessor method should be closed', async function() {
    this.timeout(10000);
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
      status: 'pending',
      requester_node_id: 'idp1',
    });
  });

  after(function() {
    idp1EventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('accessor_sign_callback');
  });
});

describe('IdP (idp1) response with new accessor id test', function() {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise(); // RP
  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise(); // IDP
  const requestStatusConfirmedPromise = createEventPromise(); // RP
  const requestStatusSignedDataPromise = createEventPromise(); // RP
  const requestStatusCompletedPromise = createEventPromise(); // RP
  const requestClosedPromise = createEventPromise(); // RP

  let createRequestParams;

  let requestId;
  let requestMessageSalt;
  let requestMessageHash;

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
    });
    expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
      .empty;
    expect(incomingRequest.creation_time).to.be.a('number');
    expect(incomingRequest.creation_block_height).to.be.a('number');

    requestMessageSalt = incomingRequest.request_message_salt;
    requestMessageHash = incomingRequest.request_message_hash;
  });

  it('IdP should create response (accept) with new accessor id (accessor id from add new accessor request that already closed) unsuccessfully', async function() {
    this.timeout(15000);
    const identity = db.idp1Identities.find(
      identity =>
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
      accessor_id: accessorId, //acessor id from add new accessor request that already closed
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20011);
  });

  after(async function() {
    this.timeout(15000);
    await rpApi.closeRequest('rp1', {
      reference_id: uuidv4(),
      callback_url: config.RP_CALLBACK_URL,
      request_id: requestId,
    });
    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
    as1EventEmitter.removeAllListeners('callback');
    await wait(2000);
  });
});
