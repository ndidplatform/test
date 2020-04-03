import crypto from 'crypto';
import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import * as ndidApi from '../../../api/v5/ndid';
import * as commonApi from '../../../api/v5/common';
import * as identityApi from '../../../api/v5/identity';
import { idp1EventEmitter, idp2EventEmitter } from '../../../callback_server';
import { ndidAvailable, idp2Available } from '../..';
import { wait, generateReferenceId, createEventPromise } from '../../../utils';
import * as config from '../../../config';

describe('Create identity with same namespace and multiple identifier (mode 2) tests', function() {
  before(function() {
    if (!ndidAvailable) {
      this.test.parent.pending = true;
      this.skip();
    }
  });
  describe('Create identity at same idp with input identity_list multiple identity', function() {
    let alreadyAddedNamespace;
    const namespace = 'same_idp_allowed_2';
    const identifier = uuidv4();
    const identifier2 = uuidv4();
    const identifier3 = uuidv4();
    const keypair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    // const accessorPrivateKey = keypair.privateKey.export({
    //   type: 'pkcs8',
    //   format: 'pem',
    // });
    const accessorPublicKey = keypair.publicKey.export({
      type: 'spki',
      format: 'pem',
    });

    before(async function() {
      this.timeout(10000);

      //Check already added test_add_new_namespace namespace
      const response = await commonApi.getNamespaces('ndid1');
      const responseBody = await response.json();
      alreadyAddedNamespace = responseBody.find(
        (ns) => ns.namespace === 'same_idp_allowed_2'
      );
    });

    it('NDID should add new namespace (same_idp_allowed_2 and allowed_identifier_count_in_reference_group = 2) successfully', async function() {
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
        (ns) => ns.namespace === 'same_idp_allowed_2'
      );
      expect(namespace).to.deep.equal({
        namespace: 'same_idp_allowed_2',
        description:
          'register identity at same idp and allowed_identifier_count_in_reference_group = 2',
        active: true,
        allowed_identifier_count_in_reference_group: 2,
      });
    });

    describe('idp1 should create identity request (mode 2) with identity_list contains namespace count (3) greater than allowed namespace count (2) unsuccessfully', function() {
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
      it('idp1 should create identity request (mode 2) unsuccessfully', async function() {
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
          mode: 2,
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
        let idpNode = idpNodes.find((idpNode) => idpNode.node_id === 'idp1');
        expect(idpNode).to.be.undefined;

        response = await commonApi.getRelevantIdpNodesBySid('idp1', {
          namespace,
          identifier: identifier2,
        });

        idpNodes = await response.json();
        idpNode = idpNodes.find((idpNode) => idpNode.node_id === 'idp1');
        expect(idpNode).to.be.undefined;

        response = await commonApi.getRelevantIdpNodesBySid('idp1', {
          namespace,
          identifier: identifier3,
        });

        idpNodes = await response.json();
        idpNode = idpNodes.find((idpNode) => idpNode.node_id === 'idp1');
        expect(idpNode).to.be.undefined;
      });
      after(function() {
        idp1EventEmitter.removeAllListeners('callback');
      });
    });
    describe('idp1 should create identity request (mode 2) with identity_list namespace count (2) equal to allowed namespace count (2) successfully', async function() {
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
          mode: 2,
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
        let idpNode = idpNodes.find((idpNode) => idpNode.node_id === 'idp1');
        expect(idpNode).to.not.be.undefined;
        expect(idpNode.mode_list)
          .to.be.an('array')
          .that.include(2);

        response = await commonApi.getRelevantIdpNodesBySid('idp1', {
          namespace,
          identifier: identifier2,
        });

        idpNodes = await response.json();
        idpNode = idpNodes.find((idpNode) => idpNode.node_id === 'idp1');
        expect(idpNode).to.not.be.undefined;
        expect(idpNode.mode_list)
          .to.be.an('array')
          .that.include(2);
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
    const keypair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    // const accessorPrivateKey = keypair.privateKey.export({
    //   type: 'pkcs8',
    //   format: 'pem',
    // });
    const accessorPublicKey = keypair.publicKey.export({
      type: 'spki',
      format: 'pem',
    });

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
        (ns) => ns.namespace === 'different_idp_allowed_2'
      );
    });

    it('NDID should add new namespace (different_idp_allowed_2 and allowed_identifier_count_in_reference_group = 2) successfully', async function() {
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
        (ns) => ns.namespace === 'different_idp_allowed_2'
      );
      expect(namespace).to.deep.equal({
        namespace: 'different_idp_allowed_2',
        description:
          'register identity at different idp and allowed_identifier_count_in_reference_group = 2',
        active: true,
        allowed_identifier_count_in_reference_group: 2,
      });
    });

    describe('idp1 and idp2 should create identity request (mode 2) with identity_list contains namespace count (3) greater than allowed namespace count (2) unsuccessfully', function() {
      const referenceId = generateReferenceId();
      const createIdentityResultPromise = createEventPromise();

      const idp2ReferenceId = generateReferenceId();
      const idp2CreateIdentityResultPromise = createEventPromise();

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

        idp2EventEmitter.on('callback', function(callbackData) {
          if (
            callbackData.type === 'create_identity_result' &&
            callbackData.reference_id === idp2ReferenceId
          ) {
            idp2CreateIdentityResultPromise.resolve(callbackData);
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
          mode: 2,
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

        let response = await commonApi.getRelevantIdpNodesBySid('idp1', {
          namespace,
          identifier,
        });

        let idpNodes = await response.json();
        let idpNode = idpNodes.find((idpNode) => idpNode.node_id === 'idp1');
        expect(idpNode).to.not.be.undefined;
        expect(idpNode.mode_list)
          .to.be.an('array')
          .that.include(2);

        response = await commonApi.getRelevantIdpNodesBySid('idp1', {
          namespace,
          identifier: identifier2,
        });

        idpNodes = await response.json();
        idpNode = idpNodes.find((idpNode) => idpNode.node_id === 'idp1');
        expect(idpNode).to.not.be.undefined;
        expect(idpNode.mode_list)
          .to.be.an('array')
          .that.include(2);
      });

      it('idp2 should create identity request (mode 2) unsuccessfully (Exceed number of identifier allowed for namespace) ', async function() {
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
          mode: 2,
        });
        const responseBody = await response.json();
        expect(response.status).to.equal(202);
        expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;
        expect(responseBody.exist).to.equal(true);

        accessorId = responseBody.accessor_id;
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
        let idpNode = idpNodes.find((idpNode) => idpNode.node_id === 'idp1');
        expect(idpNode).to.be.undefined;
      });
      after(function() {
        idp1EventEmitter.removeAllListeners('callback');
        idp1EventEmitter.removeAllListeners('identity_notification_callback');
        idp2EventEmitter.removeAllListeners('callback');
      });
    });
    describe('idp1 and idp2 should create identity request (mode 2) with identity_list namespace count (2) equal to allowed namespace count (2) successfully', async function() {
      const identifier = uuidv4();
      const identifier2 = uuidv4();
      const referenceId = generateReferenceId();
      const createIdentityResultPromise = createEventPromise();
      const idp2ReferenceId = generateReferenceId();
      const idp2CreateIdentityResultPromise = createEventPromise();
      const errorCaseReferenceId = generateReferenceId();
      const errorCaseCreateIdentityResultPromise = createEventPromise();
      const notificationCreateIdentityPromise = createEventPromise();

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
          if (
            callbackData.type === 'create_identity_result' &&
            callbackData.reference_id === errorCaseReferenceId
          ) {
            errorCaseCreateIdentityResultPromise.resolve(callbackData);
          }
        });

        idp1EventEmitter.on('identity_notification_callback', function(
          callbackData
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
          ],
          accessor_type: 'RSA',
          accessor_public_key: accessorPublicKey,
          //accessor_id,
          ial: 2.3,
          mode: 2,
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
        let idpNode = idpNodes.find((idpNode) => idpNode.node_id === 'idp1');
        expect(idpNode).to.not.be.undefined;
        expect(idpNode.mode_list)
          .to.be.an('array')
          .that.include(2);
      });

      it('idp2 should create identity request (mode 2) successfully', async function() {
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
          mode: 2,
        });
        const responseBody = await response.json();
        expect(response.status).to.equal(202);
        expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;
        expect(responseBody.exist).to.equal(true);

        accessorId = responseBody.accessor_id;
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
        let idpNode = idpNodes.find((idpNode) => idpNode.node_id === 'idp1');
        expect(idpNode).to.not.be.undefined;
        expect(idpNode.mode_list)
          .to.be.an('array')
          .that.include(2);

        response = await commonApi.getRelevantIdpNodesBySid('idp2', {
          namespace,
          identifier: identifier2,
        });

        idpNodes = await response.json();
        idpNode = idpNodes.find((idpNode) => idpNode.node_id === 'idp2');
        expect(idpNode).to.not.be.undefined;
        expect(idpNode.mode_list)
          .to.be.an('array')
          .that.include(2);
      });

      it('After create identity idp1 that associated with this sid should receive identity notification callback', async function() {
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
        idp1EventEmitter.removeAllListeners('identity_notification_callback');
        idp2EventEmitter.removeAllListeners('callback');
      });
    });
  });
});
