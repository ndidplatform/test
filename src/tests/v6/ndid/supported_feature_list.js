import crypto from 'crypto';
import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import * as ndidApi from '../../../api/v6/ndid';
import * as commonApi from '../../../api/v6/common';
import { ndidAvailable } from '../../';
import { wait } from '../../../utils';
import * as cryptoUtils from '../../../utils/crypto';
import { randomString } from '../../../utils/random';

describe('Node feature support list tests', function () {
  const featureFlag1 = randomString(5);

  before(async function () {
    if (!ndidAvailable) {
      this.skip();
    }
  });

  describe('NDID add allowed node supported feature', function () {
    it('NDID should add allowed node supported feature successfully', async function () {
      this.timeout(10000);
      const response = await ndidApi.addAllowedNodeSupportedFeature('ndid1', {
        name: featureFlag1,
      });
      expect(response.status).to.equal(204);
    });

    it('should get allowed node supported feature successfully', async function () {
      const response = await commonApi.getAllowedNodeSupportedFeatureList(
        'ndid1'
      );
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      expect(responseBody).to.include.members([featureFlag1]);
    });
  });

  describe('NDID registering node with node supported feature test', function () {
    const nodeId = uuidv4();
    const nodeName = 'Test Register Node with node supported feature list';
    const keypair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });

    const publicKey = keypair.publicKey.export({
      type: 'spki',
      format: 'pem',
    });

    it('NDID should registering node with node supported feature successfully', async function () {
      this.timeout(10000);
      const response = await ndidApi.registerNode('ndid1', {
        node_id: nodeId,
        node_name: nodeName,
        signing_public_key: publicKey,
        signing_key_algorithm: cryptoUtils.keyAlgorithm.RSA,
        signing_algorithm:
          cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256.name,
        signing_master_public_key: publicKey,
        signing_master_key_algorithm: cryptoUtils.keyAlgorithm.RSA,
        signing_master_algorithm:
          cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256.name,
        encryption_public_key: publicKey,
        encryption_key_algorithm: cryptoUtils.keyAlgorithm.RSA,
        encryption_algorithm:
          cryptoUtils.encryptionAlgorithm.RSAES_PKCS1_V1_5.name,
        role: 'rp',
        supported_feature_list: [featureFlag1],
      });
      expect(response.status).to.equal(201);
    });

    it('Should get node information successfully', async function () {
      const response = await commonApi.getNodeInfo('ndid1', {
        node_id: nodeId,
      });
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      expect(responseBody).to.deep.include({
        node_name: nodeName,
        role: 'RP',
        supported_feature_list: [featureFlag1],
        node_id_whitelist_active: false,
        mq: null,
        active: true,
      });
      expect(responseBody.signing_public_key).to.deep.include({
        public_key: publicKey,
        algorithm:
          cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256.name,
        version: 1,
        active: true,
      });
      expect(responseBody.signing_master_public_key).to.deep.include({
        public_key: publicKey,
        algorithm:
          cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256.name,
        version: 1,
        active: true,
      });
      expect(responseBody.encryption_public_key).to.deep.include({
        public_key: publicKey,
        algorithm: cryptoUtils.encryptionAlgorithm.RSAES_PKCS1_V1_5.name,
        version: 1,
        active: true,
      });
    });
  });

  describe('NDID update node with node supported feature list test', function () {
    const nodeId = 'idp1';
    let nodeName = '';
    let nodeInfoBeforeUpdateNode;

    before(async function () {
      const response = await commonApi.getNodeInfo('ndid1', {
        node_id: nodeId,
      });
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      nodeInfoBeforeUpdateNode = responseBody;
    });

    it('NDID should update node with node supported feature successfully', async function () {
      this.timeout(10000);
      const response = await ndidApi.updateNode('ndid1', {
        node_id: nodeId,
        supported_feature_list: [featureFlag1],
      });
      expect(response.status).to.equal(204);

      await wait(2000);
    });

    it('should get node information successfully', async function () {
      const response = await commonApi.getNodeInfo('ndid1', {
        node_id: nodeId,
      });
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      expect(responseBody).to.deep.equal({
        ...nodeInfoBeforeUpdateNode,
        supported_feature_list: [featureFlag1],
      });
      nodeName = responseBody.node_name;
    });

    it('should get idp node with supported_feature_list successfully', async function () {
      const response = await commonApi.getIdP('ndid1', {
        supported_feature_list: featureFlag1,
      });
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      const idpInformation = responseBody.find((idp) => idp.node_id === nodeId);
      expect(idpInformation).to.not.be.an('undefined');
      expect(idpInformation).to.deep.equal({
        node_id: nodeId,
        node_name: nodeName,
        max_aal: 3,
        max_ial: 3,
        lial: null,
        laal: null,
        supported_request_message_data_url_type_list: [],
        agent: false,
        supported_feature_list: [featureFlag1],
      });
    });

    it('should get idp node with supported_feature_list that this node does not support successfully', async function () {
      const response = await commonApi.getIdP('ndid1', {
        supported_feature_list: 'dContract',
      });
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      expect(responseBody).to.deep.equal([]);
    });

    after(async function () {
      await ndidApi.updateNode('ndid1', {
        node_id: nodeId,
        supported_feature_list: [],
      });
    });
  });

  describe('NDID remove allowed node supported feature', function () {
    it('NDID should remove allowed node supported feature successfully', async function () {
      this.timeout(10000);
      const response = await ndidApi.removeAllowedNodeSupportedFeature(
        'ndid1',
        {
          name: featureFlag1,
        }
      );
      expect(response.status).to.equal(204);
    });

    it('should get allowed node supported feature (and not in the list) successfully', async function () {
      const response = await commonApi.getAllowedNodeSupportedFeatureList(
        'ndid1'
      );
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      expect(responseBody).to.not.include.members([featureFlag1]);
    });
  });
});
