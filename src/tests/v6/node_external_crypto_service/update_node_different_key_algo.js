import crypto from 'crypto';
import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import * as rpApi from '../../../api/v6/rp';
import * as idpApi from '../../../api/v6/idp';
import * as asApi from '../../../api/v6/as';
import * as identityApi from '../../../api/v6/identity';
import {
  rpEventEmitter,
  idp1EventEmitter,
  as1EventEmitter,
} from '../../../callback_server';
import * as nodeApi from '../../../api/v6/node';
import * as commonApi from '../../../api/v6/common';
import * as apiHelpers from '../../../api/helpers';
import {
  createEventPromise,
  generateReferenceId,
  wait,
  hash,
  createResponseSignature,
} from '../../../utils';
import * as cryptoUtils from '../../../utils/crypto';
import { randomThaiIdNumber } from '../../../utils/thai_id';
import {
  createIdpIdList,
  createDataRequestList,
  createRequestMessageHash,
  setDataReceived,
  setDataSigned,
} from '../_fragments/fragments_utils';
import {
  receivePendingRequestStatusTest,
  receiveConfirmedRequestStatusTest,
  receiveCompletedRequestStatusTest,
  receiveRequestClosedStatusTest,
} from '../_fragments/common';
import { getAndVerifyRequestMessagePaddedHashTest } from '../_fragments/request_flow_fragments/idp';

import * as db from '../../../db';
import * as config from '../../../config';

import * as kms from '../../../callback_server/kms';

describe('Update node (keys) tests with external crypto service (different key algorithm)', function () {
  const RPKeypair = crypto.generateKeyPairSync('ed25519');
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

  const IdPKeypair = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const IdPPriveKey = IdPKeypair.privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  });
  const IdPPubKey = IdPKeypair.publicKey.export({
    type: 'spki',
    format: 'pem',
  });

  const IdPMasterKeypair = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const IdPMasterPrivKey = IdPMasterKeypair.privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  });
  const IdPMasterPubKey = IdPMasterKeypair.publicKey.export({
    type: 'spki',
    format: 'pem',
  });

  const IdPEncryptionKeypair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const IdPEncryptionPrivKey = IdPEncryptionKeypair.privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  });
  const IdPEncryptionPubKey = IdPEncryptionKeypair.publicKey.export({
    type: 'spki',
    format: 'pem',
  });

  const ASKeypair = crypto.generateKeyPairSync('ec', {
    namedCurve: 'secp384r1',
  });
  const ASPrivKey = ASKeypair.privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  });
  const ASPubKey = ASKeypair.publicKey.export({
    type: 'spki',
    format: 'pem',
  });

  const ASMasterKeypair = crypto.generateKeyPairSync('ec', {
    namedCurve: 'secp384r1',
  });
  const ASMasterPrivKey = ASMasterKeypair.privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  });
  const ASMasterPubKey = ASMasterKeypair.publicKey.export({
    type: 'spki',
    format: 'pem',
  });

  const ASEncryptionKeypair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const ASEncryptionPrivKey = ASEncryptionKeypair.privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  });
  const ASEncryptionPubKey = ASEncryptionKeypair.publicKey.export({
    type: 'spki',
    format: 'pem',
  });

  describe("RP, IdP, AS update nodes' keys tests", function () {
    const RPUpdateNodeReferenceId = generateReferenceId();
    const IdPUpdateNodeReferenceId = generateReferenceId();
    const ASUpdateNodeReferenceId = generateReferenceId();
    const rpReferenceId = generateReferenceId();
    const idpReferenceId = generateReferenceId();
    const asReferenceId = generateReferenceId();

    const RPUpdateNodeResultPromise = createEventPromise();
    const IdPUpdateNodeResultPromise = createEventPromise();
    const ASUpdateNodeResultPromise = createEventPromise();
    const createRequestResultPromise = createEventPromise();
    const incomingRequestPromise = createEventPromise();
    const responseResultPromise = createEventPromise();
    const accessorEncryptPromise = createEventPromise();
    const dataRequestReceivedPromise = createEventPromise();
    const sendDataResultPromise = createEventPromise();
    const requestClosedPromise = createEventPromise();

    const userKeypair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const userPrivateKey = userKeypair.privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    });
    const userPublicKey = userKeypair.publicKey.export({
      type: 'spki',
      format: 'pem',
    });

    let referenceId = generateReferenceId();

    let createIdentityResultPromise = createEventPromise();

    let createRequestParams;
    let namespace = 'citizen_id';
    let identifier = randomThaiIdNumber();
    let requestId;
    let requestMessageHash;
    let responseAccessorId;
    let accessorId;
    let referenceGroupCode;

    let rpNodeInfo;
    let rpNodePublicKeys;
    let idpNodeInfo;
    let idpNodePublicKeys;
    let asNodeInfo;
    let asNodePublicKeys;

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

      response = await apiHelpers.getResponseAndBody(
        commonApi.getNodeInfo('idp1')
      );
      idpNodeInfo = response.responseBody;

      response = await apiHelpers.getResponseAndBody(
        commonApi.getNodePublicKeys('idp1')
      );
      idpNodePublicKeys = response.responseBody;

      response = await apiHelpers.getResponseAndBody(
        commonApi.getNodeInfo('as1')
      );
      asNodeInfo = response.responseBody;

      response = await apiHelpers.getResponseAndBody(
        commonApi.getNodePublicKeys('as1')
      );
      asNodePublicKeys = response.responseBody;

      rpEventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'update_node_result' &&
          callbackData.reference_id === RPUpdateNodeReferenceId
        ) {
          RPUpdateNodeResultPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'create_request_result' &&
          callbackData.reference_id === rpReferenceId
        ) {
          createRequestResultPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'request_status' &&
          callbackData.request_id === requestId
        ) {
          if (callbackData.status === 'completed') {
            if (callbackData.closed) {
              requestClosedPromise.resolve(callbackData);
            }
          }
        }
      });

      idp1EventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'update_node_result' &&
          callbackData.reference_id === IdPUpdateNodeReferenceId
        ) {
          IdPUpdateNodeResultPromise.resolve(callbackData);
        } else if (
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
        if (
          callbackData.type === 'create_identity_result' &&
          callbackData.reference_id === referenceId
        ) {
          createIdentityResultPromise.resolve(callbackData);
        }
      });

      idp1EventEmitter.on('accessor_encrypt_callback', function (callbackData) {
        if (callbackData.request_id === requestId) {
          accessorEncryptPromise.resolve(callbackData);
        }
      });

      as1EventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'update_node_result' &&
          callbackData.reference_id === ASUpdateNodeReferenceId
        ) {
          ASUpdateNodeResultPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'data_request' &&
          callbackData.request_id === requestId
        ) {
          dataRequestReceivedPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'response_result' &&
          callbackData.reference_id === asReferenceId
        ) {
          sendDataResultPromise.resolve(callbackData);
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
        signing_key_algorithm: cryptoUtils.keyAlgorithm.Ed25519,
        signing_algorithm: cryptoUtils.signatureAlgorithm.Ed25519.name,
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
            cryptoUtils.signatureAlgorithm.Ed25519.name,
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
        algorithm: cryptoUtils.signatureAlgorithm.Ed25519.name,
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

    it("IdP should update node's master key and public key with check_string, signed_check_string, master_signed_check_string successfully", async function () {
      this.timeout(30000);
      const check_string = 'IdP test update public key and master public key';
      const response = await nodeApi.updateNode('idp1', {
        reference_id: IdPUpdateNodeReferenceId,
        callback_url: config.IDP1_CALLBACK_URL,
        signing_public_key: IdPPubKey,
        signing_key_algorithm: cryptoUtils.keyAlgorithm.EC,
        signing_algorithm: cryptoUtils.signatureAlgorithm.ECDSA_SHA_256.name,
        signing_master_public_key: IdPMasterPubKey,
        signing_master_key_algorithm: cryptoUtils.keyAlgorithm.EC,
        signing_master_algorithm:
          cryptoUtils.signatureAlgorithm.ECDSA_SHA_256.name,
        encryption_public_key: IdPEncryptionPubKey,
        encryption_key_algorithm: cryptoUtils.keyAlgorithm.RSA,
        encryption_algorithm:
          cryptoUtils.encryptionAlgorithm.RSAES_OAEP_SHA_256.name,
        check_string,
        signed_check_string: cryptoUtils
          .createSignature(
            cryptoUtils.signatureAlgorithm.ECDSA_SHA_256.name,
            Buffer.from(check_string, 'utf8'),
            IdPPriveKey
          )
          .toString('base64'),
        master_signed_check_string: cryptoUtils
          .createSignature(
            cryptoUtils.signatureAlgorithm.ECDSA_SHA_256.name,
            Buffer.from(check_string, 'utf8'),
            IdPMasterPrivKey
          )
          .toString('base64'),
      });
      expect(response.status).to.equal(202);

      const updateNodeResult = await IdPUpdateNodeResultPromise.promise;
      expect(updateNodeResult.success).to.equal(true);

      kms.setNodeSigningKey(
        'idp1',
        IdPPriveKey,
        cryptoUtils.signatureAlgorithm.ECDSA_SHA_256
      );
      kms.setNodeSigningMasterKey(
        'idp1',
        IdPMasterPrivKey,
        cryptoUtils.signatureAlgorithm.ECDSA_SHA_256
      );
      kms.setNodeEncryptionKey(
        'idp1',
        IdPEncryptionPrivKey,
        cryptoUtils.encryptionAlgorithm.RSAES_OAEP_SHA_256
      );

      await wait(3000);
    });

    it("IdP node's master key and public key should be updated successfully", async function () {
      this.timeout(15000);
      const response = await commonApi.getNodeInfo('idp1');
      const responseBody = await response.json();
      expect(responseBody.role).to.equal('IdP');
      expect(responseBody.signing_public_key).to.deep.include({
        public_key: IdPPubKey,
        algorithm: cryptoUtils.signatureAlgorithm.ECDSA_SHA_256.name,
        version: idpNodeInfo.signing_public_key.version + 1,
        active: true,
      });
      expect(responseBody.signing_master_public_key).to.deep.include({
        public_key: IdPMasterPubKey,
        algorithm: cryptoUtils.signatureAlgorithm.ECDSA_SHA_256.name,
        version: idpNodeInfo.signing_master_public_key.version + 1,
        active: true,
      });
      expect(responseBody.encryption_public_key).to.deep.include({
        public_key: IdPEncryptionPubKey,
        algorithm: cryptoUtils.encryptionAlgorithm.RSAES_OAEP_SHA_256.name,
        version: idpNodeInfo.encryption_public_key.version + 1,
        active: true,
      });
    });

    it("IdP node's key list should be updated successfully", async function () {
      const response = await commonApi.getNodePublicKeys('idp1');
      const responseBody = await response.json();
      expect(responseBody.signing_public_key_list).to.have.lengthOf(
        idpNodePublicKeys.signing_public_key_list.length + 1
      );
      expect(
        responseBody.signing_public_key_list.find(
          ({ version }) => version === idpNodeInfo.signing_public_key.version
        ).active
      ).to.equal(false);
      expect(
        responseBody.signing_public_key_list.find(
          ({ version }) =>
            version === idpNodeInfo.signing_public_key.version + 1
        )
      ).to.be.not.null;

      expect(responseBody.signing_master_public_key_list).to.have.lengthOf(
        idpNodePublicKeys.signing_master_public_key_list.length + 1
      );
      expect(
        responseBody.signing_master_public_key_list.find(
          ({ version }) =>
            version === idpNodeInfo.signing_master_public_key.version
        ).active
      ).to.equal(false);
      expect(
        responseBody.signing_master_public_key_list.find(
          ({ version }) =>
            version === idpNodeInfo.signing_master_public_key.version + 1
        )
      ).to.be.not.null;

      expect(responseBody.encryption_public_key_list).to.have.lengthOf(
        idpNodePublicKeys.encryption_public_key_list.length + 1
      );
      expect(
        responseBody.encryption_public_key_list.find(
          ({ version }) => version === idpNodeInfo.encryption_public_key.version
        ).active
      ).to.equal(false);
      expect(
        responseBody.encryption_public_key_list.find(
          ({ version }) =>
            version === idpNodeInfo.encryption_public_key.version + 1
        )
      ).to.be.not.null;
    });

    it("AS should update node's master key and public key with check_string, signed_check_string, master_signed_check_string successfully", async function () {
      this.timeout(30000);
      const check_string = 'AS test update public key and master public key';
      const response = await nodeApi.updateNode('as1', {
        reference_id: ASUpdateNodeReferenceId,
        callback_url: config.AS1_CALLBACK_URL,
        signing_public_key: ASPubKey,
        signing_key_algorithm: cryptoUtils.keyAlgorithm.EC,
        signing_algorithm: cryptoUtils.signatureAlgorithm.ECDSA_SHA_384.name,
        signing_master_public_key: ASMasterPubKey,
        signing_master_key_algorithm: cryptoUtils.keyAlgorithm.EC,
        signing_master_algorithm:
          cryptoUtils.signatureAlgorithm.ECDSA_SHA_384.name,
        encryption_public_key: ASEncryptionPubKey,
        encryption_key_algorithm: cryptoUtils.keyAlgorithm.RSA,
        encryption_algorithm:
          cryptoUtils.encryptionAlgorithm.RSAES_PKCS1_V1_5.name,
        check_string,
        signed_check_string: cryptoUtils
          .createSignature(
            cryptoUtils.signatureAlgorithm.ECDSA_SHA_384.name,
            Buffer.from(check_string, 'utf8'),
            ASPrivKey
          )
          .toString('base64'),
        master_signed_check_string: cryptoUtils
          .createSignature(
            cryptoUtils.signatureAlgorithm.ECDSA_SHA_384.name,
            Buffer.from(check_string, 'utf8'),
            ASMasterPrivKey
          )
          .toString('base64'),
      });
      expect(response.status).to.equal(202);

      const updateNodeResult = await ASUpdateNodeResultPromise.promise;
      expect(updateNodeResult.success).to.equal(true);

      kms.setNodeSigningKey(
        'as1',
        ASPrivKey,
        cryptoUtils.signatureAlgorithm.ECDSA_SHA_384
      );
      kms.setNodeSigningMasterKey(
        'as1',
        ASMasterPrivKey,
        cryptoUtils.signatureAlgorithm.ECDSA_SHA_384
      );
      kms.setNodeEncryptionKey(
        'as1',
        ASEncryptionPrivKey,
        cryptoUtils.encryptionAlgorithm.RSAES_PKCS1_V1_5
      );

      await wait(3000);
    });

    it("AS node's master key and public key should be updated successfully", async function () {
      this.timeout(15000);
      const response = await commonApi.getNodeInfo('as1');
      const responseBody = await response.json();
      expect(responseBody.role).to.equal('AS');
      expect(responseBody.signing_public_key).to.deep.include({
        public_key: ASPubKey,
        algorithm: cryptoUtils.signatureAlgorithm.ECDSA_SHA_384.name,
        version: asNodeInfo.signing_public_key.version + 1,
        active: true,
      });
      expect(responseBody.signing_master_public_key).to.deep.include({
        public_key: ASMasterPubKey,
        algorithm: cryptoUtils.signatureAlgorithm.ECDSA_SHA_384.name,
        version: asNodeInfo.signing_master_public_key.version + 1,
        active: true,
      });
      expect(responseBody.encryption_public_key).to.deep.include({
        public_key: ASEncryptionPubKey,
        algorithm: cryptoUtils.encryptionAlgorithm.RSAES_PKCS1_V1_5.name,
        version: asNodeInfo.encryption_public_key.version + 1,
        active: true,
      });
    });

    it("AS node's key list should be updated successfully", async function () {
      const response = await commonApi.getNodePublicKeys('as1');
      const responseBody = await response.json();
      expect(responseBody.signing_public_key_list).to.have.lengthOf(
        asNodePublicKeys.signing_public_key_list.length + 1
      );
      expect(
        responseBody.signing_public_key_list.find(
          ({ version }) => version === asNodeInfo.signing_public_key.version
        ).active
      ).to.equal(false);
      expect(
        responseBody.signing_public_key_list.find(
          ({ version }) => version === asNodeInfo.signing_public_key.version + 1
        )
      ).to.be.not.null;

      expect(responseBody.signing_master_public_key_list).to.have.lengthOf(
        asNodePublicKeys.signing_master_public_key_list.length + 1
      );
      expect(
        responseBody.signing_master_public_key_list.find(
          ({ version }) =>
            version === asNodeInfo.signing_master_public_key.version
        ).active
      ).to.equal(false);
      expect(
        responseBody.signing_master_public_key_list.find(
          ({ version }) =>
            version === asNodeInfo.signing_master_public_key.version + 1
        )
      ).to.be.not.null;

      expect(responseBody.encryption_public_key_list).to.have.lengthOf(
        asNodePublicKeys.encryption_public_key_list.length + 1
      );
      expect(
        responseBody.encryption_public_key_list.find(
          ({ version }) => version === asNodeInfo.encryption_public_key.version
        ).active
      ).to.equal(false);
      expect(
        responseBody.encryption_public_key_list.find(
          ({ version }) =>
            version === asNodeInfo.encryption_public_key.version + 1
        )
      ).to.be.not.null;
    });

    describe('Create identity tests after update node key', function () {
      it('Should create identity request (mode 3) successfully', async function () {
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
          accessor_public_key: userPublicKey,
          //accessor_id,
          ial: 2.3,
          lial: false,
          laal: false,
          mode: 3,
        });
        const responseBody = await response.json();
        expect(response.status).to.equal(202);
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
        expect(idpNode.mode_list).to.be.an('array').that.include(2, 3);

        db.idp1Identities.push({
          referenceGroupCode,
          mode: 3,
          namespace,
          identifier,
          accessors: [
            {
              accessorId,
              accessorPrivateKey: userPrivateKey,
              accessorPublicKey: userPublicKey,
            },
          ],
        });

        await wait(2000);
      });
    });

    describe('Create request tests after update node key', function () {
      let identityForResponse;
      let responseAccessorId;
      let requestMessagePaddedHash;

      let lastStatusUpdateBlockHeight;
      let initialSalt;
      let rp_node_id = 'rp1';
      let requester_node_id = 'rp1';
      let as_node_id = 'as1';
      let idpIdList;
      let dataRequestList;
      let idpResponseParams = [];
      let requestMessageHash;

      before(function () {
        const identity = db.idp1Identities.find(
          (identity) =>
            identity.namespace === namespace &&
            identity.identifier === identifier
        );

        if (!identity) {
          this.test.parent.pending = true;
          this.skip();
        }

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
          request_message:
            "Test request message (Test update node's master key and public key) (mode 3)",
          min_ial: 1.1,
          min_aal: 1,
          min_idp: 1,
          request_timeout: 86400,
          bypass_identity_check: false,
        };
      });
      it('RP should create a request successfully', async function () {
        this.timeout(30000);
        const response = await rpApi.createRequest('rp1', createRequestParams);
        const responseBody = await response.json();
        expect(response.status).to.equal(202);
        expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
        expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

        requestId = responseBody.request_id;
        initialSalt = responseBody.initial_salt;

        const createRequestResult = await createRequestResultPromise.promise;
        expect(createRequestResult.success).to.equal(true);
        expect(createRequestResult.creation_block_height).to.be.a('string');
        const splittedCreationBlockHeight =
          createRequestResult.creation_block_height.split(':');
        expect(splittedCreationBlockHeight).to.have.lengthOf(2);
        expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
        expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
        lastStatusUpdateBlockHeight = parseInt(splittedCreationBlockHeight[1]);

        [idpIdList, dataRequestList, requestMessageHash] = await Promise.all([
          createIdpIdList({
            createRequestParams,
            callRpApiAtNodeId: rp_node_id,
          }),
          createDataRequestList({
            createRequestParams,
            requestId,
            initialSalt,
            callRpApiAtNodeId: rp_node_id,
          }),
          createRequestMessageHash({
            createRequestParams,
            initialSalt,
          }),
        ]); // create idp_id_list, as_id_list, request_message_hash for test
      });

      it('IdP should receive incoming request callback', async function () {
        this.timeout(15000);
        const incomingRequest = await incomingRequestPromise.promise;

        const dataRequestListWithoutParams =
          createRequestParams.data_request_list.map((dataRequest) => {
            const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
            return {
              ...dataRequestWithoutParams,
            };
          });
        expect(incomingRequest).to.deep.include({
          mode: createRequestParams.mode,
          request_id: requestId,
          request_message: createRequestParams.request_message,
          request_message_hash: hash(
            createRequestParams.request_message +
              incomingRequest.request_message_salt
          ),
          requester_node_id: 'rp1',
          min_ial: createRequestParams.min_ial,
          min_aal: createRequestParams.min_aal,
          data_request_list: dataRequestListWithoutParams,
        });

        expect(incomingRequest.reference_group_code).to.be.a('string').that.is
          .not.empty;
        expect(incomingRequest.request_message_salt).to.be.a('string').that.is
          .not.empty;
        expect(incomingRequest.creation_time).to.be.a('number');
        expect(incomingRequest.creation_block_height).to.be.a('string');
        const splittedCreationBlockHeight =
          incomingRequest.creation_block_height.split(':');
        expect(splittedCreationBlockHeight).to.have.lengthOf(2);
        expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
        expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);

        requestMessageHash = incomingRequest.request_message_hash;
      });

      it('IdP should get request_message_padded_hash successfully', async function () {
        this.timeout(15000);
        identityForResponse = db.idp1Identities.find(
          (identity) =>
            identity.namespace === namespace &&
            identity.identifier === identifier
        );

        responseAccessorId = identityForResponse.accessors[0].accessorId;
        let accessorPublicKey =
          identityForResponse.accessors[0].accessorPublicKey;

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

      it('IdP should create response (accept) successfully', async function () {
        this.timeout(20000);

        let accessorPrivateKey =
          identityForResponse.accessors[0].accessorPrivateKey;

        const signature = createResponseSignature(
          accessorPrivateKey,
          requestMessagePaddedHash
        );

        let idpResponse = {
          reference_id: idpReferenceId,
          callback_url: config.IDP1_CALLBACK_URL,
          request_id: requestId,
          ial: 2.3,
          aal: 3,
          status: 'accept',
          accessor_id: responseAccessorId,
          signature,
        };

        idpResponseParams.push({
          ...idpResponse,
          idp_id: 'idp1',
          valid_signature: true,
          valid_ial: true,
        });

        const response = await idpApi.createResponse('idp1', idpResponse);
        expect(response.status).to.equal(202);
      });

      // it('IdP should receive accessor encrypt callback with correct data', async function() {
      //   this.timeout(15000);

      //   const accessorEncryptParams = await accessorEncryptPromise.promise;
      //   expect(accessorEncryptParams).to.deep.include({
      //     node_id: 'idp1',
      //     type: 'accessor_encrypt',
      //     accessor_id: responseAccessorId,
      //     key_type: 'RSA',
      //     padding: 'none',
      //     reference_id: idpReferenceId,
      //     request_id: requestId,
      //   });

      //   expect(accessorEncryptParams.request_message_padded_hash).to.be.a(
      //     'string',
      //   ).that.is.not.empty;
      // });

      it('IdP should receive callback create response result with success = true', async function () {
        const responseResult = await responseResultPromise.promise;
        expect(responseResult).to.deep.include({
          node_id: 'idp1',
          type: 'response_result',
          reference_id: idpReferenceId,
          request_id: requestId,
          success: true,
        });
      });

      it('AS should receive data request', async function () {
        this.timeout(20000);
        const dataRequest = await dataRequestReceivedPromise.promise;
        expect(dataRequest).to.deep.include({
          request_id: requestId,
          mode: createRequestParams.mode,
          namespace,
          identifier,
          service_id: createRequestParams.data_request_list[0].service_id,
          request_params:
            createRequestParams.data_request_list[0].request_params,
          max_ial: 2.3,
          max_aal: 3,
          requester_node_id: 'rp1',
        });
        expect(dataRequest.response_signature_list).to.have.lengthOf(1);
        expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is
          .not.empty;
      });

      it('AS should send data successfully', async function () {
        this.timeout(20000);
        const response = await asApi.sendData('as1', {
          requestId,
          serviceId: createRequestParams.data_request_list[0].service_id,
          reference_id: asReferenceId,
          callback_url: config.AS1_CALLBACK_URL,
          data: "Test update node's master key and public key",
        });
        expect(response.status).to.equal(202);

        const sendDataResult = await sendDataResultPromise.promise;
        expect(sendDataResult).to.deep.include({
          reference_id: asReferenceId,
          success: true,
        });

        dataRequestList = setDataSigned(
          dataRequestList,
          createRequestParams.data_request_list[0].service_id,
          as_node_id
        );

        dataRequestList = setDataReceived(
          dataRequestList,
          createRequestParams.data_request_list[0].service_id,
          as_node_id
        );
      });

      it('RP should receive request closed status', async function () {
        this.timeout(25000);

        const testResult = await receiveRequestClosedStatusTest({
          nodeId: rp_node_id,
          requestClosedPromise,
          requestId,
          createRequestParams,
          dataRequestList,
          idpResponse: idpResponseParams,
          requestMessageHash,
          idpIdList,
          lastStatusUpdateBlockHeight,
          requesterNodeId: requester_node_id,
        });
        lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;

        // const requestStatus = await requestClosedPromise.promise;
        // expect(requestStatus).to.deep.include({
        //   request_id: requestId,
        //   status: 'completed',
        //   mode: createRequestParams.mode,
        //   min_idp: createRequestParams.min_idp,
        //   answered_idp_count: 1,
        //   closed: true,
        //   timed_out: false,
        //   service_list: [
        //     {
        //       service_id: createRequestParams.data_request_list[0].service_id,
        //       min_as: createRequestParams.data_request_list[0].min_as,
        //       signed_data_count: 1,
        //       received_data_count: 1,
        //     },
        //   ],
        //   response_valid_list: [
        //     {
        //       idp_id: 'idp1',
        //       valid_signature: true,
        //       valid_ial: true,
        //     },
        //   ],
        // });
        // expect(requestStatus).to.have.property('block_height');
        // expect(requestStatus.block_height).is.a('string');
        // const splittedBlockHeight = requestStatus.block_height.split(':');
        // expect(splittedBlockHeight).to.have.lengthOf(2);
        // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
        // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
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

      const idpReferenceId = generateReferenceId();
      const idpResultPromise = createEventPromise();

      const asReferenceId = generateReferenceId();
      const asResultPromise = createEventPromise();

      rpEventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'update_node_result' &&
          callbackData.reference_id === rpReferenceId
        ) {
          rpResultPromise.resolve(callbackData);
        }
      });

      idp1EventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'update_node_result' &&
          callbackData.reference_id === idpReferenceId
        ) {
          idpResultPromise.resolve(callbackData);
        }
      });

      as1EventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'update_node_result' &&
          callbackData.reference_id === asReferenceId
        ) {
          asResultPromise.resolve(callbackData);
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

      // idp1

      originalNodeSigningKey = kms.getOriginalNodeSigningKey('idp1');
      originalNodeSigningMasterKey =
        kms.getOriginalNodeSigningMasterKey('idp1');
      originalNodeEncryptionKey = kms.getOriginalNodeEncryptionKey('idp1');

      await nodeApi.updateNode('idp1', {
        reference_id: idpReferenceId,
        callback_url: config.IDP1_CALLBACK_URL,
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

      await idpResultPromise.promise;

      kms.setNodeSigningKey(
        'idp1',
        originalNodeSigningKey.privateKey,
        originalNodeSigningKey.signingAlgorithm
      );
      kms.setNodeSigningMasterKey(
        'idp1',
        originalNodeSigningMasterKey.privateKey,
        originalNodeSigningMasterKey.signingAlgorithm
      );
      kms.setNodeEncryptionKey(
        'idp1',
        originalNodeEncryptionKey.privateKey,
        originalNodeEncryptionKey.encryptionAlgorithm
      );

      // as1

      originalNodeSigningKey = kms.getOriginalNodeSigningKey('as1');
      originalNodeSigningMasterKey = kms.getOriginalNodeSigningMasterKey('as1');
      originalNodeEncryptionKey = kms.getOriginalNodeEncryptionKey('as1');

      await nodeApi.updateNode('as1', {
        reference_id: asReferenceId,
        callback_url: config.AS1_CALLBACK_URL,
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

      await asResultPromise.promise;

      kms.setNodeSigningKey(
        'as1',
        originalNodeSigningKey.privateKey,
        originalNodeSigningKey.signingAlgorithm
      );
      kms.setNodeSigningMasterKey(
        'as1',
        originalNodeSigningMasterKey.privateKey,
        originalNodeSigningMasterKey.signingAlgorithm
      );
      kms.setNodeEncryptionKey(
        'as1',
        originalNodeEncryptionKey.privateKey,
        originalNodeEncryptionKey.encryptionAlgorithm
      );

      rpEventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
      as1EventEmitter.removeAllListeners('callback');
    });
  });
});
