import { expect } from 'chai';
import forge from 'node-forge';
import uuidv4 from 'uuid/v4';

import * as ndidApi from '../../../api/v4/ndid';
import * as commonApi from '../../../api/v4/common';
import * as identityApi from '../../../api/v4/identity';
import * as idpApi from '../../../api/v4/idp';
import { idp1EventEmitter, idp2EventEmitter } from '../../../callback_server';
import { ndidAvailable, idp2Available } from '../../';
import {
  wait,
  generateReferenceId,
  createEventPromise,
  hash,
  createResponseSignature,
} from '../../../utils';
import * as config from '../../../config';
import * as db from '../../../db';
import { eventEmitter as nodeCallbackEventEmitter } from '../../../callback_server/node';
import { receiveMessagequeueSendSuccessCallback } from '../_fragments/common';
import {
  verifyResponseSignature,
  getAndVerifyRequestMessagePaddedHashTest,
} from '../_fragments/request_flow_fragments/idp';

describe('Create identity with same namespace and multiple identifier (mode 3) tests', function() {
  before(function() {
    if (!ndidAvailable) {
      this.test.parent.pending = true;
      this.skip();
    }
  });
  describe('Create identity at same idp with input identity_list multiple identity tests', function() {
    let alreadyAddedNamespace;
    const namespace = 'same_idp_allowed_2';
    const identifier = uuidv4();
    const identifier2 = uuidv4();
    const identifier3 = uuidv4();
    const keypair = forge.pki.rsa.generateKeyPair(2048);
    //const accessorPrivateKey = forge.pki.privateKeyToPem(keypair.privateKey);
    const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);

    before(async function() {
      this.timeout(10000);

      //Check already added test_add_new_namespace namespace
      const response = await commonApi.getNamespaces('ndid1');
      const responseBody = await response.json();
      alreadyAddedNamespace = responseBody.find(
        ns => ns.namespace === 'same_idp_allowed_2',
      );
    });

    it('NDID should add new namespace (same_idp_allowed_2) successfully', async function() {
      this.timeout(10000);

      const response = await ndidApi.registerNamespace('ndid1', {
        namespace: 'same_idp_allowed_2',
        description:
          'register identity at same idp and allowed_identifier_count_in_reference_group = 2',
        allowed_identifier_count_in_reference_group: 2,
      });

      if (alreadyAddedNamespace) {
        const responseBody = await response.json();
        expect(response.status).to.equal(400);
        expect(responseBody.error.code).to.equal(25013);
      } else {
        expect(response.status).to.equal(201);
      }
      await wait(1000);
    });

    it('Namespace (same_idp_allowed_2) should be added successfully', async function() {
      this.timeout(10000);

      const response = await commonApi.getNamespaces('ndid1');
      const responseBody = await response.json();
      const namespace = responseBody.find(
        ns => ns.namespace === 'same_idp_allowed_2',
      );
      expect(namespace).to.deep.equal({
        namespace: 'same_idp_allowed_2',
        description:
          'register identity at same idp and allowed_identifier_count_in_reference_group = 2',
        active: true,
        allowed_identifier_count_in_reference_group: 2,
      });
    });

    describe('idp1 should create identity request (mode 3) with identity_list contains namespace count (3) greater than allowed namespace count (2) unsuccessfully', function() {
      const referenceId = generateReferenceId();
      const createIdentityResultPromise = createEventPromise();
      let accessorId;
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
      it('idp1 should create identity request (mode 3) unsuccessfully', async function() {
        this.timeout(10000);
        const response = await identityApi.createIdentity('idp1', {
          reference_id: referenceId,
          callback_url: config.IDP1_CALLBACK_URL,
          identity_list: [
            {
              namespace,
              identifier,
            },
            {
              namespace,
              identifier: identifier2,
            },
            {
              namespace,
              identifier: identifier3,
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
        expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;
        expect(responseBody.exist).to.equal(false);

        accessorId = responseBody.accessor_id;
      });

      it('Identity should be created unsuccessfully', async function() {
        this.timeout(15000);
        const createIdentityResult = await createIdentityResultPromise.promise;
        expect(createIdentityResult).to.deep.include({
          reference_id: referenceId,
          success: false,
          accessor_id: accessorId,
        });

        expect(createIdentityResult.error.code).to.equal(25068);

        let response = await commonApi.getRelevantIdpNodesBySid('idp1', {
          namespace,
          identifier,
        });

        let idpNodes = await response.json();
        let idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
        expect(idpNode).to.be.undefined;

        response = await commonApi.getRelevantIdpNodesBySid('idp1', {
          namespace,
          identifier: identifier2,
        });

        idpNodes = await response.json();
        idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
        expect(idpNode).to.be.undefined;

        response = await commonApi.getRelevantIdpNodesBySid('idp1', {
          namespace,
          identifier: identifier3,
        });

        idpNodes = await response.json();
        idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
        expect(idpNode).to.be.undefined;
      });
      after(function() {
        idp1EventEmitter.removeAllListeners('callback');
      });
    });
    describe('idp1 should create identity request (mode 3) with identity_list namespace count (2) equal to allowed namespace count (2) successfully', async function() {
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
      it('idp1 should create identity request (mode 2) successfully', async function() {
        this.timeout(10000);
        const response = await identityApi.createIdentity('idp1', {
          reference_id: referenceId,
          callback_url: config.IDP1_CALLBACK_URL,
          identity_list: [
            {
              namespace,
              identifier,
            },
            {
              namespace,
              identifier: identifier2,
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

        expect(createIdentityResult.reference_group_code).to.be.a('string').that
          .is.not.empty;

        referenceGroupCode = createIdentityResult.reference_group_code;

        let response = await commonApi.getRelevantIdpNodesBySid('idp1', {
          namespace,
          identifier,
        });

        let idpNodes = await response.json();
        let idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
        expect(idpNode).to.not.be.undefined;
        expect(idpNode.mode_list)
          .to.be.an('array')
          .that.include(2, 3);

        response = await commonApi.getRelevantIdpNodesBySid('idp1', {
          namespace,
          identifier: identifier2,
        });

        idpNodes = await response.json();
        idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
        expect(idpNode).to.not.be.undefined;
        expect(idpNode.mode_list)
          .to.be.an('array')
          .that.include(2, 3);
      });
      after(function() {
        idp1EventEmitter.removeAllListeners('callback');
      });
    });
  });

  describe('Create identity at different idp with input identity_list multiple identity tests', function() {
    let alreadyAddedNamespace;
    const namespace = 'different_idp_allowed_2';
    const identifier = uuidv4();
    const identifier2 = uuidv4();
    const identifier3 = uuidv4();
    const keypair = forge.pki.rsa.generateKeyPair(2048);
    const accessorPrivateKey = forge.pki.privateKeyToPem(keypair.privateKey);
    const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);

    before(async function() {
      this.timeout(10000);

      if (!idp2Available) {
        this.test.parent.pending = true;
        this.skip();
      }
      //Check already added test_add_new_namespace namespace
      const response = await commonApi.getNamespaces('ndid1');
      const responseBody = await response.json();
      alreadyAddedNamespace = responseBody.find(
        ns => ns.namespace === 'different_idp_allowed_2',
      );
    });

    it('NDID should add new namespace (different_idp_allowed_2) successfully', async function() {
      this.timeout(10000);

      const response = await ndidApi.registerNamespace('ndid1', {
        namespace: 'different_idp_allowed_2',
        description:
          'register identity at different idp and allowed_identifier_count_in_reference_group = 2',
        allowed_identifier_count_in_reference_group: 2,
      });

      if (alreadyAddedNamespace) {
        const responseBody = await response.json();
        expect(response.status).to.equal(400);
        expect(responseBody.error.code).to.equal(25013);
      } else {
        expect(response.status).to.equal(201);
      }
      await wait(1000);
    });

    it('Namespace (different_idp_allowed_2) should be added successfully', async function() {
      this.timeout(10000);

      const response = await commonApi.getNamespaces('ndid1');
      const responseBody = await response.json();
      const namespace = responseBody.find(
        ns => ns.namespace === 'different_idp_allowed_2',
      );
      expect(namespace).to.deep.equal({
        namespace: 'different_idp_allowed_2',
        description:
          'register identity at different idp and allowed_identifier_count_in_reference_group = 2',
        active: true,
        allowed_identifier_count_in_reference_group: 2,
      });
    });

    describe('idp1 and idp2 should create identity request (mode 3) with identity_list contains namespace count (3) greater than allowed namespace count (2) unsuccessfully', function() {
      const createIdentityRequestMessage =
        'Create identity consent request custom message ข้อความสำหรับขอสร้าง identity บนระบบ';
      const referenceId = generateReferenceId();
      const idpResponseReferenceId = generateReferenceId();
      const createIdentityResultPromise = createEventPromise();

      const idp2ReferenceId = generateReferenceId();
      const idp2CreateIdentityResultPromise = createEventPromise();
      const incomingRequestPromise = createEventPromise();
      const responseResultPromise = createEventPromise();
      const accessorEncryptPromise = createEventPromise();

      const mqSendSuccessIdp2ToIdp1CallbackPromise = createEventPromise();
      const mqSendSuccessIdp1ToIdp2CallbackPromise = createEventPromise();

      let accessorId;
      let referenceGroupCode;
      let requestId;
      let identityForResponse;
      let responseAccessorId;
      let requestMessagePaddedHash;

      before(function() {
        idp1EventEmitter.on('callback', function(callbackData) {
          if (
            callbackData.type === 'incoming_request' &&
            callbackData.request_id === requestId
          ) {
            incomingRequestPromise.resolve(callbackData);
          } else if (
            callbackData.type === 'response_result' &&
            callbackData.reference_id === idpResponseReferenceId
          ) {
            responseResultPromise.resolve(callbackData);
          }
          if (
            callbackData.type === 'create_identity_result' &&
            callbackData.reference_id === referenceId
          ) {
            createIdentityResultPromise.resolve(callbackData);
          }
        });

        idp1EventEmitter.on('accessor_encrypt_callback', function(
          callbackData,
        ) {
          if (callbackData.request_id === requestId) {
            accessorEncryptPromise.resolve(callbackData);
          }
        });

        idp2EventEmitter.on('callback', function(callbackData) {
          if (
            callbackData.type === 'create_identity_result' &&
            callbackData.reference_id === idp2ReferenceId
          ) {
            idp2CreateIdentityResultPromise.resolve(callbackData);
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
      it('idp1 should create identity request (mode 3) successfully', async function() {
        this.timeout(10000);
        const response = await identityApi.createIdentity('idp1', {
          reference_id: referenceId,
          callback_url: config.IDP1_CALLBACK_URL,
          identity_list: [
            {
              namespace,
              identifier,
            },
            {
              namespace,
              identifier: identifier2,
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

        expect(createIdentityResult.reference_group_code).to.be.a('string').that
          .is.not.empty;

        referenceGroupCode = createIdentityResult.reference_group_code;

        let response = await commonApi.getRelevantIdpNodesBySid('idp1', {
          namespace,
          identifier,
        });

        let idpNodes = await response.json();
        let idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
        expect(idpNode).to.not.be.undefined;
        expect(idpNode.mode_list)
          .to.be.an('array')
          .that.include(2, 3);

        response = await commonApi.getRelevantIdpNodesBySid('idp1', {
          namespace,
          identifier: identifier2,
        });

        idpNodes = await response.json();
        idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
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

      it('idp2 should create identity request (mode 3) unsuccessfully', async function() {
        this.timeout(10000);
        const response = await identityApi.createIdentity('idp2', {
          reference_id: idp2ReferenceId,
          callback_url: config.IDP2_CALLBACK_URL,
          identity_list: [
            {
              namespace,
              identifier,
            },
            {
              namespace,
              identifier: identifier3,
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
        expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;
        expect(responseBody.exist).to.equal(true);
        accessorId = responseBody.accessor_id;
        requestId = responseBody.request_id;
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
          reference_id: idpResponseReferenceId,
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
      //     idpReferenceId: idpResponseReferenceId,
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
          reference_id: idpResponseReferenceId,
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

      it('Identity should be created unsuccessfully', async function() {
        this.timeout(15000);
        const createIdentityResult = await idp2CreateIdentityResultPromise.promise;
        expect(createIdentityResult).to.deep.include({
          reference_id: idp2ReferenceId,
          success: false,
          accessor_id: accessorId,
        });

        expect(createIdentityResult.error.code).to.equal(25068);

        let response = await commonApi.getRelevantIdpNodesBySid('idp2', {
          namespace,
          identifier: identifier3,
        });

        let idpNodes = await response.json();
        let idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
        expect(idpNode).to.be.undefined;
      });
      after(function() {
        idp1EventEmitter.removeAllListeners('callback');
        idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
        idp1EventEmitter.removeAllListeners('identity_notification_callback');
        idp2EventEmitter.removeAllListeners('callback');
        nodeCallbackEventEmitter.removeAllListeners('callback');
      });
    });
    describe('idp1 and idp2 should create identity request (mode 3) with identity_list namespace count (2) equal to allowed namespace count (2) successfully', async function() {
      const createIdentityRequestMessage =
        'Create identity consent request custom message ข้อความสำหรับขอสร้าง identity บนระบบ';
      const keypair = forge.pki.rsa.generateKeyPair(2048);
      const accessorPrivateKey = forge.pki.privateKeyToPem(keypair.privateKey);
      const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);
      const identifier = uuidv4();
      const identifier2 = uuidv4();
      const referenceId = generateReferenceId();
      const idp2ReferenceId = generateReferenceId();
      const idpResponseReferenceId = generateReferenceId();

      const idp2CreateIdentityResultPromise = createEventPromise();
      const createIdentityResultPromise = createEventPromise();
      const incomingRequestPromise = createEventPromise();
      const responseResultPromise = createEventPromise();
      const accessorEncryptPromise = createEventPromise();

      const errorCaseReferenceId = generateReferenceId();
      const errorCaseCreateIdentityResultPromise = createEventPromise();
      const notificationCreateIdentityPromise = createEventPromise();

      let mqSendSuccessIdp2ToIdp1CallbackPromise = createEventPromise();
      let mqSendSuccessIdp1ToIdp2CallbackPromise = createEventPromise();

      let accessorId;
      let referenceGroupCode;
      let requestId;
      let identityForResponse;
      let responseAccessorId;
      let requestMessagePaddedHash;

      before(function() {
        idp1EventEmitter.on('callback', function(callbackData) {
          if (
            callbackData.type === 'incoming_request' &&
            callbackData.request_id === requestId
          ) {
            incomingRequestPromise.resolve(callbackData);
          } else if (
            callbackData.type === 'response_result' &&
            callbackData.reference_id === idpResponseReferenceId
          ) {
            responseResultPromise.resolve(callbackData);
          }
          if (
            callbackData.type === 'create_identity_result' &&
            callbackData.reference_id === referenceId
          ) {
            createIdentityResultPromise.resolve(callbackData);
          }
          if (
            callbackData.type === 'create_identity_result' &&
            callbackData.reference_id === errorCaseReferenceId
          ) {
            errorCaseCreateIdentityResultPromise.resolve(callbackData);
          }
        });

        idp1EventEmitter.on('accessor_encrypt_callback', function(
          callbackData,
        ) {
          if (callbackData.request_id === requestId) {
            accessorEncryptPromise.resolve(callbackData);
          }
        });

        idp1EventEmitter.on('identity_notification_callback', function(
          callbackData,
        ) {
          if (
            callbackData.type === 'identity_modification_notification' &&
            callbackData.action === 'create_identity'
          ) {
            notificationCreateIdentityPromise.resolve(callbackData);
          }
        });

        idp2EventEmitter.on('callback', function(callbackData) {
          if (
            callbackData.type === 'create_identity_result' &&
            callbackData.reference_id === idp2ReferenceId
          ) {
            idp2CreateIdentityResultPromise.resolve(callbackData);
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
      it('idp1 should create identity request (mode 3) successfully', async function() {
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

        expect(createIdentityResult.reference_group_code).to.be.a('string').that
          .is.not.empty;

        referenceGroupCode = createIdentityResult.reference_group_code;

        let response = await commonApi.getRelevantIdpNodesBySid('idp1', {
          namespace,
          identifier,
        });

        let idpNodes = await response.json();
        let idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
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

      it('idp2 should create identity request (mode 3) successfully', async function() {
        this.timeout(10000);
        const response = await identityApi.createIdentity('idp2', {
          reference_id: idp2ReferenceId,
          callback_url: config.IDP2_CALLBACK_URL,
          identity_list: [
            {
              namespace,
              identifier,
            },
            {
              namespace,
              identifier: identifier2,
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
        expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;
        expect(responseBody.exist).to.equal(true);

        accessorId = responseBody.accessor_id;
        requestId = responseBody.request_id;
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
          reference_id: idpResponseReferenceId,
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
      //       identity.namespace === namespace &&
      //       identity.identifier === identifier,
      //   );
      //   let accessorPublicKey = identity.accessors[0].accessorPublicKey;

      //   let testResult = await idpReceiveAccessorEncryptCallbackTest({
      //     callIdpApiAtNodeId: 'idp1',
      //     accessorEncryptPromise,
      //     accessorId: responseAccessorId,
      //     requestId,
      //     idpReferenceId: idpResponseReferenceId,
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
          reference_id: idpResponseReferenceId,
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
        const createIdentityResult = await idp2CreateIdentityResultPromise.promise;
        expect(createIdentityResult).to.deep.include({
          reference_id: idp2ReferenceId,
          success: true,
        });

        expect(createIdentityResult.reference_group_code).to.be.a('string').that
          .is.not.empty;

        referenceGroupCode = createIdentityResult.reference_group_code;

        let response = await commonApi.getRelevantIdpNodesBySid('idp1', {
          namespace,
          identifier,
        });

        let idpNodes = await response.json();
        let idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
        expect(idpNode).to.not.be.undefined;
        expect(idpNode.mode_list)
          .to.be.an('array')
          .that.include(2, 3);

        response = await commonApi.getRelevantIdpNodesBySid('idp2', {
          namespace,
          identifier: identifier2,
        });

        idpNodes = await response.json();
        idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp2');
        expect(idpNode).to.not.be.undefined;
        expect(idpNode.mode_list)
          .to.be.an('array')
          .that.include(2, 3);
      });

      it('After create identity IdP (idp1) that associated with this sid should receive identity notification callback', async function() {
        this.timeout(15000);
        const notificationCreateIdentity = await notificationCreateIdentityPromise.promise;
        expect(notificationCreateIdentity).to.deep.include({
          node_id: 'idp1',
          type: 'identity_modification_notification',
          reference_group_code: referenceGroupCode,
          action: 'create_identity',
          actor_node_id: 'idp2',
        });
      });

      after(function() {
        idp1EventEmitter.removeAllListeners('callback');
        idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
        idp1EventEmitter.removeAllListeners('identity_notification_callback');
        idp2EventEmitter.removeAllListeners('callback');
        nodeCallbackEventEmitter.removeAllListeners('callback');
      });
    });
  });
});
