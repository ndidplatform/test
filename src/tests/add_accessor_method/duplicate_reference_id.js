import { expect } from 'chai';
import forge from 'node-forge';

import * as idpApi from '../../api/v2/idp';
import { idp1EventEmitter } from '../../callback_server';
import * as db from '../../db';
import {
  createEventPromise,
  generateReferenceId,
  wait,
  hashRequestMessageForConsent,
} from '../../utils';
import * as config from '../../config';

describe('Add accessor method with duplicate reference id test', function() {
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
  const addAccessorRequestResult2ndPromise = createEventPromise();

  let requestId;
  let accessorId;
  let requestId2ndAddAccessor;
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
        callbackData.request_id === requestId2ndAddAccessor
      ) {
        incomingRequestPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.reference_id === idp1ReferenceId
      ) {
        responseResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'add_accessor_request_result' &&
        callbackData.request_id === requestId
      ) {
        addAccessorRequestResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'add_accessor_request_result' &&
        callbackData.request_id === requestId2ndAddAccessor
      ) {
        addAccessorRequestResult2ndPromise.resolve(callbackData);
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
    expect(addAccessorRequestResult.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight = addAccessorRequestResult.creation_block_height.split(
      ':'
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    await wait(3000);
  });

  it('should add accessor method with duplicate reference id unsuccessfully', async function() {
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

    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20045);
  });

  it('should add accessor method with duplicate reference id unsuccessfully', async function() {
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
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20045);
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

  it('After request duplicate reference id is not in progress (closed) should add accessor method successfully', async function() {
    this.timeout(20000);
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

    requestId2ndAddAccessor = responseBody.request_id;
    accessorId = responseBody.accessor_id;

    const addAccessorRequestResult = await addAccessorRequestResult2ndPromise.promise;
    expect(addAccessorRequestResult).to.deep.include({
      reference_id: referenceId,
      request_id: requestId2ndAddAccessor,
      accessor_id: accessorId,
      success: true,
    });
    expect(addAccessorRequestResult.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight = addAccessorRequestResult.creation_block_height.split(
      ':'
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    await wait(3000);
  });

  it('1st IdP should receive add accessor method request', async function() {
    this.timeout(15000);
    const incomingRequest = await incomingRequestPromise.promise;
    expect(incomingRequest).to.deep.include({
      mode: 3,
      request_id: requestId2ndAddAccessor,
      namespace,
      identifier,
      request_message: addAccessorRequestMessage,
      request_message_hash: hashRequestMessageForConsent(
        addAccessorRequestMessage,
        incomingRequest.initial_salt,
        requestId2ndAddAccessor
      ),
      requester_node_id: 'idp1',
      min_ial: 1.1,
      min_aal: 1,
      data_request_list: [],
    });
    expect(incomingRequest.creation_time).to.be.a('number');
    expect(incomingRequest.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
      ':'
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    expect(incomingRequest.request_timeout).to.be.a('number');

    requestMessageHash = incomingRequest.request_message_hash;
  });

  after(async function() {
    this.timeout(15000);
    await idpApi.closeIdentityRequest('idp1', {
      request_id: requestId2ndAddAccessor,
      callback_url: config.IDP1_CALLBACK_URL,
      reference_id: idpReferenceIdCloseAddAccessor,
    });
    idp1EventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('accessor_sign_callback');
    await wait(2000);
  });
});
