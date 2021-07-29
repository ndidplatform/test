import crypto from 'crypto';
import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import * as ndidApi from '../../../api/v5/ndid';
import * as commonApi from '../../../api/v5/common';
import * as identityApi from '../../../api/v5/identity';
import { ndidAvailable } from '../../';
import * as config from '../../../config';
import * as db from '../../../db';
import { createEventPromise, generateReferenceId, wait } from '../../../utils';
import { idp1EventEmitter } from '../../../callback_server';

describe('NDID on_the_fly_support property tests', function () {
  before(async function () {
    if (!ndidAvailable) {
      this.skip();
    }
  });

  describe('NDID Registering idp node with on_the_fly_support property test', function () {
    const nodeId = uuidv4();
    const nodeName = 'Test Register IdP Node With On The Fly Support Is True';
    const keypair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });

    const publicKey = keypair.publicKey.export({
      type: 'spki',
      format: 'pem',
    });

    it('NDID should registering node role IdP with on_the_fly_support = true successfully', async function () {
      this.timeout(10000);
      const response = await ndidApi.registerNode('ndid1', {
        node_id: nodeId,
        node_name: nodeName,
        node_key: publicKey,
        node_master_key: publicKey,
        role: 'idp',
        max_ial: 3,
        max_aal: 3,
        on_the_fly_support: true,
      });
      expect(response.status).to.equal(201);
    });

    it('Should get node information successfully', async function () {
      const response = await commonApi.getNodeInfo('ndid1', {
        node_id: nodeId,
      });
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      expect(responseBody).to.deep.equal({
        public_key: publicKey,
        master_public_key: publicKey,
        node_name: nodeName,
        role: 'IdP',
        max_ial: 3,
        max_aal: 3,
        on_the_fly_support: true,
        supported_request_message_data_url_type_list: [],
        agent: false,
        node_id_whitelist_active: false,
        mq: null,
        active: true,
      });
    });

    it('Should get all idp information that ndid just registering node successfully', async function () {
      const response = await commonApi.getIdP('ndid1');
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      const idpInformation = responseBody.find((idp) => idp.node_id === nodeId);
      expect(idpInformation).to.not.be.an('undefined');
      expect(idpInformation).to.deep.equal({
        node_id: nodeId,
        node_name: nodeName,
        max_aal: 3,
        max_ial: 3,
        on_the_fly_support: true,
        lial: null,
        laal: null,
        supported_request_message_data_url_type_list: [],
        agent: false,
      });
    });
  });

  describe('NDID Registering node (not idp) with on_the_fly_support property test', function () {
    const nodeId = uuidv4();
    const nodeName =
      'Test Register Node (not idp) With On The Fly Support Is True';
    const keypair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });

    const publicKey = keypair.publicKey.export({
      type: 'spki',
      format: 'pem',
    });

    it('NDID should get an error when registering node role rp with on_the_fly_support flag', async function () {
      this.timeout(10000);
      const response = await ndidApi.registerNode('ndid1', {
        node_id: nodeId,
        node_name: nodeName,
        node_key: publicKey,
        node_master_key: publicKey,
        role: 'rp',
        on_the_fly_support: true,
      });
      expect(response.status).to.equal(500);
      const responseBody = await response.json();
      expect(responseBody.error.code).to.equal(10000);
    });

    it('NDID should get an error when registering node role as with on_the_fly_support flag', async function () {
      this.timeout(10000);
      const response = await ndidApi.registerNode('ndid1', {
        node_id: nodeId,
        node_name: nodeName,
        node_key: publicKey,
        node_master_key: publicKey,
        role: 'as',
        on_the_fly_support: true,
      });
      expect(response.status).to.equal(500);
      const responseBody = await response.json();
      expect(responseBody.error.code).to.equal(10000);
    });

    it('NDID should get an error when registering node role proxy with on_the_fly_support flag', async function () {
      this.timeout(10000);
      const response = await ndidApi.registerNode('ndid1', {
        node_id: nodeId,
        node_name: nodeName,
        node_key: publicKey,
        node_master_key: publicKey,
        role: 'proxy',
        on_the_fly_support: true,
      });
      expect(response.status).to.equal(500);
      const responseBody = await response.json();
      expect(responseBody.error.code).to.equal(10000);
    });
  });

  describe('NDID Update idp node (idp1) with on_the_fly_support property test', function () {
    let idpInformationBeforeUpdateNode;

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

    before(async function () {
      const response = await commonApi.getNodeInfo('ndid1', {
        node_id: 'idp1',
      });
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      idpInformationBeforeUpdateNode = responseBody;

      idp1EventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'create_identity_result' &&
          callbackData.reference_id === referenceId
        ) {
          createIdentityResultPromise.resolve(callbackData);
        }
      });
    });

    it('NDID should update node role IdP with on_the_fly_support = true successfully', async function () {
      this.timeout(10000);
      const response = await ndidApi.updateNode('ndid1', {
        node_id: 'idp1',
        on_the_fly_support: true,
      });
      expect(response.status).to.equal(204);

      await wait(2000);
    });

    it('Should get node information successfully', async function () {
      const response = await commonApi.getNodeInfo('ndid1', {
        node_id: 'idp1',
      });
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      expect(responseBody).to.deep.equal({
        ...idpInformationBeforeUpdateNode,
        on_the_fly_support: true,
      });
    });

    it('Should get all idp information that ndid just update node information successfully', async function () {
      const response = await commonApi.getIdP('ndid1');
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      const idpInformation = responseBody.find((idp) => idp.node_id === 'idp1');
      expect(idpInformation).to.not.be.an('undefined');
      expect(idpInformation).to.deep.include({
        node_id: 'idp1',
        max_aal: 3,
        max_ial: 3,
        on_the_fly_support: true,
        supported_request_message_data_url_type_list: [],
        agent: false,
      });
    });

    it('Before create identity this sid should not exist on platform ', async function () {
      const response = await identityApi.getIdentityInfo('idp1', {
        namespace,
        identifier,
      });
      expect(response.status).to.equal(404);
    });

    it('Before create identity this sid should not associated with idp1 ', async function () {
      const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
        namespace,
        identifier,
      });
      const idpNodes = await response.json();
      const idpNode = idpNodes.find((idpNode) => idpNode.node_id === 'idp1');
      expect(idpNode).to.be.an.undefined;
    });

    it('Before create identity should not get identity ial', async function () {
      const response = await identityApi.getIdentityIal('idp1', {
        namespace,
        identifier,
      });
      expect(response.status).to.equal(404);
    });

    it('Should create identity request (mode2) successfully', async function () {
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
        lial: true,
        laal: true,
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

      const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
        namespace,
        identifier,
      });

      const idpNodes = await response.json();
      const idpNode = idpNodes.find((idpNode) => idpNode.node_id === 'idp1');
      expect(idpNode).to.not.be.undefined;
      expect(idpNode.mode_list).to.be.an('array').that.include(2);

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

    it('After create identity this sid should be existing on platform ', async function () {
      const response = await identityApi.getIdentityInfo('idp1', {
        namespace,
        identifier,
      });
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      expect(responseBody.reference_group_code).to.equal(referenceGroupCode);
    });

    it('After create identity should get identity ial successfully', async function () {
      const response = await identityApi.getIdentityIal('idp1', {
        namespace,
        identifier,
      });
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      expect(responseBody.ial).to.equal(2.3);
    });

    it('After create identity should get identity LIAL successfully', async function () {
      const response = await identityApi.getIdentityLial('idp1', {
        namespace,
        identifier,
      });
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      expect(responseBody.lial).to.equal(true);
    });

    it('After create identity should get identity LAAL successfully', async function () {
      const response = await identityApi.getIdentityLaal('idp1', {
        namespace,
        identifier,
      });
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      expect(responseBody.laal).to.equal(true);
    });

    it('Should get relevant IdP nodes by sid successfully', async function () {
      this.timeout(15000);

      const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
        namespace,
        identifier,
      });
      const responseBody = await response.json();
      expect(responseBody).to.be.an('array').that.to.have.lengthOf(1);
      const idp = responseBody.find((node) => node.node_id === 'idp1');
      expect(idp.ial).to.equal(2.3);
      expect(idp.lial).to.equal(true);
      expect(idp.laal).to.equal(true);
      expect(idp.on_the_fly_support).to.equal(true);
    });
    after(async function () {
      await ndidApi.updateNode('ndid1', {
        node_id: 'idp1',
        on_the_fly_support: false,
      });
      idp1EventEmitter.removeAllListeners('callback');
    });
  });
});
