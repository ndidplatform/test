import crypto from 'crypto';
import { expect } from 'chai';

import * as nodeApi from '../../../api/v6/node';
import { generateReferenceId, createSignature } from '../../../utils';
import * as cryptoUtils from '../../../utils/crypto';
import * as config from '../../../config';

describe('Update node key error response tests', function () {
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

  const RPMasterKeypair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const RPMasterPrivKey = RPMasterKeypair.privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  });
  const RPMasterPubKey = RPMasterKeypair.publicKey.export({
    type: 'spki',
    format: 'pem',
  });

  const RPUpdateNodeReferenceId = generateReferenceId();

  it("RP should get an error when update node's public key with signed check string mismatched", async function () {
    this.timeout(30000);
    const check_string = 'RP test update public key';
    const response = await nodeApi.updateNode('rp1', {
      reference_id: RPUpdateNodeReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      signing_public_key: RPPubKey,
      signing_key_algorithm: cryptoUtils.keyAlgorithm.RSA,
      signing_algorithm:
        cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256.name,
      check_string,
      signed_check_string: cryptoUtils
        .createSignature(
          cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256.name,
          Buffer.from('invalid check_string', 'utf8'),
          RPPrivKey
        )
        .toString('base64'),
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20063);
  });

  it("RP should get an error when update node's public key with master signed check string mismatched", async function () {
    this.timeout(30000);
    const check_string = 'RP test update master public key';
    const response = await nodeApi.updateNode('rp1', {
      reference_id: RPUpdateNodeReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      signing_master_public_key: RPMasterPubKey,
      signing_master_key_algorithm: cryptoUtils.keyAlgorithm.RSA,
      signing_master_algorithm:
        cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256.name,
      check_string,
      master_signed_check_string: cryptoUtils
        .createSignature(
          cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256.name,
          Buffer.from('invalid check_string', 'utf8'),
          RPMasterPrivKey
        )
        .toString('base64'),
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20064);
  });
});
