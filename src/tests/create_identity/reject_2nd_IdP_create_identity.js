import { expect } from 'chai';
import forge from 'node-forge';
import uuidv4 from 'uuid/v4';

import { idp2Available } from '..';
import * as idpApi from '../../api/v2/idp';
import * as commonApi from '../../api/v2/common';
import * as rpApi from '../../api/v2/rp';
import { idp1EventEmitter, idp2EventEmitter } from '../../callback_server';
import * as db from '../../db';
import {
  createEventPromise,
  generateReferenceId,
  hash,
  hashRequestMessageForConsent,
  wait,
  createResponseSignature,
} from '../../utils';
import * as config from '../../config';

describe('Reject 2nd IdP create identity test', function() {
  const namespace = 'citizen_id';
  const identifier = uuidv4();
  const createIdentityRequestMessage =
    'Create identity consent request custom message ข้อความสำหรับขอสร้างตัวตนบนระบบ';
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
  const idp1RejectRequestReferenceId = generateReferenceId();

  const createIdentityResultPromise = createEventPromise();
  const incomingRequestPromise = createEventPromise(); //1st IDP
  const createIdentityRequestResultPromise = createEventPromise(); //1st IDP
  const createIdentityRequestResultPromise2 = createEventPromise(); //2nd IDP
  const accessorSignPromise = createEventPromise(); //1s IDP
  const accessorSignPromise2 = createEventPromise(); //2nd IDP
  const IdP2createIdentityResultPromise = createEventPromise(); //2nd IDP
  const responseResultPromise = createEventPromise();

  //1st IdP
  let requestId;
  let accessorId;

  //2nd IdP
  let requestId2ndIdPCreateIdentity;
  let accessorId2ndIdPCreateIdentity;

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
        callbackData.request_id === requestId2ndIdPCreateIdentity
      ) {
        incomingRequestPromise.resolve(callbackData);
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
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.request_id === requestId2ndIdPCreateIdentity
      ) {
        responseResultPromise.resolve(callbackData);
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
        callbackData.request_id === requestId2ndIdPCreateIdentity
      ) {
        createIdentityRequestResultPromise2.resolve(callbackData);
      } else if (
        callbackData.type === 'create_identity_result' &&
        callbackData.reference_id === referenceIdIdp2 &&
        callbackData.request_id === requestId2ndIdPCreateIdentity
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
    const idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
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
      request_message: createIdentityRequestMessage,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;

    requestId2ndIdPCreateIdentity = responseBody.request_id;
    accessorId2ndIdPCreateIdentity = responseBody.accessor_id;

    const createIdentityRequestResult = await createIdentityRequestResultPromise2.promise;
    expect(createIdentityRequestResult).to.deep.include({
      reference_id: referenceIdIdp2,
      request_id: requestId2ndIdPCreateIdentity,
      exist: true,
      accessor_id: accessorId2ndIdPCreateIdentity,
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
      accessor_id: accessorId2ndIdPCreateIdentity,
      sid,
      sid_hash,
      hash_method: 'SHA256',
      key_type: 'RSA',
      sign_method: 'RSA-SHA256',
      padding: 'PKCS#1v1.5',
    });
  });

  it('2nd IdP should get request_id for the unfinished (not closed or timed out) create identity request with reference_id', async function() {
    this.timeout(10000);
    const response = await idpApi.getRequestIdByReferenceId('idp2', {
      reference_id: referenceIdIdp2,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.deep.equal({
      request_id: requestId2ndIdPCreateIdentity,
      accessor_id: accessorId2ndIdPCreateIdentity,
    });
  });

  it('1st IdP should receive create identity request', async function() {
    this.timeout(15000);
    const incomingRequest = await incomingRequestPromise.promise;
    expect(incomingRequest).to.deep.include({
      mode: 3,
      request_id: requestId2ndIdPCreateIdentity,
      namespace,
      identifier,
      request_message: createIdentityRequestMessage,
      request_message_hash: hashRequestMessageForConsent(
        createIdentityRequestMessage,
        incomingRequest.initial_salt,
        requestId2ndIdPCreateIdentity
      ),
      requester_node_id: 'idp2',
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

  it('1st IdP should create response (reject) successfully', async function() {
    this.timeout(10000);
    const identity = db.idp1Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    const response = await idpApi.createResponse('idp1', {
      reference_id: idp1RejectRequestReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId2ndIdPCreateIdentity,
      namespace,
      identifier,
      ial: 2.3,
      aal: 3,
      secret: identity.accessors[0].secret,
      status: 'reject',
      signature: createResponseSignature(
        identity.accessors[0].accessorPrivateKey,
        requestMessageHash
      ),
      accessor_id: identity.accessors[0].accessorId,
    });
    expect(response.status).to.equal(202);

    const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      reference_id: idp1RejectRequestReferenceId,
      request_id: requestId2ndIdPCreateIdentity,
      success: true,
    });
  });

  it('2nd IdP should receive create identity result with success false', async function() {
    this.timeout(25000);
    const createIdentityResult = await IdP2createIdentityResultPromise.promise;
    expect(createIdentityResult).to.deep.include({
      reference_id: referenceIdIdp2,
      request_id: requestId2ndIdPCreateIdentity,
      success: false,
    });
    expect(createIdentityResult.error.code).to.equal(10016);
  });

  it('Special request status for create identity should be rejected and closed', async function() {
    this.timeout(25000);
    //wait for api close request
    await wait(3000);
    const response = await commonApi.getRequest('idp2', {
      requestId: requestId2ndIdPCreateIdentity,
    });
    const responseBody = await response.json();
    expect(responseBody).to.deep.include({
      request_id: requestId2ndIdPCreateIdentity,
      min_idp: 1,
      min_aal: 1,
      min_ial: 1.1,
      request_timeout: 86400,
      data_request_list: [],
      closed: true,
      timed_out: false,
      mode: 3,
      status: 'rejected',
      requester_node_id: 'idp2',
    });
    expect(responseBody.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight = responseBody.creation_block_height.split(
      ':'
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    await wait(3000); //wait for api clean up refernece_id
  });

  it('2nd IdP should get response status code 404 when get request_id by reference_id after request is finished (closed)', async function() {
    this.timeout(10000);
    const response = await idpApi.getRequestIdByReferenceId('idp1', {
      reference_id: referenceIdIdp2,
    });
    expect(response.status).to.equal(404);
  });

  it('RP should create a request to idp2 unsuccessfully', async function() {
    this.timeout(10000);

    let createRequestParams = {
      reference_id: uuidv4(),
      callback_url: config.RP_CALLBACK_URL,
      mode: 3,
      namespace,
      identifier,
      idp_id_list: ['idp2'],
      data_request_list: [],
      request_message:
        'Test request message (mode 3) ทดสอบภาษาไทย should\\|be|able\\\\|to|send\\\\\\|this',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    };
    const response = await rpApi.createRequest('rp1', createRequestParams);
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20005);
  });
});
