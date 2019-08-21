import { expect } from 'chai';
import forge from 'node-forge';
import uuidv4 from 'uuid/v4';

import { idp2Available } from '../..';
import * as idpApi from '../../../api/v4/idp';
import * as identityApi from '../../../api/v4/identity';
import * as commonApi from '../../../api/v4/common';
import { idp1EventEmitter, idp2EventEmitter } from '../../../callback_server';
import * as db from '../../../db';
import {
  createEventPromise,
  generateReferenceId,
  hash,
  wait,
  createResponseSignature,
} from '../../../utils';
import * as config from '../../../config';
import { eventEmitter as nodeCallbackEventEmitter } from '../../../callback_server/node';
import { receiveMessagequeueSendSuccessCallback } from '../_fragments/common';
import {
  verifyResponseSignature,
  getAndVerifyRequestMessagePaddedHashTest,
} from '../_fragments/request_flow_fragments/idp';

describe('2nd IdP close identity request (mode 3) test', function() {
  const createIdentityRequestMessage =
    'Create identity consent request custom message ข้อความสำหรับขอสร้าง identity บนระบบ';
  const namespace = 'citizen_id';
  const identifier = uuidv4();

  //Keypair for 1st IdP
  const keypair = forge.pki.rsa.generateKeyPair(2048);
  const accessorPrivateKey = forge.pki.privateKeyToPem(keypair.privateKey);
  const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);

  //Keypair for 2nd IdP
  const keypair2 = forge.pki.rsa.generateKeyPair(2048);
  //const accessorPrivateKey2 = forge.pki.privateKeyToPem(keypair2.privateKey);
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

  const mqSendSuccessIdp2ToIdp1CallbackPromise = createEventPromise();

  //1st IdP
  let requestId;
  let accessorId;
  let referenceGroupCode;
  let responseAccessorId;

  //2nd IdP
  let requestId2ndIdP;
  let accessorId2ndIdP;

  let identityForResponse;
  let requestMessagePaddedHash;

  before(function() {
    if (!idp2Available) {
      this.test.parent.pending = true;
      this.skip();
    }

    idp1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId2ndIdP
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
        callbackData.reference_id === referenceIdIdp2
      ) {
        createIdentityRequestResultPromise2.resolve(callbackData);
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

    nodeCallbackEventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'message_queue_send_success' &&
        callbackData.request_id === requestId2ndIdP
      ) {
        if (callbackData.node_id === 'idp2') {
          if (callbackData.destination_node_id === 'idp1') {
            mqSendSuccessIdp2ToIdp1CallbackPromise.resolve(callbackData);
          }
        }
      }
    });
  });

  it('1st IdP should create identity request successfully', async function() {
    this.timeout(10000);
    const response = await identityApi.createIdentity('idp1', {
      reference_id: referenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      identity_list: [
        {
          namespace,
          identifier,
        },
      ],
      accessor_type: 'RSA',
      accessor_public_key: accessorPublicKey,
      //accessor_id,
      ial: 2.3,
      mode: 3,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    // expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;

    // requestId = responseBody.request_id;
    accessorId = responseBody.accessor_id;
  });

  it('1st IdP Identity should be created successfully', async function() {
    this.timeout(15000);
    const createIdentityResult = await createIdentityResultPromise.promise;
    expect(createIdentityResult).to.deep.include({
      reference_id: referenceId,
      // request_id: requestId,
      success: true,
    });
    expect(createIdentityResult.reference_group_code).to.be.a('string').that.is
      .not.empty;

    referenceGroupCode = createIdentityResult.reference_group_code;

    const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
      namespace,
      identifier,
    });

    const idpNodes = await response.json();
    const idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
    expect(idpNode).to.not.be.undefined;
    expect(idpNode.mode_list)
      .to.be.an('array')
      .that.include(2, 3);

    db.idp1Identities.push({
      referenceGroupCode,
      mode: 3,
      namespace,
      identifier,
      accessors: [
        {
          accessorId,
          accessorPrivateKey,
          accessorPublicKey,
        },
      ],
    });
  });

  it('2nd IdP should create identity request successfully', async function() {
    this.timeout(10000);
    const response = await identityApi.createIdentity('idp2', {
      reference_id: referenceIdIdp2,
      callback_url: config.IDP2_CALLBACK_URL,
      identity_list: [
        {
          namespace,
          identifier,
        },
      ],
      accessor_type: 'RSA',
      accessor_public_key: accessorPublicKey2,
      //accessor_id: accessorId,
      ial: 2.3,
      mode: 3,
      request_message: createIdentityRequestMessage,
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

    db.idp2Identities.push({
      referenceGroupCode,
      mode: 3,
      namespace,
      identifier,
      accessors: [
        {
          accessorId,
          accessorPrivateKey,
          accessorPublicKey,
        },
      ],
    });
  });

  it('IdP (idp2) should receive message queue send success (To idp1) callback', async function() {
    this.timeout(15000);
    await receiveMessagequeueSendSuccessCallback({
      nodeId: 'idp2',
      requestId: requestId2ndIdP,
      mqSendSuccessCallbackPromise: mqSendSuccessIdp2ToIdp1CallbackPromise,
      destinationNodeId: 'idp1',
    });
  });

  it('1st IdP should receive create identity request', async function() {
    this.timeout(15000);
    const incomingRequest = await incomingRequestPromise.promise;
    expect(incomingRequest).to.deep.include({
      mode: 3,
      request_id: requestId2ndIdP,
      requester_node_id: 'idp2',
      min_ial: 1.1,
      min_aal: 1,
      data_request_list: [],
    });
    expect(incomingRequest.reference_group_code).to.be.a('string').that.is.not
      .empty;
    expect(incomingRequest.request_message).to.be.a('string').that.is.not.empty;
    expect(incomingRequest.request_message_hash).to.be.a('string').that.is.not
      .empty;
    expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
      .empty;

    expect(incomingRequest.request_message_hash).to.equal(
      hash(createIdentityRequestMessage + incomingRequest.request_message_salt),
    );
    expect(incomingRequest.creation_time).to.be.a('number');
    expect(incomingRequest.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
      ':',
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    expect(incomingRequest.request_timeout).to.be.a('number');
  });

  it('IdP should get request_message_padded_hash successfully', async function() {
    identityForResponse = db.idp1Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier,
    );

    responseAccessorId = identityForResponse.accessors[0].accessorId;
    let accessorPublicKey = identityForResponse.accessors[0].accessorPublicKey;

    responseAccessorId = identityForResponse.accessors[0].accessorId;

    const testResult = await getAndVerifyRequestMessagePaddedHashTest({
      callApiAtNodeId: 'idp1',
      idpNodeId: 'idp1',
      requestId: requestId2ndIdP,
      incomingRequestPromise,
      accessorPublicKey,
      accessorId: responseAccessorId,
    });
    requestMessagePaddedHash = testResult.verifyRequestMessagePaddedHash;
  });

  it('2nd IdP should get request_id by reference_id while request is unfinished (not closed or timed out) successfully', async function() {
    this.timeout(10000);
    const response = await identityApi.getRequestIdByReferenceId('idp2', {
      reference_id: referenceIdIdp2,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.deep.equal({
      request_id: requestId2ndIdP,
      accessor_id: accessorId2ndIdP,
    });
  });

  it('2nd IdP should close identity request successfully', async function() {
    this.timeout(10000);
    const response = await identityApi.closeIdentityRequest('idp2', {
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

  it('After 2nd IdP close identity request 1st IdP should create response (accept) unsuccessfully', async function() {
    this.timeout(10000);

    let accessorPrivateKey =
      identityForResponse.accessors[0].accessorPrivateKey;

    const signature = createResponseSignature(
      accessorPrivateKey,
      requestMessagePaddedHash,
    );

    const response = await idpApi.createResponse('idp1', {
      reference_id: referenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId2ndIdP,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      accessor_id: responseAccessorId,
      signature,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody).to.deep.equal({
      error: {
        code: 20025,
        message: 'Request is already closed',
      },
    });
  });

  it('2nd IdP Identity should be created unsuccessfully', async function() {
    this.timeout(15000);
    const response = await commonApi.getRelevantIdpNodesBySid('idp2', {
      namespace,
      identifier,
    });
    const idpNodes = await response.json();
    const idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp2');
    expect(idpNode).to.not.exist;
  });

  it('Special request status for create identity should be closed', async function() {
    this.timeout(10000);
    const response = await commonApi.getRequest('idp2', {
      requestId: requestId2ndIdP,
    });
    const responseBody = await response.json();
    expect(responseBody).to.deep.include({
      request_id: requestId2ndIdP,
      min_idp: 1,
      min_aal: 1,
      min_ial: 1.1,
      request_timeout: 86400,
      data_request_list: [],
      closed: true,
      timed_out: false,
      mode: 3,
      status: 'pending',
      requester_node_id: 'idp2',
    });
    expect(responseBody.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight = responseBody.creation_block_height.split(
      ':',
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('2nd IdP should get response status code 404 when get request_id by reference_id after request is finished (closed)', async function() {
    this.timeout(10000);
    await wait(2000); //wait for api clean up reference id
    const response = await identityApi.getRequestIdByReferenceId('idp2', {
      reference_id: referenceIdIdp2,
    });
    expect(response.status).to.equal(404);
  });

  after(function() {
    idp1EventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('accessor_sign_callback');
    idp2EventEmitter.removeAllListeners('callback');
    idp2EventEmitter.removeAllListeners('accessor_sign_callback');
    nodeCallbackEventEmitter.removeAllListeners('callback');
  });
});

describe('IdP (idp2) create identity as 2nd IdP after close identity request test', function() {
  const createIdentityRequestMessage =
    'Create identity consent request custom message ข้อความสำหรับขอสร้าง identity บนระบบ';
  let namespace;
  let identifier;

  const referenceId = generateReferenceId();
  const idp1ReferenceId = generateReferenceId();

  const createIdentityRequestResultPromise = createEventPromise(); // 2nd IdP
  const accessorSignPromise = createEventPromise(); // 2nd IdP
  const incomingRequestPromise = createEventPromise(); // 1st IdP
  const responseResultPromise = createEventPromise(); // 1st IdP
  const accessorEncryptPromise = createEventPromise(); // 1st IdP
  const createIdentityResultPromise = createEventPromise(); // 2nd IdP

  const mqSendSuccessIdp2ToIdp1CallbackPromise = createEventPromise();
  const mqSendSuccessIdp1ToIdp2CallbackPromise = createEventPromise();

  let requestId;
  let accessorId;
  let requestMessagePaddedHash;
  let requestMessage;
  let requestMessageSalt;
  let requestMessageHash;
  let responseAccessorId;
  let referenceGroupCode;
  let identityForResponse;

  before(function() {
    if (!idp2Available) {
      this.skip();
    }

    if (db.idp2Identities.length < 1) {
      throw new Error('Identity to use at idp2 not found');
    }

    const latestIdentity = db.idp2Identities.length - 1;

    namespace = db.idp2Identities[latestIdentity].namespace;
    identifier = db.idp2Identities[latestIdentity].identifier;

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
    });

    idp1EventEmitter.on('accessor_encrypt_callback', function(callbackData) {
      if (callbackData.request_id === requestId) {
        accessorEncryptPromise.resolve(callbackData);
      }
    });

    idp2EventEmitter.on('callback', function(callbackData) {
      if (
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

    nodeCallbackEventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'message_queue_send_success' &&
        callbackData.request_id === requestId
      ) {
        if (callbackData.node_id === 'idp2') {
          if (callbackData.destination_node_id === 'idp1') {
            mqSendSuccessIdp2ToIdp1CallbackPromise.resolve(callbackData);
          }
        } else if (callbackData.node_id === 'idp1') {
          if (callbackData.destination_node_id === 'idp2') {
            mqSendSuccessIdp1ToIdp2CallbackPromise.resolve(callbackData);
          }
        }
      }
    });
  });

  it('2nd IdP should create identity request successfully', async function() {
    this.timeout(10000);
    const identity = db.idp2Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier,
    );
    const accessorPublicKey = identity.accessors[0].accessorPublicKey;
    //const accessorPrivateKey = identity.accessors[0].accessorPrivateKey;
    referenceGroupCode = identity.referenceGroupCode;

    const response = await identityApi.createIdentity('idp2', {
      reference_id: referenceId,
      callback_url: config.IDP2_CALLBACK_URL,
      identity_list: [
        {
          namespace,
          identifier,
        },
      ],
      accessor_type: 'RSA',
      accessor_public_key: accessorPublicKey,
      // accessor_id: accessorId,
      ial: 2.3,
      mode: 3,
      request_message: createIdentityRequestMessage,
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
      exist: true,
      accessor_id: accessorId,
      success: true,
    });
    expect(createIdentityRequestResult.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight = createIdentityRequestResult.creation_block_height.split(
      ':',
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('2nd IdP should get request_id for the unfinished (not closed or timed out) create identity request with reference_id', async function() {
    this.timeout(10000);
    const response = await identityApi.getRequestIdByReferenceId('idp2', {
      reference_id: referenceId,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.deep.equal({
      request_id: requestId,
      accessor_id: accessorId,
    });
  });

  it('IdP (idp2) should receive message queue send success (To idp1) callback', async function() {
    this.timeout(15000);
    await receiveMessagequeueSendSuccessCallback({
      nodeId: 'idp2',
      requestId,
      mqSendSuccessCallbackPromise: mqSendSuccessIdp2ToIdp1CallbackPromise,
      destinationNodeId: 'idp1',
    });
  });

  it('1st IdP should receive create identity request', async function() {
    this.timeout(15000);
    const incomingRequest = await incomingRequestPromise.promise;
    expect(incomingRequest).to.deep.include({
      mode: 3,
      request_id: requestId,
      requester_node_id: 'idp2',
      min_ial: 1.1,
      min_aal: 1,
      data_request_list: [],
    });
    expect(incomingRequest.reference_group_code).to.be.a('string').that.is.not
      .empty;
    expect(incomingRequest.request_message).to.be.a('string').that.is.not.empty;
    expect(incomingRequest.request_message_hash).to.be.a('string').that.is.not
      .empty;
    expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
      .empty;

    requestMessageSalt = incomingRequest.request_message_salt;

    expect(incomingRequest.request_message_hash).to.equal(
      hash(createIdentityRequestMessage + incomingRequest.request_message_salt),
    );
    expect(incomingRequest.creation_time).to.be.a('number');
    expect(incomingRequest.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
      ':',
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    requestMessageHash = incomingRequest.request_message_hash;
  });

  it('IdP should get request_message_padded_hash successfully', async function() {
    identityForResponse = db.idp1Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier,
    );

    responseAccessorId = identityForResponse.accessors[0].accessorId;
    let accessorPublicKey = identityForResponse.accessors[0].accessorPublicKey;

    responseAccessorId = identityForResponse.accessors[0].accessorId;

    const testResult = await getAndVerifyRequestMessagePaddedHashTest({
      callApiAtNodeId: 'idp1',
      idpNodeId: 'idp1',
      requestId,
      incomingRequestPromise,
      accessorPublicKey,
      accessorId: responseAccessorId,
    });
    requestMessagePaddedHash = testResult.verifyRequestMessagePaddedHash;
  });

  it('1st IdP should create response (accept) successfully', async function() {
    this.timeout(10000);

    let accessorPrivateKey =
      identityForResponse.accessors[0].accessorPrivateKey;

    const signature = createResponseSignature(
      accessorPrivateKey,
      requestMessagePaddedHash,
    );

    const response = await idpApi.createResponse('idp1', {
      reference_id: idp1ReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      accessor_id: responseAccessorId,
      signature,
    });
    expect(response.status).to.equal(202);
  });

  // it('IdP should receive accessor encrypt callback with correct data', async function() {
  //   this.timeout(15000);
  //   const identity = db.idp1Identities.find(
  //     identity =>
  //       identity.namespace === namespace && identity.identifier === identifier
  //   );
  //   let accessorPublicKey = identity.accessors[0].accessorPublicKey;

  //   let testResult = await idpReceiveAccessorEncryptCallbackTest({
  //     callIdpApiAtNodeId: 'idp1',
  //     accessorEncryptPromise,
  //     accessorId: responseAccessorId,
  //     requestId,
  //     idpReferenceId: idp1ReferenceId,
  //     incomingRequestPromise,
  //     accessorPublicKey,
  //   });
  //   requestMessagePaddedHash = testResult.verifyRequestMessagePaddedHash;
  // });

  it('IdP shoud receive callback create response result with success = true', async function() {
    const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      node_id: 'idp1',
      type: 'response_result',
      reference_id: idp1ReferenceId,
      request_id: requestId,
      success: true,
    });
  });

  it('IdP (idp1) should receive message queue send success (To idp2) callback', async function() {
    this.timeout(15000);
    await receiveMessagequeueSendSuccessCallback({
      nodeId: 'idp1',
      requestId,
      mqSendSuccessCallbackPromise: mqSendSuccessIdp1ToIdp2CallbackPromise,
      destinationNodeId: 'idp2',
    });
  });

  it('Should verify IdP response signature successfully', async function() {
    this.timeout(15000);
    const identity = db.idp1Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier,
    );
    let accessorPrivateKey = identity.accessors[0].accessorPrivateKey;

    await verifyResponseSignature({
      callApiAtNodeId: 'idp1',
      requestId,
      requestMessagePaddedHash,
      accessorPrivateKey,
    });
  });

  it('2nd IdP identity should be created successfully', async function() {
    this.timeout(15000);
    const createIdentityResult = await createIdentityResultPromise.promise;
    expect(createIdentityResult).to.deep.include({
      reference_id: referenceId,
      request_id: requestId,
      success: true,
    });
    expect(createIdentityResult.reference_group_code).to.equal(
      referenceGroupCode,
    );

    const response = await commonApi.getRelevantIdpNodesBySid('idp2', {
      namespace,
      identifier,
    });
    const idpNodes = await response.json();
    const idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
    expect(idpNode).to.not.be.undefined;
    expect(idpNode.mode_list)
      .to.be.an('array')
      .that.include(2, 3);
  });

  it('Special request status for create identity should be completed and closed', async function() {
    this.timeout(10000);
    //wait for api close request
    await wait(3000);
    const response = await commonApi.getRequest('idp2', { requestId });
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
      requester_node_id: 'idp2',
    });
    expect(responseBody.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight = responseBody.creation_block_height.split(
      ':',
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    await wait(3000); //wait for api clean up reference id
  });

  it('2nd IdP should get response status code 404 when get request_id by reference_id after request is finished (closed)', async function() {
    this.timeout(10000);
    const response = await identityApi.getRequestIdByReferenceId('idp2', {
      reference_id: referenceId,
    });
    expect(response.status).to.equal(404);
  });

  after(function() {
    idp1EventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
    idp2EventEmitter.removeAllListeners('callback');
    nodeCallbackEventEmitter.removeAllListeners('callback');
  });
});
