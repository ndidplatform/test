import { expect } from 'chai';
import forge from 'node-forge';

import * as idpApi from '../../api/v2/idp';
import * as commonApi from '../../api/v2/common';
import { idp1EventEmitter } from '../../callback_server';
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

describe('Revoke accessor with duplicate reference id test', function() {
  let namespace;
  let identifier;
  const addAccessorRequestMessage =
    'Add accessor consent request custom message ข้อความสำหรับขอเพิ่ม accessor บนระบบ';
  const keypair = forge.pki.rsa.generateKeyPair(2048);
  const accessorPrivateKey = forge.pki.privateKeyToPem(keypair.privateKey);
  const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);

  const referenceId = generateReferenceId();
  const idp1ReferenceId = generateReferenceId();
  const idpReferenceIdCloseRevokeAccessor = generateReferenceId();
  const idpReferenceIdRevoke = generateReferenceId();

  const addAccessorRequestResultPromise = createEventPromise();
  const addAccessorResultPromise = createEventPromise();
  const accessorSignPromise = createEventPromise();
  const incomingRequestPromise = createEventPromise();
  const responseResultPromise = createEventPromise();
  const closeRevokeAccessorRequestResultPromise = createEventPromise();
  const IdPRevokeAccessorResultPromise = createEventPromise();
  const incomingRequestRevokeAccessorPromise = createEventPromise();

  let requestId2ndRevokeAccessor;

  let requestId;
  let accessorId;
  let requestMessageHash;

  db.createIdentityReferences.push({
    referenceId,
    accessorPrivateKey,
  });

  before(async function() {
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

    idp1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId2ndRevokeAccessor
      ) {
        incomingRequestRevokeAccessorPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'close_request_result' &&
        callbackData.reference_id === idpReferenceIdCloseRevokeAccessor
      ) {
        closeRevokeAccessorRequestResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'revoke_accessor_result' &&
        callbackData.reference_id === idpReferenceIdRevoke
      ) {
        IdPRevokeAccessorResultPromise.resolve(callbackData);
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

  it('1st IdP should create response (accept) successfully', async function() {
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
      identity =>
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
    //wait for api close request
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
    await wait(3000); //wait for api clean up refernece_id
  });

  it('1st IdP should get response status code 404 when get request_id by reference_id after request is finished (closed)', async function() {
    this.timeout(10000);
    const response = await idpApi.getRequestIdByReferenceId('idp1', {
      reference_id: referenceId,
    });
    expect(response.status).to.equal(404);
  });

  it('IdP (idp1) should revoke accessor successfully', async function() {
    this.timeout(15000);

    const identity = db.idp1Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier
    );
    const latestAccessor = identity.accessors.length - 1;
    accessorId = identity.accessors[latestAccessor].accessorId;

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
    await wait(3000);
  });

  it('IdP (idp1) should revoke accessor with duplicate reference id unsuccessfully', async function() {
    this.timeout(15000);

    const identity = db.idp1Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    const latestAccessor = identity.accessors.length - 1;
    accessorId = identity.accessors[latestAccessor].accessorId;

    const response = await idpApi.revokeAccessorMethod('idp1', {
      reference_id: idpReferenceIdRevoke,
      callback_url: config.IDP1_CALLBACK_URL,
      namespace,
      identifier,
      accessor_id: accessorId,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20045);
  });

  it('IdP (idp1) should revoke accessor with duplicate reference id unsuccessfully', async function() {
    this.timeout(15000);

    const identity = db.idp1Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    const latestAccessor = identity.accessors.length - 1;
    accessorId = identity.accessors[latestAccessor].accessorId;

    const response = await idpApi.revokeAccessorMethod('idp1', {
      reference_id: idpReferenceIdRevoke,
      callback_url: config.IDP1_CALLBACK_URL,
      namespace,
      identifier,
      accessor_id: accessorId,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20045);
  });

  it('1st IdP should close revoke accessor request successfully', async function() {
    this.timeout(25000);
    const response = await idpApi.closeIdentityRequest('idp1', {
      request_id: requestId,
      callback_url: config.IDP1_CALLBACK_URL,
      reference_id: idpReferenceIdCloseRevokeAccessor,
    });

    expect(response.status).to.equal(202);

    const closeRevokeAccessorRequestResult = await closeRevokeAccessorRequestResultPromise.promise;
    expect(closeRevokeAccessorRequestResult).to.deep.include({
      success: true,
      reference_id: idpReferenceIdCloseRevokeAccessor,
      request_id: requestId,
    });

    const IdPRevokeAccessorResult = await IdPRevokeAccessorResultPromise.promise;
    expect(IdPRevokeAccessorResult).to.deep.include({
      node_id: 'idp1',
      type: 'revoke_accessor_result',
      success: false,
      reference_id: idpReferenceIdRevoke,
      request_id: requestId,
      error: { code: 20025, message: 'Request is already closed' },
    });
  });

  it('After request duplicate reference id is not in progress (closed) IdP (idp1) should revoke accessor successfully', async function() {
    this.timeout(15000);

    const identity = db.idp1Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier
    );
    const latestAccessor = identity.accessors.length - 1;
    accessorId = identity.accessors[latestAccessor].accessorId;

    const response = await idpApi.revokeAccessorMethod('idp1', {
      reference_id: idpReferenceIdRevoke,
      callback_url: config.IDP1_CALLBACK_URL,
      namespace,
      identifier,
      accessor_id: accessorId,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    requestId2ndRevokeAccessor = responseBody.request_id;
    await wait(3000);
  });

  it('Idp1 should get incoming request for revoke request', async function() {
    this.timeout(15000);
    const incomingRequest = await incomingRequestRevokeAccessorPromise.promise;
    expect(incomingRequest).to.deep.include({
      mode: 3,
      request_id: requestId2ndRevokeAccessor,
      namespace,
      identifier,
      requester_node_id: 'idp1',
    });
    expect(incomingRequest.creation_block_height).to.be.a('number');
    requestMessageHash = incomingRequest.request_message_hash;
  });

  after(async function() {
    this.timeout(15000);
    await idpApi.closeIdentityRequest('idp1', {
      request_id: requestId2ndRevokeAccessor,
      callback_url: config.IDP1_CALLBACK_URL,
      reference_id: idpReferenceIdCloseRevokeAccessor,
    });
    await wait(2000);
    idp1EventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('accessor_sign_callback');
  });
});
