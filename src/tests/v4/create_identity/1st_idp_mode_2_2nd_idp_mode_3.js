import { expect } from 'chai';
import forge from 'node-forge';
import uuidv4 from 'uuid/v4';

import * as identityApi from '../../../api/v4/identity';
import * as commonApi from '../../../api/v4/common';
import * as idpApi from '../../../api/v4/idp';
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
import { idp2Available } from '../..';
import { eventEmitter as nodeCallbackEventEmitter } from '../../../callback_server/node';
import { receiveMessagequeueSendSuccessCallback } from '../_fragments/common';
import {
  idpReceiveAccessorEncryptCallbackTest,
  verifyResponseSignature,
  getAndVerifyRequestMessagePaddedHashTest,
} from '../_fragments/request_flow_fragments/idp';

describe('IdP (idp1) create identity (mode 2) (without providing accessor_id) as 1st IdP', function() {
  const namespace = 'citizen_id';
  const identifier = uuidv4();
  const keypair = forge.pki.rsa.generateKeyPair(2048);
  const accessorPrivateKey = forge.pki.privateKeyToPem(keypair.privateKey);
  const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);

  const referenceId = generateReferenceId();

  const createIdentityResultPromise = createEventPromise();

  let accessorId;
  let referenceGroupCode;

  before(function() {
    idp1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'create_identity_result' &&
        callbackData.reference_id === referenceId
      ) {
        createIdentityResultPromise.resolve(callbackData);
      }
    });
  });

  it('Before create identity this sid should not exist on platform ', async function() {
    const response = await identityApi.getIdentityInfo('idp1', {
      namespace,
      identifier,
    });
    expect(response.status).to.equal(404);
  });

  it('Before create identity this sid should not associated with idp1 ', async function() {
    const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
      namespace,
      identifier,
    });
    const idpNodes = await response.json();
    const idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
    expect(idpNode).to.be.an.undefined;
  });

  it('Before create identity should not get identity ial', async function() {
    const response = await identityApi.getIdentityIal('idp1', {
      namespace,
      identifier,
    });
    expect(response.status).to.equal(404);
  });

  it('Should create identity request (mode2) successfully', async function() {
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
      mode: 2,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody).to.not.include.keys('request_id');
    expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.exist).to.equal(false);

    accessorId = responseBody.accessor_id;
  });

  it('Identity should be created successfully', async function() {
    this.timeout(15000);
    const createIdentityResult = await createIdentityResultPromise.promise;
    expect(createIdentityResult).to.deep.include({
      reference_id: referenceId,
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
      .that.include(2);

    db.idp1Identities.push({
      referenceGroupCode,
      mode: 2,
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

  it('After create identity this sid should be existing on platform ', async function() {
    const response = await identityApi.getIdentityInfo('idp1', {
      namespace,
      identifier,
    });
    expect(response.status).to.equal(200);
    const responseBody = await response.json();
    expect(responseBody.reference_group_code).to.equal(referenceGroupCode);
  });

  it('After create identity should get identity ial successfully', async function() {
    const response = await identityApi.getIdentityIal('idp1', {
      namespace,
      identifier,
    });
    expect(response.status).to.equal(200);
    const responseBody = await response.json();
    expect(responseBody.ial).to.equal(2.3);
  });

  describe('IdP (idp2) create identity (mode 3) (without providing accessor_id) as 2nd IdP', function() {
    const keypair = forge.pki.rsa.generateKeyPair(2048);
    const accessorPrivateKey = forge.pki.privateKeyToPem(keypair.privateKey);
    const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);

    const referenceId = generateReferenceId();
    const idpReferenceId = generateReferenceId();

    const incomingRequestPromise = createEventPromise(); // idp1
    const responseResultPromise = createEventPromise(); // idp1
    const notificationCreateIdentityPromise = createEventPromise(); // idp1
    const accessorEncryptPromise = createEventPromise(); // idp1

    const createIdentityRequestResultPromise = createEventPromise(); // idp2
    const createIdentityResultPromise = createEventPromise(); // idp2

    const mqSendSuccessIdp2ToIdp1CallbackPromise = createEventPromise();
    const mqSendSuccessIdp1ToIdp2CallbackPromise = createEventPromise();

    let requestId;
    let accessorId;
    let referenceGroupCode;
    //   let requestMessageHash;
    const createIdentityRequestMessage =
      'Create identity consent request custom message ข้อความสำหรับขอสร้างตัวตนบนระบบ';

    let identityForResponse;
    let responseAccessorId;
    let requestMessagePaddedHash;

    before(function() {
      if (!idp2Available) {
        this.test.parent.pending = true;
        this.skip();
      }

      const identity = db.idp1Identities.find(
        identity =>
          identity.namespace === namespace &&
          identity.identifier === identifier &&
          identity.mode === 2,
      );
      referenceGroupCode = identity.referenceGroupCode;

      if (db.idp1Identities[0] == null || !identity) {
        throw new Error('No created identity to use');
      }

      idp1EventEmitter.on('identity_notification_callback', function(
        callbackData,
      ) {
        if (
          callbackData.type === 'identity_modification_notification' &&
          callbackData.reference_group_code === referenceGroupCode &&
          callbackData.action === 'create_identity'
        ) {
          notificationCreateIdentityPromise.resolve(callbackData);
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

    it('Before create identity this sid should exist on platform ', async function() {
      const response = await identityApi.getIdentityInfo('idp2', {
        namespace,
        identifier,
      });
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      expect(responseBody.reference_group_code).to.equal(referenceGroupCode);
    });

    it('Before create identity this sid should associated with idp1 ', async function() {
      const response = await commonApi.getRelevantIdpNodesBySid('idp2', {
        namespace,
        identifier,
      });
      expect(response.status).equal(200);
      const idpNodes = await response.json();
      expect(idpNodes).to.be.an('array').is.not.empty;
    });

    it('Before create identity should not get identity ial', async function() {
      const response = await identityApi.getIdentityIal('idp2', {
        namespace,
        identifier,
      });
      expect(response.status).to.equal(404);
    });

    it('Idp (idp2) should create identity request (mode 3) as 2nd IdP successfully', async function() {
      this.timeout(10000);
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
        //accessor_id,
        ial: 2.3,
        mode: 3,
        request_message: createIdentityRequestMessage,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.exist).to.equal(true);

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
      expect(createIdentityRequestResult.creation_block_height).to.be.a(
        'string',
      );
      const splittedCreationBlockHeight = createIdentityRequestResult.creation_block_height.split(
        ':',
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
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
        mode: 2,
        request_id: requestId,
        reference_group_code: referenceGroupCode,
        request_message: createIdentityRequestMessage,
        request_message_hash: hash(
          createIdentityRequestMessage + incomingRequest.request_message_salt,
        ),
        requester_node_id: 'idp2',
        min_ial: 1.1,
        min_aal: 1,
        data_request_list: [],
      });

      expect(incomingRequest.creation_time).to.be.a('number');
      expect(incomingRequest.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
        ':',
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
      expect(incomingRequest.request_timeout).to.be.a('number');

      // requestMessageHash = incomingRequest.request_message_hash;
    });

    it('IdP should get request_message_padded_hash successfully', async function() {
      identityForResponse = db.idp1Identities.find(
        identity =>
          identity.namespace === namespace &&
          identity.identifier === identifier,
      );

      responseAccessorId = identityForResponse.accessors[0].accessorId;
      let accessorPublicKey =
        identityForResponse.accessors[0].accessorPublicKey;

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
        reference_id: idpReferenceId,
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
    //   this.timeout(10000);
    //   const identity = db.idp1Identities.find(
    //     identity =>
    //       identity.namespace === namespace &&
    //       identity.identifier === identifier,
    //   );
    //   let accessorPublicKey = identity.accessors[0].accessorPublicKey;

    //   let testResult = await idpReceiveAccessorEncryptCallbackTest({
    //     callIdpApiAtNodeId: 'idp1',
    //     accessorEncryptPromise,
    //     accessorId: responseAccessorId,
    //     requestId,
    //     idpReferenceId: idpReferenceId,
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
        reference_id: idpReferenceId,
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
          identity.namespace === namespace &&
          identity.identifier === identifier,
      );

      let accessorPrivateKey = identity.accessors[0].accessorPrivateKey;

      await verifyResponseSignature({
        callApiAtNodeId: 'idp1',
        requestId,
        requestMessagePaddedHash,
        accessorPrivateKey,
      });
    });

    it('Identity should be created successfully', async function() {
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

      //referenceGroupCode = createIdentityResult.reference_group_code;

      const response = await commonApi.getRelevantIdpNodesBySid('idp2', {
        namespace,
        identifier,
      });
      const idpNodes = await response.json();
      const idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp2');
      expect(idpNode).to.not.be.undefined;
      expect(idpNodes)
        .to.be.an('array')
        .that.to.have.lengthOf(2);
      expect(idpNode.mode_list)
        .to.be.an('array')
        .that.include(2, 3);

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

    it('After create identity IdP (idp1) that associated with this sid should receive identity notification callback', async function() {
      this.timeout(15000);
      const notificationCreateIdentity = await notificationCreateIdentityPromise.promise;
      //const IdP2notificationCreateIdentity = await notificationCreateIdentityPromise.promise;
      expect(notificationCreateIdentity).to.deep.include({
        node_id: 'idp1',
        type: 'identity_modification_notification',
        reference_group_code: referenceGroupCode,
        action: 'create_identity',
        actor_node_id: 'idp2',
      });
    });

    it('Special request status for create identity (mode 3) should be completed and closed', async function() {
      this.timeout(10000);
      //wait for API close request
      await wait(3000);
      const response = await commonApi.getRequest('idp2', { requestId });
      const responseBody = await response.json();
      expect(responseBody).to.deep.include({
        request_id: requestId,
        min_idp: 1,
        min_aal: 1,
        min_ial: 1.1,
        request_timeout: 86400,
        idp_id_list: ['idp1'],
        data_request_list: [],
        closed: true,
        timed_out: false,
        mode: 2,
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
    });

    it('After create identity this sid should be existing on platform ', async function() {
      const response = await identityApi.getIdentityInfo('idp2', {
        namespace,
        identifier,
      });
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      expect(responseBody.reference_group_code).to.equal(referenceGroupCode);
    });

    it('After create identity should get identity ial successfully', async function() {
      const response = await identityApi.getIdentityIal('idp2', {
        namespace,
        identifier,
      });
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      expect(responseBody.ial).to.equal(2.3);
    });

    after(function() {
      idp1EventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
      idp2EventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('identity_notification_callback');
      nodeCallbackEventEmitter.removeAllListeners('callback');
    });
  });
  after(function() {
    idp1EventEmitter.removeAllListeners('callback');
  });
});
