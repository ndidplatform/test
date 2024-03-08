import crypto from 'crypto';
import { expect } from 'chai';

import { ndidEventEmitter } from '../../../callback_server';
import * as nodeApi from '../../../api/v5/node';
import * as nodeApiV6 from '../../../api/v6/node';
import * as commonApi from '../../../api/v5/common';
import * as commonApiV6 from '../../../api/v6/common';
import * as apiHelpers from '../../../api/helpers';
import { createEventPromise, generateReferenceId } from '../../../utils';
import * as cryptoUtils from '../../../utils/crypto';

import { ndidAvailable } from '../..';
import * as config from '../../../config';

import * as kms from '../../../callback_server/kms';

describe('NDID update node keys test', function () {
  const keypair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const privateKey = keypair.privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  });
  const publicKey = keypair.publicKey.export({
    type: 'spki',
    format: 'pem',
  });

  const masterKeypair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const masterPrivateKey = masterKeypair.privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  });
  const masterPublicKey = masterKeypair.publicKey.export({
    type: 'spki',
    format: 'pem',
  });

  const NDIDUpdateNodeReferenceId = generateReferenceId();

  const NDIDUpdateNodeResultPromise = createEventPromise();

  ndidEventEmitter.on('callback', function (callbackData) {
    if (
      callbackData.type === 'update_node_result' &&
      callbackData.reference_id === NDIDUpdateNodeReferenceId
    ) {
      NDIDUpdateNodeResultPromise.resolve(callbackData);
    }
  });

  let nodeInfo;
  let nodePublicKeys;

  before(async function () {
    if (!ndidAvailable) {
      this.skip();
    }

    let response;

    response = await apiHelpers.getResponseAndBody(
      commonApiV6.getNodeInfo('ndid1')
    );
    nodeInfo = response.responseBody;

    response = await apiHelpers.getResponseAndBody(
      commonApiV6.getNodePublicKeys('ndid1')
    );
    nodePublicKeys = response.responseBody;
  });

  it("NDID should update node's master key and public key with check_string, signed_check_string, master_signed_check_string successfully", async function () {
    this.timeout(15000);
    const check_string = 'NDID test update public key and master public key';
    const response = await nodeApi.updateNode('ndid1', {
      reference_id: NDIDUpdateNodeReferenceId,
      callback_url: config.NDID_CALLBACK_URL,
      node_key: publicKey,
      node_key_type: cryptoUtils.keyAlgorithm.RSA,
      node_master_key: masterPublicKey,
      node_master_key_type: cryptoUtils.keyAlgorithm.RSA,
      check_string,
      signed_check_string: cryptoUtils
        .createSignature(
          cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256.name,
          Buffer.from(check_string, 'utf8'),
          privateKey
        )
        .toString('base64'),
      master_signed_check_string: cryptoUtils
        .createSignature(
          cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256.name,
          Buffer.from(check_string, 'utf8'),
          masterPrivateKey
        )
        .toString('base64'),
    });
    expect(response.status).to.equal(202);

    const updateNodeResult = await NDIDUpdateNodeResultPromise.promise;
    expect(updateNodeResult.success).to.equal(true);

    kms.setNodeSigningKey(
      'ndid1',
      privateKey,
      cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256
    );
    kms.setNodeSigningMasterKey(
      'ndid1',
      masterPrivateKey,
      cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256
    );
    kms.setNodeEncryptionKey(
      'ndid1',
      privateKey,
      cryptoUtils.encryptionAlgorithm.RSAES_PKCS1_V1_5
    );
  });

  it("NDID node's keys should be updated successfully", async function () {
    let response;
    let responseBody;
    response = await commonApi.getNodeInfo('ndid1');
    responseBody = await response.json();
    expect(responseBody.node_name).to.equal('NDID');
    expect(responseBody.role).to.equal('NDID');
    expect(responseBody.public_key).to.equal(publicKey);
    expect(responseBody.master_public_key).to.equal(masterPublicKey);

    // API v6
    response = await commonApiV6.getNodeInfo('ndid1');
    responseBody = await response.json();
    expect(responseBody.signing_public_key).to.deep.include({
      public_key: publicKey,
      algorithm: cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256.name,
      version: nodeInfo.signing_public_key.version + 1,
      active: true,
    });
    expect(responseBody.signing_master_public_key).to.deep.include({
      public_key: masterPublicKey,
      algorithm: cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256.name,
      version: nodeInfo.signing_master_public_key.version + 1,
      active: true,
    });
    expect(responseBody.encryption_public_key).to.deep.include({
      public_key: publicKey,
      algorithm: cryptoUtils.encryptionAlgorithm.RSAES_PKCS1_V1_5.name,
      version: nodeInfo.encryption_public_key.version + 1,
      active: true,
    });
  });

  it("NDID node's key list should be updated successfully", async function () {
    const response = await commonApiV6.getNodePublicKeys('ndid1');
    const responseBody = await response.json();
    expect(responseBody.signing_public_key_list).to.have.lengthOf(
      nodePublicKeys.signing_public_key_list.length + 1
    );
    expect(
      responseBody.signing_public_key_list.find(
        ({ version }) => version === nodeInfo.signing_public_key.version
      ).active
    ).to.equal(false);
    expect(
      responseBody.signing_public_key_list.find(
        ({ version }) => version === nodeInfo.signing_public_key.version + 1
      )
    ).to.be.not.null;

    expect(responseBody.signing_master_public_key_list).to.have.lengthOf(
      nodePublicKeys.signing_master_public_key_list.length + 1
    );
    expect(
      responseBody.signing_master_public_key_list.find(
        ({ version }) => version === nodeInfo.signing_master_public_key.version
      ).active
    ).to.equal(false);
    expect(
      responseBody.signing_master_public_key_list.find(
        ({ version }) =>
          version === nodeInfo.signing_master_public_key.version + 1
      )
    ).to.be.not.null;

    expect(responseBody.encryption_public_key_list).to.have.lengthOf(
      nodePublicKeys.encryption_public_key_list.length + 1
    );
    expect(
      responseBody.encryption_public_key_list.find(
        ({ version }) => version === nodeInfo.encryption_public_key.version
      ).active
    ).to.equal(false);
    expect(
      responseBody.encryption_public_key_list.find(
        ({ version }) => version === nodeInfo.encryption_public_key.version + 1
      )
    ).to.be.not.null;
  });

  after(async function () {
    this.timeout(10000);
    // set node keys back to original
    const originalNodeSigningKey = kms.getOriginalNodeSigningKey('ndid1');
    const originalNodeSigningMasterKey =
      kms.getOriginalNodeSigningMasterKey('ndid1');
    const originalNodeEncryptionKey = kms.getOriginalNodeEncryptionKey('ndid1');

    const referenceId = generateReferenceId();

    const resultPromise = createEventPromise();

    ndidEventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'update_node_result' &&
        callbackData.reference_id === referenceId
      ) {
        resultPromise.resolve(callbackData);
      }
    });

    const response = await nodeApiV6.updateNode('ndid1', {
      reference_id: referenceId,
      callback_url: config.NDID_CALLBACK_URL,
      signing_public_key: originalNodeSigningKey.publicKey,
      signing_key_algorithm: originalNodeSigningKey.keyAlgorithm,
      signing_algorithm: originalNodeSigningKey.signingAlgorithm.name,
      signing_master_public_key: originalNodeSigningMasterKey.publicKey,
      signing_master_key_algorithm: originalNodeSigningMasterKey.keyAlgorithm,
      signing_master_algorithm:
        originalNodeSigningMasterKey.signingAlgorithm.name,
      encryption_public_key: originalNodeEncryptionKey.publicKey,
      encryption_key_algorithm: originalNodeEncryptionKey.keyAlgorithm,
      encryption_algorithm: originalNodeEncryptionKey.encryptionAlgorithm.name,
    });

    // const updateNodeResult = await resultPromise.promise;
    await resultPromise.promise;

    kms.setNodeSigningKey(
      'ndid1',
      originalNodeSigningKey.privateKey,
      originalNodeSigningKey.signingAlgorithm
    );
    kms.setNodeSigningMasterKey(
      'ndid1',
      originalNodeSigningMasterKey.privateKey,
      originalNodeSigningMasterKey.signingAlgorithm
    );
    kms.setNodeEncryptionKey(
      'ndid1',
      originalNodeEncryptionKey.privateKey,
      originalNodeEncryptionKey.encryptionAlgorithm
    );

    ndidEventEmitter.removeAllListeners('callback');
  });
});
