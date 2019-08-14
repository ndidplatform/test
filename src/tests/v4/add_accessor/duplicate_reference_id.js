import { expect } from 'chai';
import forge from 'node-forge';

import * as idpApi from '../../../api/v4/idp';
import * as identityApi from '../../../api/v4/identity';
import { idp1EventEmitter, idp2EventEmitter } from '../../../callback_server';
import * as db from '../../../db';
import {
  createEventPromise,
  generateReferenceId,
  wait,
  hash,
} from '../../../utils';
import * as config from '../../../config';
import { idp2Available } from '../..';

describe('Add accessor with duplicate reference id test', function() {
  let namespace;
  let identifier;
  let referenceGroupCode;

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
  const idp2IncomingRequestPromise = createEventPromise();
  const responseResultPromise = createEventPromise();
  const closeAddAccessorRequestResultPromise = createEventPromise();
  const addAccessorRequestResult2ndPromise = createEventPromise();

  let requestId;
  let accessorId;
  let requestId2ndAddAccessor;
  let requestMessageHash;

  before(function() {
    const identity = db.idp1Identities.find(identity => identity.mode === 3);

    if (!identity) {
      throw new Error('No created identity to use');
    }

    namespace = identity.namespace;
    identifier = identity.identifier;
    referenceGroupCode = identity.referenceGroupCode;

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

    idp2EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId2ndAddAccessor
      ) {
        idp2IncomingRequestPromise.resolve(callbackData);
      }
    });
  });

  it('Should add accessor successfully', async function() {
    this.timeout(10000);
    const response = await identityApi.addAccessor('idp1', {
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

  it('Should add accessor with duplicate reference id unsuccessfully', async function() {
    this.timeout(10000);
    const response = await identityApi.addAccessor('idp1', {
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

  it('Should add accessor with duplicate reference id unsuccessfully', async function() {
    this.timeout(10000);
    const response = await identityApi.addAccessor('idp1', {
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
    const response = await identityApi.getRequestIdByReferenceId('idp1', {
      reference_id: referenceId,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.deep.equal({
      request_id: requestId,
      accessor_id: accessorId,
    });
  });

  it('IdP should close add accessor request successfully', async function() {
    this.timeout(25000);
    const response = await identityApi.closeIdentityRequest('idp1', {
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

  it('IdP should get response status code 404 when get request_id by reference_id after request is finished (closed)', async function() {
    this.timeout(10000);
    const response = await identityApi.getRequestIdByReferenceId('idp1', {
      reference_id: referenceId,
    });
    expect(response.status).to.equal(404);
  });

  it('After request duplicate reference id is not in progress (closed) should add accessor successfully', async function() {
    this.timeout(20000);
    const response = await identityApi.addAccessor('idp1', {
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

  it('IdP (idp1) should receive add accessor request', async function() {
    this.timeout(15000);
    const incomingRequest = await incomingRequestPromise.promise;
    expect(incomingRequest).to.deep.include({
      mode: 3,
      request_id: requestId2ndAddAccessor,
      request_message: addAccessorRequestMessage,
      reference_group_code: referenceGroupCode,
      request_message_hash: hash(
        addAccessorRequestMessage + incomingRequest.request_message_salt
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

  it('IdP (idp2) should receive add accessor request', async function() {
    this.timeout(15000);
    if (!idp2Available) this.skip();
    const incomingRequest = await idp2IncomingRequestPromise.promise;
    expect(incomingRequest).to.deep.include({
      mode: 3,
      request_id: requestId2ndAddAccessor,
      request_message: addAccessorRequestMessage,
      reference_group_code: referenceGroupCode,
      request_message_hash: hash(
        addAccessorRequestMessage + incomingRequest.request_message_salt
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
    await identityApi.closeIdentityRequest('idp1', {
      request_id: requestId2ndAddAccessor,
      callback_url: config.IDP1_CALLBACK_URL,
      reference_id: idpReferenceIdCloseAddAccessor,
    });
    idp1EventEmitter.removeAllListeners('callback');
    idp2EventEmitter.removeAllListeners('callback');
    await wait(2000);
  });
});
