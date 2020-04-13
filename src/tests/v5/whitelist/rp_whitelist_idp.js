import crypto from 'crypto';
import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import * as identityApi from '../../../api/v5/identity';
import * as commonApi from '../../../api/v5/common';
import * as rpApi from '../../../api/v5/rp';
import {
  idp3EventEmitter,
  idp1EventEmitter,
  rp2EventEmitter,
  as1EventEmitter,
  idp2EventEmitter,
} from '../../../callback_server';
import * as db from '../../../db';
import { createEventPromise, generateReferenceId } from '../../../utils';
import * as config from '../../../config';

import * as ndidApi from '../../../api/v5/ndid';
import { wait, createSignature, createResponseSignature } from '../../../utils';
import { ndidAvailable, idp3Available, rp2Available } from '../..';
import { mode1DataRequestFlowTest } from '../_fragments/data_request_mode_1_flow';
import { mode2And3DataRequestFlowTest } from '../_fragments/data_request_mode_2_and_3_flow';

describe('RP whitelist IdP tests', function () {
  let namespaceNodeWhiteList;
  let identifierNodeWhiteList;

  let namespaceNodeWhiteListAndNotWhitelist;
  let identifierNodeWhiteListAndNotWhitelist;

  before(function () {
    if (!ndidAvailable || !rp2Available || !idp3Available) {
      this.skip();
    }

    if (db.idp1Identities[0] == null) {
      throw new Error('No created identity to use');
    }
  });

  describe('IdP (idp3) create identity (mode 2) (without providing accessor_id) as 1st IdP', function () {
    const namespace = 'citizen_id';
    const identifier = uuidv4();
    const keypair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const accessorPrivateKey = keypair.privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    });
    const accessorPublicKey = keypair.publicKey.export({
      type: 'spki',
      format: 'pem',
    });

    const referenceId = generateReferenceId();

    const createIdentityResultPromise = createEventPromise();

    let accessorId;
    let referenceGroupCode;

    before(function () {
      idp3EventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'create_identity_result' &&
          callbackData.reference_id === referenceId
        ) {
          createIdentityResultPromise.resolve(callbackData);
        }
      });
    });

    it('Should create identity request (mode 2) successfully', async function () {
      this.timeout(10000);
      const response = await identityApi.createIdentity('idp3', {
        reference_id: referenceId,
        callback_url: config.IDP3_CALLBACK_URL,
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

    it('Identity should be created successfully', async function () {
      this.timeout(15000);
      const createIdentityResult = await createIdentityResultPromise.promise;
      expect(createIdentityResult).to.deep.include({
        reference_id: referenceId,
        success: true,
      });

      expect(createIdentityResult.reference_group_code).to.be.a('string').that
        .is.not.empty;

      referenceGroupCode = createIdentityResult.reference_group_code;

      const response = await commonApi.getRelevantIdpNodesBySid('idp3', {
        namespace,
        identifier,
      });
      const idpNodes = await response.json();
      const idpNode = idpNodes.find((idpNode) => idpNode.node_id === 'idp3');
      expect(idpNode).to.not.be.undefined;
      expect(idpNode.mode_list).to.be.an('array').that.include(2);

      db.idp3Identities.push({
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

    it('After create identity this sid should be existing on platform ', async function () {
      const response = await identityApi.getIdentityInfo('idp3', {
        namespace,
        identifier,
      });
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      expect(responseBody.reference_group_code).to.equal(referenceGroupCode);
    });

    it('After create identity should get identity ial successfully', async function () {
      const response = await identityApi.getIdentityIal('idp3', {
        namespace,
        identifier,
      });
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      expect(responseBody.ial).to.equal(2.3);
    });

    it('Should get relevant IdP nodes by sid successfully', async function () {
      this.timeout(30000);

      const response = await commonApi.getRelevantIdpNodesBySid('idp3', {
        namespace,
        identifier,
      });
      const responseBody = await response.json();
      expect(responseBody).to.be.an('array').that.to.have.lengthOf(1);
      const idp = responseBody.find((node) => node.node_id === 'idp3');
      expect(idp.ial).to.equal(2.3);

      namespaceNodeWhiteList = namespace;
      identifierNodeWhiteList = identifier;

      await wait(3000); //wait for data propagate
    });

    after(function () {
      idp3EventEmitter.removeAllListeners('callback');
    });
  });

  describe('IdP (idp3) create identity (mode 3) (without providing accessor_id) as 1st IdP', function () {
    const namespace = 'citizen_id';
    const identifier = uuidv4();
    const keypair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const accessorPrivateKey = keypair.privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    });
    const accessorPublicKey = keypair.publicKey.export({
      type: 'spki',
      format: 'pem',
    });

    const referenceId = generateReferenceId();

    const createIdentityResultPromise = createEventPromise();

    let accessorId;
    let referenceGroupCode;

    before(function () {
      idp3EventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'create_identity_result' &&
          callbackData.reference_id === referenceId
        ) {
          createIdentityResultPromise.resolve(callbackData);
        }
      });
    });

    it('Should create identity request (mode 3) successfully', async function () {
      this.timeout(10000);
      const response = await identityApi.createIdentity('idp3', {
        reference_id: referenceId,
        callback_url: config.IDP3_CALLBACK_URL,
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
      expect(responseBody).to.not.include.keys('request_id');
      expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.exist).to.equal(false);
      accessorId = responseBody.accessor_id;
    });

    it('Identity should be created successfully', async function () {
      this.timeout(15000);
      const createIdentityResult = await createIdentityResultPromise.promise;
      expect(createIdentityResult).to.deep.include({
        reference_id: referenceId,
        success: true,
      });

      expect(createIdentityResult.reference_group_code).to.be.a('string').that
        .is.not.empty;

      referenceGroupCode = createIdentityResult.reference_group_code;

      const response = await commonApi.getRelevantIdpNodesBySid('idp3', {
        namespace,
        identifier,
      });
      const idpNodes = await response.json();
      const idpNode = idpNodes.find((idpNode) => idpNode.node_id === 'idp3');
      expect(idpNode).to.not.be.undefined;
      expect(idpNode.mode_list).to.be.an('array').that.include(2, 3);

      db.idp3Identities.push({
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

    it('After create identity this sid should be existing on platform ', async function () {
      const response = await identityApi.getIdentityInfo('idp3', {
        namespace,
        identifier,
      });
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      expect(responseBody.reference_group_code).to.equal(referenceGroupCode);
    });

    it('After create identity should get identity ial successfully', async function () {
      const response = await identityApi.getIdentityIal('idp3', {
        namespace,
        identifier,
      });
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      expect(responseBody.ial).to.equal(2.3);
    });

    it('Should get relevant IdP nodes by sid successfully', async function () {
      this.timeout(30000);

      const response = await commonApi.getRelevantIdpNodesBySid('idp3', {
        namespace,
        identifier,
      });
      const responseBody = await response.json();
      expect(responseBody).to.be.an('array').that.to.have.lengthOf(1);
      const idp = responseBody.find((node) => node.node_id === 'idp3');
      expect(idp.ial).to.equal(2.3);

      namespaceNodeWhiteList = namespace;
      identifierNodeWhiteList = identifier;

      await wait(3000); //wait for data propagate
    });

    after(function () {
      idp3EventEmitter.removeAllListeners('callback');
    });
  });

  describe('IdP (idp3) create identity (mode 2) (without providing accessor_id) as 2nd IdP (already onboard at idp2)', function () {
    let namespace;
    let identifier;

    const keypair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const accessorPrivateKey = keypair.privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    });
    const accessorPublicKey = keypair.publicKey.export({
      type: 'spki',
      format: 'pem',
    });

    const referenceId = generateReferenceId();

    const createIdentityResultPromise = createEventPromise();
    const notificationCreateIdentityPromise = createEventPromise();

    let accessorId;
    let referenceGroupCode;

    db.createIdentityReferences.push({
      referenceId,
      accessorPrivateKey,
    });

    before(function () {
      const identity = db.idp2Identities.find(
        (identity) => identity.mode === 2,
      );
      namespace = identity.namespace;
      identifier = identity.identifier;
      referenceGroupCode = identity.referenceGroupCode;

      idp2EventEmitter.on('identity_notification_callback', function (
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

      idp3EventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'create_identity_result' &&
          callbackData.reference_id === referenceId
        ) {
          createIdentityResultPromise.resolve(callbackData);
        }
      });
    });

    it('Should create identity request (mode 2) successfully', async function () {
      this.timeout(10000);
      const response = await identityApi.createIdentity('idp3', {
        reference_id: referenceId,
        callback_url: config.IDP3_CALLBACK_URL,
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
      expect(responseBody.exist).to.equal(true);
      accessorId = responseBody.accessor_id;
    });

    it('Identity should be created successfully', async function () {
      this.timeout(15000);
      const createIdentityResult = await createIdentityResultPromise.promise;
      expect(createIdentityResult).to.deep.include({
        reference_id: referenceId,
        success: true,
      });

      expect(createIdentityResult.reference_group_code).to.be.a('string').that
        .is.not.empty;

      referenceGroupCode = createIdentityResult.reference_group_code;

      const response = await commonApi.getRelevantIdpNodesBySid('idp3', {
        namespace,
        identifier,
      });
      const idpNodes = await response.json();
      const idpNode = idpNodes.find((idpNode) => idpNode.node_id === 'idp3');
      expect(idpNode).to.not.be.undefined;
      expect(idpNode.mode_list).to.be.an('array').that.include(2);

      db.idp3Identities.push({
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

    it('After create identity IdP (idp2) that associated with this sid should receive identity notification callback', async function () {
      this.timeout(15000);
      const notificationCreateIdentity = await notificationCreateIdentityPromise.promise;
      //const IdP2notificationCreateIdentity = await notificationCreateIdentityPromise.promise;
      expect(notificationCreateIdentity).to.deep.include({
        node_id: 'idp2',
        type: 'identity_modification_notification',
        reference_group_code: referenceGroupCode,
        action: 'create_identity',
        actor_node_id: 'idp3',
      });
    });

    it('After create identity this sid should be existing on platform ', async function () {
      const response = await identityApi.getIdentityInfo('idp3', {
        namespace,
        identifier,
      });
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      expect(responseBody.reference_group_code).to.equal(referenceGroupCode);
    });

    it('After create identity should get identity ial successfully', async function () {
      this.timeout(10000);
      const response = await identityApi.getIdentityIal('idp3', {
        namespace,
        identifier,
      });
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      expect(responseBody.ial).to.equal(2.3);

      namespaceNodeWhiteListAndNotWhitelist = namespace;
      identifierNodeWhiteListAndNotWhitelist = identifier;

      await wait(3000); // wait for data propagate
    });
    after(function () {
      idp3EventEmitter.removeAllListeners('callback');
      idp2EventEmitter.removeAllListeners('identity_notification_callback');
    });
  });

  describe('RP whitelist IdP test', function () {
    it('NDID should update node rp2 to whitelist idp3 successfully', async function () {
      this.timeout(20000);
      const responseUpdateNode = await ndidApi.updateNode('ndid1', {
        node_id: 'rp2',
        node_id_whitelist_active: true,
        node_id_whitelist: ['idp3'],
      });
      expect(responseUpdateNode.status).to.equal(204);
      await wait(3000);

      const responseGetNodeInfo = await commonApi.getNodeInfo('rp2');
      const responseBody = await responseGetNodeInfo.json();
      expect(responseBody.role).to.equal('RP');
      expect(responseBody.node_id_whitelist_active).to.be.true;
      expect(responseBody.node_id_whitelist[0]).to.equal('idp3');
    });

    it('rp2 should got only nodes that whitelist when get all idp', async function () {
      this.timeout(10000);
      let response = await commonApi.getIdP('rp2');
      expect(response.status).to.equal(200);

      let responseBody = await response.json();
      expect(responseBody).to.be.an('array');
      expect(responseBody).to.have.length(1);
      expect(responseBody[0].node_id).to.equal('idp3');
    });

    it('rp2 should got only nodes that whitelist when get relevant IdP nodes by sid (sid is not relevant with idp3 that rp2 whitelist)', async function () {
      this.timeout(30000);
      const identity = db.idp1Identities.find(
        //SID from idp1
        (identity) => identity.mode === 3,
      );
      let namespace = identity.namespace;
      let identifier = identity.identifier;

      let response = await commonApi.getRelevantIdpNodesBySid('rp2', {
        namespace,
        identifier,
      });

      const idpNodes = await response.json();
      expect(idpNodes).to.be.an('array').to.be.empty;
    });

    it('rp2 should got only nodes that whitelist when get relevant IdP nodes by sid (sid relevant with idp3 that rp2 whitelist and sid relevant with other idp)', async function () {
      this.timeout(10000);

      let response = await commonApi.getRelevantIdpNodesBySid('rp2', {
        namespace: namespaceNodeWhiteListAndNotWhitelist,
        identifier: identifierNodeWhiteListAndNotWhitelist,
      });
      const idpNodes = await response.json();
      expect(idpNodes).to.be.an('array').to.have.length(1);
      expect(idpNodes[0].node_id).to.equal('idp3');
    });

    it('rp2 should got only nodes that whitelist when get relevant IdP nodes by sid (sid relevant with idp3 that rp2 whitelist)', async function () {
      this.timeout(10000);

      let response = await commonApi.getRelevantIdpNodesBySid('rp2', {
        namespace: namespaceNodeWhiteList,
        identifier: identifierNodeWhiteList,
      });
      const idpNodes = await response.json();
      expect(idpNodes).to.be.an('array').to.have.length(1);
      expect(idpNodes[0].node_id).to.equal('idp3');
    });
  });

  describe('RP create request to IdP that is not whitelist (idp1) test', function () {
    let namespace;
    let identifier;

    describe('RP create request (mode 1) to IdP that is not whitelist (idp1) test', function () {
      let createRequestParams;

      const rpReferenceId = generateReferenceId();

      before(function () {
        namespace = 'citizen_id';
        identifier = '1234567890123';

        createRequestParams = {
          reference_id: rpReferenceId,
          callback_url: config.RP_CALLBACK_URL,
          mode: 1,
          namespace,
          identifier,
          idp_id_list: ['idp1'],
          data_request_list: [
            {
              service_id: 'bank_statement',
              as_id_list: ['as1'],
              min_as: 1,
              request_params: JSON.stringify({
                format: 'pdf',
              }),
            },
          ],
          request_message: 'Test request message (data request) (mode 2)',
          min_ial: 1.1,
          min_aal: 1,
          min_idp: 1,
          request_timeout: 86400,
          bypass_identity_check: false,
        };
      });

      it('RP should create a request successfully', async function () {
        this.timeout(10000);
        const response = await rpApi.createRequest('rp2', createRequestParams);
        expect(response.status).to.equal(400);
        const responseBody = await response.json();
        expect(responseBody.error.code).to.equal(20079);
      });
    });

    describe('RP create request (mode 1) to IdP that is not whitelist (idp1) and IdP that is whitelist (idp3) test', function () {
      let createRequestParams;

      const rpReferenceId = generateReferenceId();

      before(function () {
        namespace = 'citizen_id';
        identifier = '1234567890123';

        createRequestParams = {
          reference_id: rpReferenceId,
          callback_url: config.RP_CALLBACK_URL,
          mode: 1,
          namespace,
          identifier,
          idp_id_list: ['idp1', 'idp3'],
          data_request_list: [
            {
              service_id: 'bank_statement',
              as_id_list: ['as1'],
              min_as: 1,
              request_params: JSON.stringify({
                format: 'pdf',
              }),
            },
          ],
          request_message: 'Test request message (data request) (mode 2)',
          min_ial: 1.1,
          min_aal: 1,
          min_idp: 1,
          request_timeout: 86400,
          bypass_identity_check: false,
        };
      });

      it('RP should create a request successfully', async function () {
        this.timeout(10000);
        const response = await rpApi.createRequest('rp2', createRequestParams);
        expect(response.status).to.equal(400);
        const responseBody = await response.json();
        expect(responseBody.error.code).to.equal(20079);
      });
    });

    describe('RP create request (not specific idp mode 3) to IdP that is not whitelist (idp1) test', function () {
      let createRequestParams;

      const rpReferenceId = generateReferenceId();

      before(function () {
        const identity = db.idp1Identities.find(
          (identity) => identity.mode === 3,
        );

        namespace = identity.namespace;
        identifier = identity.identifier;

        createRequestParams = {
          reference_id: rpReferenceId,
          callback_url: config.RP_CALLBACK_URL,
          mode: 3,
          namespace,
          identifier,
          idp_id_list: [],
          data_request_list: [
            {
              service_id: 'bank_statement',
              as_id_list: ['as1'],
              min_as: 1,
              request_params: JSON.stringify({
                format: 'pdf',
              }),
            },
          ],
          request_message: 'Test request message (data request) (mode 2)',
          min_ial: 1.1,
          min_aal: 1,
          min_idp: 1,
          request_timeout: 86400,
          bypass_identity_check: false,
        };
      });

      it('RP should create a request successfully', async function () {
        this.timeout(10000);
        const response = await rpApi.createRequest('rp2', createRequestParams);
        expect(response.status).to.equal(400);
        const responseBody = await response.json();
        expect(responseBody.error.code).to.equal(20005);
      });
    });

    describe('RP create request (specific idp mode 3) to IdP that is not whitelist (idp1) test', function () {
      let createRequestParams;

      const rpReferenceId = generateReferenceId();

      before(function () {
        const identity = db.idp1Identities.find(
          (identity) => identity.mode === 3,
        );

        namespace = identity.namespace;
        identifier = identity.identifier;

        createRequestParams = {
          reference_id: rpReferenceId,
          callback_url: config.RP_CALLBACK_URL,
          mode: 3,
          namespace,
          identifier,
          idp_id_list: ['idp1'],
          data_request_list: [
            {
              service_id: 'bank_statement',
              as_id_list: ['as1'],
              min_as: 1,
              request_params: JSON.stringify({
                format: 'pdf',
              }),
            },
          ],
          request_message: 'Test request message (data request) (mode 2)',
          min_ial: 1.1,
          min_aal: 1,
          min_idp: 1,
          request_timeout: 86400,
          bypass_identity_check: false,
        };
      });

      it('RP should create a request successfully', async function () {
        this.timeout(10000);
        const response = await rpApi.createRequest('rp2', createRequestParams);
        expect(response.status).to.equal(400);
        const responseBody = await response.json();
        expect(responseBody.error.code).to.equal(20079);
      });
    });

    describe('RP create request (specific idp mode 2) to IdP that is not whitelist (idp1) and whitelist (idp3) test', function () {
      let createRequestParams;

      const rpReferenceId = generateReferenceId();

      before(function () {
        namespace = namespaceNodeWhiteListAndNotWhitelist;
        identifier = identifierNodeWhiteListAndNotWhitelist;

        createRequestParams = {
          reference_id: rpReferenceId,
          callback_url: config.RP_CALLBACK_URL,
          mode: 2,
          namespace,
          identifier,
          idp_id_list: ['idp1', 'idp3'],
          data_request_list: [
            {
              service_id: 'bank_statement',
              as_id_list: ['as1'],
              min_as: 1,
              request_params: JSON.stringify({
                format: 'pdf',
              }),
            },
          ],
          request_message: 'Test request message (data request) (mode 2)',
          min_ial: 1.1,
          min_aal: 1,
          min_idp: 1,
          request_timeout: 86400,
          bypass_identity_check: false,
        };
      });

      it('RP should create a request successfully', async function () {
        this.timeout(10000);
        const response = await rpApi.createRequest('rp2', createRequestParams);
        expect(response.status).to.equal(400);
        const responseBody = await response.json();
        expect(responseBody.error.code).to.equal(20079);
      });
    });

    describe('RP create request (not specific idp mode 2) to IdP that sid relevant with not whitelist (idp1) and whitelist (idp3) but not enough IdP test', function () {
      let createRequestParams;

      const rpReferenceId = generateReferenceId();

      before(function () {
        namespace = namespaceNodeWhiteListAndNotWhitelist;
        identifier = identifierNodeWhiteListAndNotWhitelist;

        createRequestParams = {
          reference_id: rpReferenceId,
          callback_url: config.RP_CALLBACK_URL,
          mode: 2,
          namespace,
          identifier,
          idp_id_list: [],
          data_request_list: [
            {
              service_id: 'bank_statement',
              as_id_list: ['as1'],
              min_as: 1,
              request_params: JSON.stringify({
                format: 'pdf',
              }),
            },
          ],
          request_message: 'Test request message (data request) (mode 2)',
          min_ial: 1.1,
          min_aal: 1,
          min_idp: 2,
          request_timeout: 86400,
          bypass_identity_check: false,
        };
      });

      it('RP should create a request successfully', async function () {
        this.timeout(10000);
        const response = await rpApi.createRequest('rp2', createRequestParams);
        expect(response.status).to.equal(400);
        const responseBody = await response.json();
        expect(responseBody.error.code).to.equal(20006);
      });
    });

    describe('RP create request (specific idp and bypass_identity_check = true mode 2) to IdP that is not whitelist (idp1) test', function () {
      let createRequestParams;

      const rpReferenceId = generateReferenceId();

      before(function () {
        namespace = namespaceNodeWhiteListAndNotWhitelist;
        identifier = identifierNodeWhiteListAndNotWhitelist;

        createRequestParams = {
          reference_id: rpReferenceId,
          callback_url: config.RP_CALLBACK_URL,
          mode: 2,
          namespace,
          identifier,
          idp_id_list: ['idp1', 'idp3'],
          data_request_list: [
            {
              service_id: 'bank_statement',
              as_id_list: ['as1'],
              min_as: 1,
              request_params: JSON.stringify({
                format: 'pdf',
              }),
            },
          ],
          request_message: 'Test request message (data request) (mode 2)',
          min_ial: 1.1,
          min_aal: 1,
          min_idp: 1,
          request_timeout: 86400,
          bypass_identity_check: true,
        };
      });

      it('RP should create a request successfully', async function () {
        this.timeout(10000);
        const response = await rpApi.createRequest('rp2', createRequestParams);
        expect(response.status).to.equal(400);
        const responseBody = await response.json();
        expect(responseBody.error.code).to.equal(20079);
      });
    });
  });

  describe('RP create request to IdP that is whitelist (idp3) test', function () {
    describe('RP create request (not specific idp mode 2) to IdP that sid relevant with not whitelist (idp1) and whitelist (idp3) test', function () {
      let createRequestParams;

      const rpReferenceId = generateReferenceId();

      before(function () {
        let namespace = namespaceNodeWhiteListAndNotWhitelist;
        let identifier = identifierNodeWhiteListAndNotWhitelist;

        createRequestParams = {
          reference_id: rpReferenceId,
          callback_url: config.RP_CALLBACK_URL,
          mode: 2,
          namespace,
          identifier,
          idp_id_list: [],
          data_request_list: [
            {
              service_id: 'bank_statement',
              as_id_list: ['as1'],
              min_as: 1,
              request_params: JSON.stringify({
                format: 'pdf',
              }),
            },
          ],
          request_message: 'Test request message (data request) (mode 2)',
          min_ial: 1.1,
          min_aal: 1,
          min_idp: 1,
          request_timeout: 86400,
          bypass_identity_check: false,
        };
      });

      it('RP should create a request successfully', async function () {
        this.timeout(10000);
        const response = await rpApi.createRequest('rp2', createRequestParams);
        expect(response.status).to.equal(202);
        const responseBody = await response.json();
        expect(response.status).to.equal(202);
        expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
        expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;
      });
    });

    describe('RP create request (mode 1) to IdP that is whitelist (idp3) test', function () {
      const data = JSON.stringify({
        test: 'test',
        withEscapedChar: 'test|fff||ss\\|NN\\\\|',
        arr: [1, 2, 3],
      });

      mode1DataRequestFlowTest({
        callRpApiAtNodeId: 'rp2',
        rpEventEmitter: rp2EventEmitter,
        createRequestParams: {
          reference_id: generateReferenceId(),
          callback_url: config.RP2_CALLBACK_URL,
          mode: 1,
          namespace: 'citizen_id',
          identifier: '1234567890123',
          idp_id_list: ['idp3'],
          data_request_list: [
            {
              service_id: 'bank_statement',
              as_id_list: ['as1'],
              min_as: 1,
              request_params: JSON.stringify({
                format: 'pdf',
              }),
            },
          ],
          request_message:
            'Test request message (mode 1) ทดสอบภาษาไทย should\\|be|able\\\\|to|send\\\\\\|this',
          min_ial: 1.1,
          min_aal: 1,
          min_idp: 1,
          request_timeout: 86400,
        },
        idpParams: [
          {
            callIdpApiAtNodeId: 'idp3',
            idpEventEmitter: idp3EventEmitter,
            idpResponseParams: {
              reference_id: generateReferenceId(),
              callback_url: config.IDP3_CALLBACK_URL,
              ial: 2.3,
              aal: 3,
              status: 'accept',
              createResponseSignature: (privatekey, request_message) => {
                const signature = createSignature(privatekey, request_message);
                return signature;
              },
            },
          },
        ],
        asParams: [
          {
            callAsApiAtNodeId: 'as1',
            asEventEmitter: as1EventEmitter,
            asResponseParams: [
              {
                reference_id: generateReferenceId(),
                callback_url: config.AS1_CALLBACK_URL,
                service_id: 'bank_statement',
                data,
              },
            ],
          },
        ],
      });
    });

    describe('RP create request (mode 2) to IdP that is whitelist (idp3) test', function () {
      const data = JSON.stringify({
        test: 'test',
        withEscapedChar: 'test|fff||ss\\|NN\\\\|',
        arr: [1, 2, 3],
      });

      mode2And3DataRequestFlowTest({
        callRpApiAtNodeId: 'rp2',
        rpEventEmitter: rp2EventEmitter,
        getIdentityForRequest: () => {
          return db.idp3Identities.find((identity) => identity.mode === 2);
        },
        createRequestParams: {
          reference_id: generateReferenceId(),
          callback_url: config.RP2_CALLBACK_URL,
          mode: 2,
          idp_id_list: [],
          data_request_list: [
            {
              service_id: 'bank_statement',
              as_id_list: ['as1'],
              min_as: 1,
              request_params: JSON.stringify({
                format: 'pdf',
              }),
            },
          ],
          request_message:
            'Test request message (mode 2) ทดสอบภาษาไทย should\\|be|able\\\\|to|send\\\\\\|this',
          min_ial: 1.1,
          min_aal: 1,
          min_idp: 1,
          request_timeout: 86400,
          bypass_identity_check: false,
        },
        idpParams: [
          {
            callIdpApiAtNodeId: 'idp3',
            idpEventEmitter: idp3EventEmitter,
            getAccessorForResponse: ({
              namespace,
              identifier,
              referenceGroupCode,
            }) => {
              const identity = db.idp3Identities.find(
                (identity) =>
                  (identity.namespace === namespace &&
                    identity.identifier === identifier) ||
                  identity.referenceGroupCode === referenceGroupCode,
              );
              return identity.accessors[0];
            },
            idpResponseParams: {
              reference_id: generateReferenceId(),
              callback_url: config.IDP3_CALLBACK_URL,
              ial: 2.3,
              aal: 3,
              status: 'accept',
              createResponseSignature: (privatekey, request_message) => {
                const signature = createResponseSignature(
                  privatekey,
                  request_message,
                );
                return signature;
              },
            },
          },
        ],
        asParams: [
          {
            callAsApiAtNodeId: 'as1',
            asEventEmitter: as1EventEmitter,
            asResponseParams: [
              {
                reference_id: generateReferenceId(),
                callback_url: config.AS1_CALLBACK_URL,
                service_id: 'bank_statement',
                data,
              },
            ],
          },
        ],
      });
    });

    describe('RP create request (mode 3) to IdP that is whitelist (idp3) test', function () {
      const data = JSON.stringify({
        test: 'test',
        withEscapedChar: 'test|fff||ss\\|NN\\\\|',
        arr: [1, 2, 3],
      });

      mode2And3DataRequestFlowTest({
        callRpApiAtNodeId: 'rp2',
        rpEventEmitter: rp2EventEmitter,
        getIdentityForRequest: () => {
          return db.idp3Identities.find((identity) => identity.mode === 3);
        },
        createRequestParams: {
          reference_id: generateReferenceId(),
          callback_url: config.RP2_CALLBACK_URL,
          mode: 3,
          idp_id_list: [],
          data_request_list: [
            {
              service_id: 'bank_statement',
              as_id_list: ['as1'],
              min_as: 1,
              request_params: JSON.stringify({
                format: 'pdf',
              }),
            },
          ],
          request_message:
            'Test request message (mode 3) ทดสอบภาษาไทย should\\|be|able\\\\|to|send\\\\\\|this',
          min_ial: 1.1,
          min_aal: 1,
          min_idp: 1,
          request_timeout: 86400,
          bypass_identity_check: false,
        },
        idpParams: [
          {
            callIdpApiAtNodeId: 'idp3',
            idpEventEmitter: idp3EventEmitter,
            getAccessorForResponse: ({
              namespace,
              identifier,
              referenceGroupCode,
            }) => {
              const identity = db.idp3Identities.find(
                (identity) =>
                  (identity.namespace === namespace &&
                    identity.identifier === identifier) ||
                  identity.referenceGroupCode === referenceGroupCode,
              );
              return identity.accessors[0];
            },
            idpResponseParams: {
              reference_id: generateReferenceId(),
              callback_url: config.IDP3_CALLBACK_URL,
              ial: 2.3,
              aal: 3,
              status: 'accept',
              createResponseSignature: (privatekey, request_message) => {
                const signature = createResponseSignature(
                  privatekey,
                  request_message,
                );
                return signature;
              },
            },
          },
        ],
        asParams: [
          {
            callAsApiAtNodeId: 'as1',
            asEventEmitter: as1EventEmitter,
            asResponseParams: [
              {
                reference_id: generateReferenceId(),
                callback_url: config.AS1_CALLBACK_URL,
                service_id: 'bank_statement',
                data,
              },
            ],
          },
        ],
      });
    });
  });

  describe('RP update node_id_whitelist_active = false test', function () {
    it('NDID should update node rp2 node_id_whitelist_active = false successfully', async function () {
      this.timeout(20000);
      const responseUpdateNode = await ndidApi.updateNode('ndid1', {
        node_id: 'rp2',
        node_id_whitelist_active: false,
        node_id_whitelist: ['idp3'],
      });
      expect(responseUpdateNode.status).to.equal(204);
      await wait(3000);

      const responseGetNodeInfo = await commonApi.getNodeInfo('rp2');
      const responseBody = await responseGetNodeInfo.json();
      expect(responseBody.role).to.equal('RP');
      expect(responseBody.node_id_whitelist_active).to.be.false;
      expect(responseBody).to.not.have.key('node_id_whitelist');
    });

    it('rp2 should not got only nodes that whitelist when get all idp', async function () {
      this.timeout(10000);
      let response = await commonApi.getIdP('rp2');
      expect(response.status).to.equal(200);

      let responseBody = await response.json();
      expect(responseBody).to.be.an('array');
      expect(responseBody).to.have.length.above(1);
    });

    it('rp2 should get relevant IdP nodes by sid (sid is not relevant with idp that rp2 whitelist) successfully', async function () {
      this.timeout(30000);
      const identity = db.idp1Identities.find(
        // SID from idp1
        (identity) => identity.mode === 3,
      );
      let namespace = identity.namespace;
      let identifier = identity.identifier;

      let response = await commonApi.getRelevantIdpNodesBySid('rp2', {
        namespace,
        identifier,
      });

      const idpNodes = await response.json();
      expect(idpNodes).to.be.an('array').to.not.be.empty;
    });

    it('rp2 should got IdP nodes when get relevant IdP nodes by sid', async function () {
      this.timeout(10000);
      let response = await commonApi.getRelevantIdpNodesBySid('rp2', {
        namespace: namespaceNodeWhiteList,
        identifier: identifierNodeWhiteList,
      });
      const idpNodes = await response.json();
      expect(idpNodes).to.be.an('array').to.have.length(1);
      expect(idpNodes[0].node_id).to.equal('idp3');
    });
  });

  describe('RP create request to IdP after update node_id_whitelist_active = false test', function () {
    describe('1 IdP, 1 AS, mode 1', function () {
      const data = JSON.stringify({
        test: 'test',
        withEscapedChar: 'test|fff||ss\\|NN\\\\|',
        arr: [1, 2, 3],
      });

      mode1DataRequestFlowTest({
        callRpApiAtNodeId: 'rp2',
        rpEventEmitter: rp2EventEmitter,
        createRequestParams: {
          reference_id: generateReferenceId(),
          callback_url: config.RP2_CALLBACK_URL,
          mode: 1,
          namespace: 'citizen_id',
          identifier: '1234567890123',
          idp_id_list: ['idp1'],
          data_request_list: [
            {
              service_id: 'bank_statement',
              as_id_list: ['as1'],
              min_as: 1,
              request_params: JSON.stringify({
                format: 'pdf',
              }),
            },
          ],
          request_message:
            'Test request message (mode 1) ทดสอบภาษาไทย should\\|be|able\\\\|to|send\\\\\\|this',
          min_ial: 1.1,
          min_aal: 1,
          min_idp: 1,
          request_timeout: 86400,
        },
        idpParams: [
          {
            callIdpApiAtNodeId: 'idp1',
            idpEventEmitter: idp1EventEmitter,
            idpResponseParams: {
              reference_id: generateReferenceId(),
              callback_url: config.IDP1_CALLBACK_URL,
              ial: 2.3,
              aal: 3,
              status: 'accept',
              createResponseSignature: (privatekey, request_message) => {
                const signature = createSignature(privatekey, request_message);
                return signature;
              },
            },
          },
        ],
        asParams: [
          {
            callAsApiAtNodeId: 'as1',
            asEventEmitter: as1EventEmitter,
            asResponseParams: [
              {
                reference_id: generateReferenceId(),
                callback_url: config.AS1_CALLBACK_URL,
                service_id: 'bank_statement',
                data,
              },
            ],
          },
        ],
      });
    });

    describe('1 IdP, 1 AS, mode 2', function () {
      const data = JSON.stringify({
        test: 'test',
        withEscapedChar: 'test|fff||ss\\|NN\\\\|',
        arr: [1, 2, 3],
      });

      mode2And3DataRequestFlowTest({
        callRpApiAtNodeId: 'rp2',
        rpEventEmitter: rp2EventEmitter,
        getIdentityForRequest: () => {
          return db.idp1Identities.find((identity) => identity.mode === 2);
        },
        createRequestParams: {
          reference_id: generateReferenceId(),
          callback_url: config.RP2_CALLBACK_URL,
          mode: 2,
          idp_id_list: [],
          data_request_list: [
            {
              service_id: 'bank_statement',
              as_id_list: ['as1'],
              min_as: 1,
              request_params: JSON.stringify({
                format: 'pdf',
              }),
            },
          ],
          request_message:
            'Test request message (mode 2) ทดสอบภาษาไทย should\\|be|able\\\\|to|send\\\\\\|this',
          min_ial: 1.1,
          min_aal: 1,
          min_idp: 1,
          request_timeout: 86400,
          bypass_identity_check: false,
        },
        idpParams: [
          {
            callIdpApiAtNodeId: 'idp1',
            idpEventEmitter: idp1EventEmitter,
            getAccessorForResponse: ({
              namespace,
              identifier,
              referenceGroupCode,
            }) => {
              const identity = db.idp1Identities.find(
                (identity) =>
                  (identity.namespace === namespace &&
                    identity.identifier === identifier) ||
                  identity.referenceGroupCode === referenceGroupCode,
              );
              return identity.accessors[0];
            },
            idpResponseParams: {
              reference_id: generateReferenceId(),
              callback_url: config.IDP1_CALLBACK_URL,
              ial: 2.3,
              aal: 3,
              status: 'accept',
              createResponseSignature: (privatekey, request_message) => {
                const signature = createResponseSignature(
                  privatekey,
                  request_message,
                );
                return signature;
              },
            },
          },
        ],
        asParams: [
          {
            callAsApiAtNodeId: 'as1',
            asEventEmitter: as1EventEmitter,
            asResponseParams: [
              {
                reference_id: generateReferenceId(),
                callback_url: config.AS1_CALLBACK_URL,
                service_id: 'bank_statement',
                data,
              },
            ],
          },
        ],
      });
    });

    describe('1 IdP, 1 AS, mode 3', function () {
      const data = JSON.stringify({
        test: 'test',
        withEscapedChar: 'test|fff||ss\\|NN\\\\|',
        arr: [1, 2, 3],
      });

      mode2And3DataRequestFlowTest({
        callRpApiAtNodeId: 'rp2',
        rpEventEmitter: rp2EventEmitter,
        getIdentityForRequest: () => {
          return db.idp1Identities.find((identity) => identity.mode === 3);
        },
        createRequestParams: {
          reference_id: generateReferenceId(),
          callback_url: config.RP2_CALLBACK_URL,
          mode: 3,
          idp_id_list: [],
          data_request_list: [
            {
              service_id: 'bank_statement',
              as_id_list: ['as1'],
              min_as: 1,
              request_params: JSON.stringify({
                format: 'pdf',
              }),
            },
          ],
          request_message:
            'Test request message (mode 3) ทดสอบภาษาไทย should\\|be|able\\\\|to|send\\\\\\|this',
          min_ial: 1.1,
          min_aal: 1,
          min_idp: 1,
          request_timeout: 86400,
          bypass_identity_check: false,
        },
        idpParams: [
          {
            callIdpApiAtNodeId: 'idp1',
            idpEventEmitter: idp1EventEmitter,
            getAccessorForResponse: ({
              namespace,
              identifier,
              referenceGroupCode,
            }) => {
              const identity = db.idp1Identities.find(
                (identity) =>
                  (identity.namespace === namespace &&
                    identity.identifier === identifier) ||
                  identity.referenceGroupCode === referenceGroupCode,
              );
              return identity.accessors[0];
            },
            idpResponseParams: {
              reference_id: generateReferenceId(),
              callback_url: config.IDP1_CALLBACK_URL,
              ial: 2.3,
              aal: 3,
              status: 'accept',
              createResponseSignature: (privatekey, request_message) => {
                const signature = createResponseSignature(
                  privatekey,
                  request_message,
                );
                return signature;
              },
            },
          },
        ],
        asParams: [
          {
            callAsApiAtNodeId: 'as1',
            asEventEmitter: as1EventEmitter,
            asResponseParams: [
              {
                reference_id: generateReferenceId(),
                callback_url: config.AS1_CALLBACK_URL,
                service_id: 'bank_statement',
                data,
              },
            ],
          },
        ],
      });
    });
  });

  after(async function () {
    this.timeout(10000);
    await ndidApi.updateNode('ndid1', {
      node_id: 'rp2',
      node_id_whitelist_active: false,
      node_id_whitelist: ['idp3'],
    });
  });
});
