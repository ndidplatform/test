import { expect } from 'chai';
import forge from 'node-forge';
import uuidv4 from 'uuid/v4';

import { idp2Available } from '../..';
import * as idpApi from '../../../api/v3/idp';
import * as identityApi from '../../../api/v3/identity';
import * as commonApi from '../../../api/v3/common';
import * as rpApi from '../../../api/v3/rp';
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

describe('Reject 2nd IdP create identity (mode 3) test', function() {
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
  //const accessorPrivateKey2 = forge.pki.privateKeyToPem(keypair2.privateKey);
  const accessorPublicKey2 = forge.pki.publicKeyToPem(keypair2.publicKey);

  const referenceId = generateReferenceId();
  const referenceIdIdp2 = generateReferenceId();
  const idp1RejectRequestReferenceId = generateReferenceId();

  const createIdentityResultPromise = createEventPromise();
  const incomingRequestPromise = createEventPromise(); //1st IDP
  const createIdentityRequestResultPromise = createEventPromise(); //1st IDP
  const createIdentityRequestResultPromise2 = createEventPromise(); //2nd IDP
  const IdP2createIdentityResultPromise = createEventPromise(); //2nd IDP
  const responseResultPromise = createEventPromise();
  const accessorEncryptPromise = createEventPromise();

  const mqSendSuccessIdp2ToIdp1CallbackPromise = createEventPromise();
  const mqSendSuccessIdp1ToIdp2CallbackPromise = createEventPromise();

  //1st IdP
  let accessorId;
  let referenceGroupCode;
  let responseAccessorId;

  //2nd IdP
  let requestId2ndIdPCreateIdentity;
  let accessorId2ndIdPCreateIdentity;

  let requestMessageHash;
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

    idp1EventEmitter.on('accessor_encrypt_callback', function(callbackData) {
      if (callbackData.request_id === requestId2ndIdPCreateIdentity) {
        accessorEncryptPromise.resolve(callbackData);
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

    nodeCallbackEventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'message_queue_send_success' &&
        callbackData.request_id === requestId2ndIdPCreateIdentity
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

  it('1st IdP should create identity request (mode 3) successfully', async function() {
    this.timeout(10000);
    const response = await identityApi.createIdentity('idp1', {
      reference_id: referenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      identity_list: [{ namespace, identifier }],

      accessor_type: 'RSA',
      accessor_public_key: accessorPublicKey,
      //accessor_id,
      ial: 2.3,
      mode: 3,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;

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
    expect(idpNodes)
      .to.be.an('array')
      .that.to.have.lengthOf(1);
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

  it('2nd IdP should create identity request (mode 3) successfully', async function() {
    this.timeout(20000);
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
      request_message: createIdentityRequestMessage,
      mode: 3,
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

  it('2nd IdP should get request_id for the unfinished (not closed or timed out) create identity request with reference_id', async function() {
    this.timeout(10000);
    const response = await identityApi.getRequestIdByReferenceId('idp2', {
      reference_id: referenceIdIdp2,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.deep.equal({
      request_id: requestId2ndIdPCreateIdentity,
      accessor_id: accessorId2ndIdPCreateIdentity,
    });
  });

  it('IdP (idp2) should receive message queue send success (To idp1) callback', async function() {
    this.timeout(15000);
    await receiveMessagequeueSendSuccessCallback({
      nodeId: 'idp2',
      requestId: requestId2ndIdPCreateIdentity,
      mqSendSuccessCallbackPromise: mqSendSuccessIdp2ToIdp1CallbackPromise,
      destinationNodeId: 'idp1',
    });
  });

  it('1st IdP should receive create identity request', async function() {
    this.timeout(15000);
    const incomingRequest = await incomingRequestPromise.promise;
    expect(incomingRequest).to.deep.include({
      mode: 3,
      request_id: requestId2ndIdPCreateIdentity,
      request_message: createIdentityRequestMessage,
      request_message_hash: hash(
        createIdentityRequestMessage + incomingRequest.request_message_salt,
      ),
      requester_node_id: 'idp2',
      min_ial: 1.1,
      min_aal: 1,
      data_request_list: [],
    });
    expect(incomingRequest.reference_group_code).to.be.a('string').that.is.not
      .empty;
    expect(incomingRequest.creation_time).to.be.a('number');
    expect(incomingRequest.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
      ':',
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    expect(incomingRequest.request_timeout).to.be.a('number');

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
      requestId: requestId2ndIdPCreateIdentity,
      incomingRequestPromise,
      accessorPublicKey,
      accessorId: responseAccessorId,
    });
    requestMessagePaddedHash = testResult.verifyRequestMessagePaddedHash;
  });

  it('1st IdP should create response (reject) successfully', async function() {
    this.timeout(10000);

    let accessorPrivateKey =
      identityForResponse.accessors[0].accessorPrivateKey;

    const signature = createResponseSignature(
      accessorPrivateKey,
      requestMessagePaddedHash,
    );

    const response = await idpApi.createResponse('idp1', {
      reference_id: idp1RejectRequestReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId2ndIdPCreateIdentity,
      ial: 2.3,
      aal: 3,
      status: 'reject',
      accessor_id: responseAccessorId,
      signature,
    });
    expect(response.status).to.equal(202);
  });

  // it('IdP should receive accessor encrypt callback with correct data', async function() {
  //   this.timeout(15000);
  //   const identity = db.idp1Identities.find(
  //     identity =>
  //       identity.namespace === namespace && identity.identifier === identifier,
  //   );
  //   let accessorPublicKey = identity.accessors[0].accessorPublicKey;

  //   let testResult = await idpReceiveAccessorEncryptCallbackTest({
  //     callIdpApiAtNodeId: 'idp1',
  //     accessorEncryptPromise,
  //     accessorId: responseAccessorId,
  //     requestId: requestId2ndIdPCreateIdentity,
  //     idpReferenceId: idp1RejectRequestReferenceId,
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
      reference_id: idp1RejectRequestReferenceId,
      request_id: requestId2ndIdPCreateIdentity,
      success: true,
    });
  });

  it('IdP (idp1) should receive message queue send success (To idp2) callback', async function() {
    this.timeout(15000);
    await receiveMessagequeueSendSuccessCallback({
      nodeId: 'idp1',
      requestId: requestId2ndIdPCreateIdentity,
      mqSendSuccessCallbackPromise: mqSendSuccessIdp1ToIdp2CallbackPromise,
      destinationNodeId: 'idp2',
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

    const response = await commonApi.getRelevantIdpNodesBySid('idp2', {
      namespace,
      identifier,
    });
    const idpNodes = await response.json();
    const idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp2');
    expect(idpNode).to.be.undefined;
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
      requestId: requestId2ndIdPCreateIdentity,
      requestMessagePaddedHash,
      accessorPrivateKey,
    });
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
      ':',
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    await wait(3000); //wait for api clean up refernece_id
  });

  it('2nd IdP should get response status code 404 when get request_id by reference_id after request is finished (closed)', async function() {
    this.timeout(10000);
    const response = await identityApi.getRequestIdByReferenceId('idp1', {
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
      bypass_identity_check: false,
    };
    const response = await rpApi.createRequest('rp1', createRequestParams);
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20005);
  });

  after(function() {
    idp1EventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
    idp2EventEmitter.removeAllListeners('callback');
    nodeCallbackEventEmitter.removeAllListeners('callback');
  });
});
