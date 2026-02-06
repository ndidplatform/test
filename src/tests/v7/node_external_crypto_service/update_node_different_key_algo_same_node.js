import crypto from 'crypto';
import { expect } from 'chai';

import { rpEventEmitter } from '../../../callback_server';
import * as nodeApi from '../../../api/v7/node';
import * as commonApi from '../../../api/v7/common';
import * as apiHelpers from '../../../api/helpers';
import { createEventPromise, generateReferenceId, wait } from '../../../utils';
import * as cryptoUtils from '../../../utils/crypto';

import * as config from '../../../config';

import * as kms from '../../../callback_server/kms';

describe('Update node (keys) tests with external crypto service (different key algorithm on node key and node master key)', function () {
  const RPKeypair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const RPPrivKey = RPKeypair.privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  });
  const RPPubKey = RPKeypair.publicKey.export({
    type: 'spki',
    format: 'pem',
  });

  const RPMasterKeypair = crypto.generateKeyPairSync('ed25519');
  const RPMasterPrivKey = RPMasterKeypair.privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  });
  const RPMasterPubKey = RPMasterKeypair.publicKey.export({
    type: 'spki',
    format: 'pem',
  });

  const RPEncryptionKeypair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const RPEncryptionPrivKey = RPEncryptionKeypair.privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  });
  const RPEncryptionPubKey = RPEncryptionKeypair.publicKey.export({
    type: 'spki',
    format: 'pem',
  });

  //

  const RPKeypair2 = crypto.generateKeyPairSync('ed25519');
  const RPPrivKey2 = RPKeypair2.privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  });
  const RPPubKey2 = RPKeypair2.publicKey.export({
    type: 'spki',
    format: 'pem',
  });

  const RPMasterKeypair2 = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const RPMasterPrivKey2 = RPMasterKeypair2.privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  });
  const RPMasterPubKey2 = RPMasterKeypair2.publicKey.export({
    type: 'spki',
    format: 'pem',
  });

  describe("Update nodes' keys tests", function () {
    const RPUpdateNodeReferenceId = generateReferenceId();
    const RPUpdateNodeReferenceId2 = generateReferenceId();

    const RPUpdateNodeResultPromise = createEventPromise();
    const RPUpdateNodeResultPromise2 = createEventPromise();

    let rpNodeInfo;
    let rpNodePublicKeys;

    before(async function () {
      this.timeout(35000);

      let response;

      response = await apiHelpers.getResponseAndBody(
        commonApi.getNodeInfo('rp1')
      );
      rpNodeInfo = response.responseBody;

      response = await apiHelpers.getResponseAndBody(
        commonApi.getNodePublicKeys('rp1')
      );
      rpNodePublicKeys = response.responseBody;

      rpEventEmitter.on('callback', function (callbackData) {
        if (callbackData.type === 'update_node_result') {
          if (callbackData.reference_id === RPUpdateNodeReferenceId) {
            RPUpdateNodeResultPromise.resolve(callbackData);
          } else if (callbackData.reference_id === RPUpdateNodeReferenceId2) {
            RPUpdateNodeResultPromise2.resolve(callbackData);
          }
        }
      });
    });

    it("RP should update node's master key and public key with check_string, signed_check_string, master_signed_check_string successfully", async function () {
      this.timeout(30000);
      const check_string = 'RP test update public key and master public key';
      const response = await nodeApi.updateNode('rp1', {
        reference_id: RPUpdateNodeReferenceId,
        callback_url: config.RP_CALLBACK_URL,
        signing_public_key: RPPubKey,
        signing_key_algorithm: cryptoUtils.keyAlgorithm.RSA,
        signing_algorithm:
          cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256.name,
        signing_master_public_key: RPMasterPubKey,
        signing_master_key_algorithm: cryptoUtils.keyAlgorithm.Ed25519,
        signing_master_algorithm: cryptoUtils.signatureAlgorithm.Ed25519.name,
        encryption_public_key: RPEncryptionPubKey,
        encryption_key_algorithm: cryptoUtils.keyAlgorithm.RSA,
        encryption_algorithm:
          cryptoUtils.encryptionAlgorithm.RSAES_OAEP_SHA_1.name,
        check_string,
        signed_check_string: cryptoUtils
          .createSignature(
            cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256.name,
            Buffer.from(check_string, 'utf8'),
            RPPrivKey
          )
          .toString('base64'),
        master_signed_check_string: cryptoUtils
          .createSignature(
            cryptoUtils.signatureAlgorithm.Ed25519.name,
            Buffer.from(check_string, 'utf8'),
            RPMasterPrivKey
          )
          .toString('base64'),
      });
      expect(response.status).to.equal(202);

      const updateNodeResult = await RPUpdateNodeResultPromise.promise;
      expect(updateNodeResult.success).to.equal(true);

      kms.setNodeSigningKey(
        'rp1',
        RPPrivKey,
        cryptoUtils.signatureAlgorithm.Ed25519
      );
      kms.setNodeSigningMasterKey(
        'rp1',
        RPMasterPrivKey,
        cryptoUtils.signatureAlgorithm.Ed25519
      );
      kms.setNodeEncryptionKey(
        'rp1',
        RPEncryptionPrivKey,
        cryptoUtils.encryptionAlgorithm.RSAES_OAEP_SHA_1
      );

      await wait(3000);
    });

    it("RP node's master key and public key should be updated successfully", async function () {
      this.timeout(15000);
      const response = await commonApi.getNodeInfo('rp1');
      const responseBody = await response.json();
      expect(responseBody.role).to.equal('RP');
      expect(responseBody.signing_public_key).to.deep.include({
        public_key: RPPubKey,
        algorithm:
          cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256.name,
        version: rpNodeInfo.signing_public_key.version + 1,
        active: true,
      });
      expect(responseBody.signing_master_public_key).to.deep.include({
        public_key: RPMasterPubKey,
        algorithm: cryptoUtils.signatureAlgorithm.Ed25519.name,
        version: rpNodeInfo.signing_master_public_key.version + 1,
        active: true,
      });
      expect(responseBody.encryption_public_key).to.deep.include({
        public_key: RPEncryptionPubKey,
        algorithm: cryptoUtils.encryptionAlgorithm.RSAES_OAEP_SHA_1.name,
        version: rpNodeInfo.encryption_public_key.version + 1,
        active: true,
      });
    });

    it("RP node's key list should be updated successfully", async function () {
      const response = await commonApi.getNodePublicKeys('rp1');
      const responseBody = await response.json();
      expect(responseBody.signing_public_key_list).to.have.lengthOf(
        rpNodePublicKeys.signing_public_key_list.length + 1
      );
      expect(
        responseBody.signing_public_key_list.find(
          ({ version }) => version === rpNodeInfo.signing_public_key.version
        ).active
      ).to.equal(false);
      expect(
        responseBody.signing_public_key_list.find(
          ({ version }) => version === rpNodeInfo.signing_public_key.version + 1
        )
      ).to.be.not.null;

      expect(responseBody.signing_master_public_key_list).to.have.lengthOf(
        rpNodePublicKeys.signing_master_public_key_list.length + 1
      );
      expect(
        responseBody.signing_master_public_key_list.find(
          ({ version }) =>
            version === rpNodeInfo.signing_master_public_key.version
        ).active
      ).to.equal(false);
      expect(
        responseBody.signing_master_public_key_list.find(
          ({ version }) =>
            version === rpNodeInfo.signing_master_public_key.version + 1
        )
      ).to.be.not.null;

      expect(responseBody.encryption_public_key_list).to.have.lengthOf(
        rpNodePublicKeys.encryption_public_key_list.length + 1
      );
      expect(
        responseBody.encryption_public_key_list.find(
          ({ version }) => version === rpNodeInfo.encryption_public_key.version
        ).active
      ).to.equal(false);
      expect(
        responseBody.encryption_public_key_list.find(
          ({ version }) =>
            version === rpNodeInfo.encryption_public_key.version + 1
        )
      ).to.be.not.null;
    });

    it("RP should update node's master key and public key with check_string, signed_check_string, master_signed_check_string successfully", async function () {
      this.timeout(30000);
      const check_string = 'RP test update public key and master public key';
      const response = await nodeApi.updateNode('rp1', {
        reference_id: RPUpdateNodeReferenceId2,
        callback_url: config.RP_CALLBACK_URL,
        signing_public_key: RPPubKey2,
        signing_key_algorithm: cryptoUtils.keyAlgorithm.Ed25519,
        signing_algorithm: cryptoUtils.signatureAlgorithm.Ed25519.name,
        signing_master_public_key: RPMasterPubKey2,
        signing_master_key_algorithm: cryptoUtils.keyAlgorithm.RSA,
        signing_master_algorithm:
          cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256.name,
        // encryption_public_key: RPEncryptionPubKey,
        // encryption_key_algorithm: cryptoUtils.keyAlgorithm.RSA,
        // encryption_algorithm:
        //   cryptoUtils.encryptionAlgorithm.RSAES_OAEP_SHA_1.name,
        check_string,
        signed_check_string: cryptoUtils
          .createSignature(
            cryptoUtils.signatureAlgorithm.Ed25519.name,
            Buffer.from(check_string, 'utf8'),
            RPPrivKey2
          )
          .toString('base64'),
        master_signed_check_string: cryptoUtils
          .createSignature(
            cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256.name,
            Buffer.from(check_string, 'utf8'),
            RPMasterPrivKey2
          )
          .toString('base64'),
      });
      expect(response.status).to.equal(202);

      const updateNodeResult = await RPUpdateNodeResultPromise2.promise;
      expect(updateNodeResult.success).to.equal(true);

      kms.setNodeSigningKey(
        'rp1',
        RPPrivKey2,
        cryptoUtils.signatureAlgorithm.Ed25519
      );
      kms.setNodeSigningMasterKey(
        'rp1',
        RPMasterPrivKey2,
        cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256
      );

      await wait(3000);
    });

    it("RP node's master key and public key should be updated successfully", async function () {
      this.timeout(15000);
      const response = await commonApi.getNodeInfo('rp1');
      const responseBody = await response.json();
      expect(responseBody.role).to.equal('RP');
      expect(responseBody.signing_public_key).to.deep.include({
        public_key: RPPubKey2,
        algorithm: cryptoUtils.signatureAlgorithm.Ed25519.name,
        version: rpNodeInfo.signing_public_key.version + 2,
        active: true,
      });
      expect(responseBody.signing_master_public_key).to.deep.include({
        public_key: RPMasterPubKey2,
        algorithm:
          cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256.name,
        version: rpNodeInfo.signing_master_public_key.version + 2,
        active: true,
      });
    });

    after(async function () {
      this.timeout(15000);
      // set node keys back to original
      let originalNodeSigningKey;
      let originalNodeSigningMasterKey;
      let originalNodeEncryptionKey;

      const rpReferenceId = generateReferenceId();
      const rpResultPromise = createEventPromise();

      rpEventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'update_node_result' &&
          callbackData.reference_id === rpReferenceId
        ) {
          rpResultPromise.resolve(callbackData);
        }
      });

      originalNodeSigningKey = kms.getOriginalNodeSigningKey('rp1');
      originalNodeSigningMasterKey = kms.getOriginalNodeSigningMasterKey('rp1');
      originalNodeEncryptionKey = kms.getOriginalNodeEncryptionKey('rp1');

      await nodeApi.updateNode('rp1', {
        reference_id: rpReferenceId,
        callback_url: config.RP_CALLBACK_URL,
        signing_public_key: originalNodeSigningKey.publicKey,
        signing_key_algorithm: originalNodeSigningKey.keyAlgorithm,
        signing_algorithm: originalNodeSigningKey.signingAlgorithm.name,
        signing_master_public_key: originalNodeSigningMasterKey.publicKey,
        signing_master_key_algorithm: originalNodeSigningMasterKey.keyAlgorithm,
        signing_master_algorithm:
          originalNodeSigningMasterKey.signingAlgorithm.name,
        encryption_public_key: originalNodeEncryptionKey.publicKey,
        encryption_key_algorithm: originalNodeEncryptionKey.keyAlgorithm,
        encryption_algorithm:
          originalNodeEncryptionKey.encryptionAlgorithm.name,
      });

      await rpResultPromise.promise;

      kms.setNodeSigningKey(
        'rp1',
        originalNodeSigningKey.privateKey,
        originalNodeSigningKey.signingAlgorithm
      );
      kms.setNodeSigningMasterKey(
        'rp1',
        originalNodeSigningMasterKey.privateKey,
        originalNodeSigningMasterKey.signingAlgorithm
      );
      kms.setNodeEncryptionKey(
        'rp1',
        originalNodeEncryptionKey.privateKey,
        originalNodeEncryptionKey.encryptionAlgorithm
      );

      rpEventEmitter.removeAllListeners('callback');
    });
  });
});
