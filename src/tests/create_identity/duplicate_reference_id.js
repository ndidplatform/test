import { expect } from 'chai';
import forge from 'node-forge';
import uuidv4 from 'uuid/v4';

import { idp2Available } from '..';
import * as idpApi from '../../api/v2/idp';
import * as commonApi from '../../api/v2/common';
import { idp1EventEmitter, idp2EventEmitter } from '../../callback_server';
import * as db from '../../db';
import {
  createEventPromise,
  generateReferenceId,
  hash,
  hashRequestMessageForConsent,
  wait,
} from '../../utils';
import * as config from '../../config';

describe('Create identity request with duplicate reference id test', function() {
  const namespace = 'citizen_id';
  const identifier = uuidv4();

  //Keypair for 1st IdP
  const keypair = forge.pki.rsa.generateKeyPair(2048);
  const accessorPrivateKey = forge.pki.privateKeyToPem(keypair.privateKey);
  const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);

  //Keypair for 2nd IdP
  const keypair2 = forge.pki.rsa.generateKeyPair(2048);
  const accessorPrivateKey2 = forge.pki.privateKeyToPem(keypair2.privateKey);
  const accessorPublicKey2 = forge.pki.publicKeyToPem(keypair2.publicKey);

  const referenceId = generateReferenceId();
  const referenceIdIdp2 = generateReferenceId();
  const closeIdentityRequestReferenceId = generateReferenceId();

  const createIdentityResultPromise = createEventPromise();
  const incomingRequestPromise = createEventPromise(); //1st IDP
  const createIdentityRequestResultPromise = createEventPromise(); //1st IDP
  const createIdentityRequestResultPromise2 = createEventPromise(); //2nd IDP
  const accessorSignPromise = createEventPromise(); //1s IDP
  const accessorSignPromise2 = createEventPromise(); //2nd IDP
  const closeIdentityRequestResultPromise = createEventPromise();
  const IdP2createIdentityResultPromise = createEventPromise(); //2nd IDP
  const createIdentityRequestResultAftercloseRequestPromise = createEventPromise();
  const incomingRequestAftercloseRequestPromise = createEventPromise();

  //1st IdP
  let requestId;
  let accessorId;

  //2nd IdP
  let requestId2ndIdP;
  let accessorId2ndIdP;
  let requestIdAfterCloseRequest;
  let accessorIdAfterCloseRequest;

  let requestMessage;
  let requestMessageSalt;
  let requestMessageHash;

  db.createIdentityReferences.push({
    referenceId,
    accessorPrivateKey,
  });

  db.createIdentityReferences.push({
    referenceId: referenceIdIdp2,
    accessorPrivateKey: accessorPrivateKey2,
  });

  before(function() {
    if (!idp2Available) {
      this.test.parent.pending = true;
      this.skip();
    }
    if (db.idp1Identities[0] == null) {
      throw new Error('No created identity to use');
    }
    idp1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId2ndIdP
      ) {
        incomingRequestPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestIdAfterCloseRequest
      ) {
        incomingRequestAftercloseRequestPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'create_identity_request_result' &&
        callbackData.reference_id === referenceId
      ) {
        createIdentityRequestResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'create_identity_result' &&
        callbackData.reference_id === referenceId
      ) {
        createIdentityResultPromise.resolve(callbackData);
      }
    });

    idp1EventEmitter.on('accessor_sign_callback', function(callbackData) {
      if (callbackData.reference_id === referenceId) {
        accessorSignPromise.resolve(callbackData);
      }
    });

    idp2EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'create_identity_request_result' &&
        callbackData.reference_id === referenceIdIdp2 &&
        callbackData.request_id === requestId2ndIdP
      ) {
        createIdentityRequestResultPromise2.resolve(callbackData);
      } else if (
        callbackData.type === 'create_identity_request_result' &&
        callbackData.reference_id === referenceIdIdp2 &&
        callbackData.request_id === requestIdAfterCloseRequest
      ) {
        createIdentityRequestResultAftercloseRequestPromise.resolve(
          callbackData
        );
      } else if (
        callbackData.type === 'close_request_result' &&
        callbackData.reference_id === closeIdentityRequestReferenceId
      ) {
        closeIdentityRequestResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'create_identity_result' &&
        callbackData.reference_id === referenceIdIdp2
      ) {
        IdP2createIdentityResultPromise.resolve(callbackData);
      }
    });

    idp2EventEmitter.on('accessor_sign_callback', function(callbackData) {
      if (callbackData.reference_id === referenceIdIdp2) {
        accessorSignPromise2.resolve(callbackData);
      }
    });
  });

  it('1st IdP should create identity request successfully', async function() {
    this.timeout(10000);
    const response = await idpApi.createIdentity('idp1', {
      reference_id: referenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      namespace,
      identifier,
      accessor_type: 'RSA',
      accessor_public_key: accessorPublicKey,
      //accessor_id,
      ial: 2.3,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;

    requestId = responseBody.request_id;
    accessorId = responseBody.accessor_id;

    const createIdentityRequestResult = await createIdentityRequestResultPromise.promise;
    expect(createIdentityRequestResult).to.deep.include({
      reference_id: referenceId,
      request_id: requestId,
      exist: false,
      accessor_id: accessorId,
      success: true,
    });
    expect(createIdentityRequestResult.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight = createIdentityRequestResult.creation_block_height.split(
      ':'
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('1st IdP should receive accessor sign callback with correct data', async function() {
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

  it('1st IdP Identity should be created successfully', async function() {
    this.timeout(15000);
    const createIdentityResult = await createIdentityResultPromise.promise;
    expect(createIdentityResult).to.deep.include({
      reference_id: referenceId,
      request_id: requestId,
      success: true,
    });
    expect(createIdentityResult.secret).to.be.a('string').that.is.not.empty;

    const secret = createIdentityResult.secret;

    const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
      namespace,
      identifier,
    });
    const idpNodes = await response.json();
    const idpNode = idpNodes.find((idpNode) => idpNode.node_id === 'idp1');
    expect(idpNode).to.exist;

    db.idp1Identities.push({
      namespace,
      identifier,
      accessors: [
        {
          accessorId,
          accessorPrivateKey,
          accessorPublicKey,
          secret,
        },
      ],
    });
  });

  it('2nd IdP should create identity request successfully', async function() {
    this.timeout(20000);
    const response = await idpApi.createIdentity('idp2', {
      reference_id: referenceIdIdp2,
      callback_url: config.IDP2_CALLBACK_URL,
      namespace,
      identifier,
      accessor_type: 'RSA',
      accessor_public_key: accessorPublicKey2,
      //accessor_id: accessorId,
      ial: 2.3,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;

    requestId2ndIdP = responseBody.request_id;
    accessorId2ndIdP = responseBody.accessor_id;

    const createIdentityRequestResult = await createIdentityRequestResultPromise2.promise;
    expect(createIdentityRequestResult).to.deep.include({
      reference_id: referenceIdIdp2,
      request_id: requestId2ndIdP,
      exist: true,
      accessor_id: accessorId2ndIdP,
      success: true,
    });
  });

  it('2nd IdP should receive accessor sign callback with correct data', async function() {
    this.timeout(15000);
    const sid = `${namespace}:${identifier}`;
    const sid_hash = hash(sid);

    const accessorSignParams = await accessorSignPromise2.promise;
    expect(accessorSignParams).to.deep.equal({
      type: 'accessor_sign',
      node_id: 'idp2',
      reference_id: referenceIdIdp2,
      accessor_id: accessorId2ndIdP,
      sid,
      sid_hash,
      hash_method: 'SHA256',
      key_type: 'RSA',
      sign_method: 'RSA-SHA256',
      padding: 'PKCS#1v1.5',
    });
  });

  it('2nd IdP should create identity request with duplicate reference id unsuccessfully', async function() {
    this.timeout(20000);
    const response = await idpApi.createIdentity('idp2', {
      reference_id: referenceIdIdp2,
      callback_url: config.IDP2_CALLBACK_URL,
      namespace,
      identifier,
      accessor_type: 'RSA',
      accessor_public_key: accessorPublicKey2,
      //accessor_id: accessorId,
      ial: 2.3,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20045);
  });

  it('2nd IdP should create identity request with duplicate reference id unsuccessfully', async function() {
    this.timeout(20000);
    const response = await idpApi.createIdentity('idp2', {
      reference_id: referenceIdIdp2,
      callback_url: config.IDP2_CALLBACK_URL,
      namespace,
      identifier,
      accessor_type: 'RSA',
      accessor_public_key: accessorPublicKey2,
      //accessor_id: accessorId,
      ial: 2.3,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20045);
  });

  it('2nd IdP should close identity request successfully', async function() {
    this.timeout(10000);
    const response = await idpApi.closeIdentityRequest('idp2', {
      request_id: requestId2ndIdP,
      callback_url: config.IDP2_CALLBACK_URL,
      reference_id: closeIdentityRequestReferenceId,
    });

    expect(response.status).to.equal(202);

    const closeIdentityRequestResult = await closeIdentityRequestResultPromise.promise;
    expect(closeIdentityRequestResult).to.deep.include({
      success: true,
      reference_id: closeIdentityRequestReferenceId,
      request_id: requestId2ndIdP,
    });

    const IdP2createIdentityResult = await IdP2createIdentityResultPromise.promise;
    expect(IdP2createIdentityResult).to.deep.include({
      node_id: 'idp2',
      type: 'create_identity_result',
      success: false,
      reference_id: referenceIdIdp2,
      request_id: requestId2ndIdP,
      error: { code: 20025, message: 'Request is already closed' },
    });
  });

  it('After request duplicate reference id is not in progress (closed) 2nd IdP should create identity request successfully', async function() {
    this.timeout(20000);
    const response = await idpApi.createIdentity('idp2', {
      reference_id: referenceIdIdp2,
      callback_url: config.IDP2_CALLBACK_URL,
      namespace,
      identifier,
      accessor_type: 'RSA',
      accessor_public_key: accessorPublicKey2,
      //accessor_id: accessorId,
      ial: 2.3,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;

    requestIdAfterCloseRequest = responseBody.request_id;
    accessorIdAfterCloseRequest = responseBody.accessor_id;

    const createIdentityRequestResult = await createIdentityRequestResultAftercloseRequestPromise.promise;
    expect(createIdentityRequestResult).to.deep.include({
      reference_id: referenceIdIdp2,
      request_id: requestIdAfterCloseRequest,
      exist: true,
      accessor_id: accessorIdAfterCloseRequest,
      success: true,
    });
  });

  it('1st IdP should receive create identity request', async function() {
    this.timeout(15000);
    const incomingRequest = await incomingRequestAftercloseRequestPromise.promise;
    expect(incomingRequest).to.deep.include({
      mode: 3,
      request_id: requestIdAfterCloseRequest,
      namespace,
      identifier,
      requester_node_id: 'idp2',
      min_ial: 1.1,
      min_aal: 1,
      data_request_list: [],
    });
    expect(incomingRequest.request_message).to.be.a('string').that.is.not.empty;
    expect(incomingRequest.request_message_hash).to.be.a('string').that.is.not
      .empty;

    requestMessage = incomingRequest.request_message;
    requestMessageSalt = incomingRequest.request_message_salt;

    expect(incomingRequest.request_message_hash).to.equal(
      hashRequestMessageForConsent(
        requestMessage,
        incomingRequest.initial_salt,
        incomingRequest.request_id
      )
    );
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
    await idpApi.closeIdentityRequest('idp2', {
      request_id: requestIdAfterCloseRequest,
      callback_url: config.IDP2_CALLBACK_URL,
      reference_id: closeIdentityRequestReferenceId,
    });
    idp1EventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('accessor_sign_callback');
    idp2EventEmitter.removeAllListeners('callback');
    idp2EventEmitter.removeAllListeners('accessor_sign_callback');
    await wait(3000);
  });
});
