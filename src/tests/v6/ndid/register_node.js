import crypto from 'crypto';
import { expect } from 'chai';

import * as ndidApi from '../../../api/v6/ndid';
import * as commonApi from '../../../api/v6/common';
import { randomString } from '../../../utils/random';
import * as cryptoUtils from '../../../utils/crypto';
import { ndidAvailable } from '../..';

describe('Register node', function () {
  const keypairRSA2048 = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const publicKeyRSA2048 = keypairRSA2048.publicKey.export({
    type: 'spki',
    format: 'pem',
  });

  const keypairRSA3072 = crypto.generateKeyPairSync('rsa', {
    modulusLength: 3072,
  });
  const publicKeyRSA3072 = keypairRSA3072.publicKey.export({
    type: 'spki',
    format: 'pem',
  });

  const keypairRSA4096 = crypto.generateKeyPairSync('rsa', {
    modulusLength: 4096,
  });
  const publicKeyRSA4096 = keypairRSA4096.publicKey.export({
    type: 'spki',
    format: 'pem',
  });

  const keypairECP256 = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const publicKeyECP256 = keypairECP256.publicKey.export({
    type: 'spki',
    format: 'pem',
  });

  const keypairECP384 = crypto.generateKeyPairSync('ec', {
    namedCurve: 'secp384r1',
  });
  const publicKeyECP384 = keypairECP384.publicKey.export({
    type: 'spki',
    format: 'pem',
  });

  // const keypairECP256K1 = crypto.generateKeyPairSync('ec', {
  //   namedCurve: 'secp256k1',
  // });
  // const publicKeyECP256K1 = keypairECP256K1.publicKey.export({
  //   type: 'spki',
  //   format: 'pem',
  // });

  const keypairEd25119 = crypto.generateKeyPairSync('ed25519');
  const publicKeyEd25119 = keypairEd25119.publicKey.export({
    type: 'spki',
    format: 'pem',
  });

  before(function () {
    if (!ndidAvailable) {
      this.skip();
    }
  });

  const node1Id = 'node_key_test_1' + '_' + randomString(5);
  const node1Name =
    'Test node key RSA-2048, sig: PKCS1v1.5 SHA256, enc: PKCS1v1.5';
  it('NDID should register node (RSA-2048, sig: PKCS1v1.5 SHA256, enc: PKCS1v1.5) successfully', async function () {
    this.timeout(10000);
    const response = await ndidApi.registerNode('ndid1', {
      node_id: node1Id,
      node_name: node1Name,
      signing_public_key: publicKeyRSA2048,
      signing_key_algorithm: cryptoUtils.keyAlgorithm.RSA,
      signing_algorithm:
        cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256.name,
      signing_master_public_key: publicKeyRSA2048,
      signing_master_key_algorithm: cryptoUtils.keyAlgorithm.RSA,
      signing_master_algorithm:
        cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256.name,
      encryption_public_key: publicKeyRSA2048,
      encryption_key_algorithm: cryptoUtils.keyAlgorithm.RSA,
      encryption_algorithm:
        cryptoUtils.encryptionAlgorithm.RSAES_PKCS1_V1_5.name,
      role: 'rp',
    });
    expect(response.status).to.equal(201);
  });

  it('Node (RSA-2048, sig: PKCS1v1.5 SHA256, enc: PKCS1v1.5) should be registered successfully', async function () {
    const response = await commonApi.getNodeInfo('ndid1', {
      node_id: node1Id,
    });
    const responseBody = await response.json();
    expect(responseBody.node_name).to.equal(node1Name);
    expect(responseBody.role).to.equal('RP');

    expect(responseBody.signing_public_key.public_key).to.equal(
      publicKeyRSA2048
    );
    expect(responseBody.signing_public_key.algorithm).to.equal(
      cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256.name
    );

    expect(responseBody.signing_master_public_key.public_key).to.equal(
      publicKeyRSA2048
    );
    expect(responseBody.signing_master_public_key.algorithm).to.equal(
      cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256.name
    );

    expect(responseBody.encryption_public_key.public_key).to.equal(
      publicKeyRSA2048
    );
    expect(responseBody.encryption_public_key.algorithm).to.equal(
      cryptoUtils.encryptionAlgorithm.RSAES_PKCS1_V1_5.name
    );
  });

  const node2Id = 'node_key_test_2' + '_' + randomString(5);
  const node2Name =
    'Test node key RSA-2048, sig: PKCS1v1.5 SHA384, enc: PKCS1v1.5';
  it('NDID should register node (RSA-2048, sig: PKCS1v1.5 SHA384, enc: PKCS1v1.5) successfully', async function () {
    this.timeout(10000);
    const response = await ndidApi.registerNode('ndid1', {
      node_id: node2Id,
      node_name: node2Name,
      signing_public_key: publicKeyRSA2048,
      signing_key_algorithm: cryptoUtils.keyAlgorithm.RSA,
      signing_algorithm:
        cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_384.name,
      signing_master_public_key: publicKeyRSA2048,
      signing_master_key_algorithm: cryptoUtils.keyAlgorithm.RSA,
      signing_master_algorithm:
        cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_384.name,
      encryption_public_key: publicKeyRSA2048,
      encryption_key_algorithm: cryptoUtils.keyAlgorithm.RSA,
      encryption_algorithm:
        cryptoUtils.encryptionAlgorithm.RSAES_PKCS1_V1_5.name,
      role: 'rp',
    });
    expect(response.status).to.equal(201);
  });

  it('Node (RSA-2048, sig: PKCS1v1.5 SHA384, enc: PKCS1v1.5) should be registered successfully', async function () {
    const response = await commonApi.getNodeInfo('ndid1', {
      node_id: node2Id,
    });
    const responseBody = await response.json();
    expect(responseBody.node_name).to.equal(node2Name);
    expect(responseBody.role).to.equal('RP');

    expect(responseBody.signing_public_key.public_key).to.equal(
      publicKeyRSA2048
    );
    expect(responseBody.signing_public_key.algorithm).to.equal(
      cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_384.name
    );

    expect(responseBody.signing_master_public_key.public_key).to.equal(
      publicKeyRSA2048
    );
    expect(responseBody.signing_master_public_key.algorithm).to.equal(
      cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_384.name
    );

    expect(responseBody.encryption_public_key.public_key).to.equal(
      publicKeyRSA2048
    );
    expect(responseBody.encryption_public_key.algorithm).to.equal(
      cryptoUtils.encryptionAlgorithm.RSAES_PKCS1_V1_5.name
    );
  });

  const node3Id = 'node_key_test_3' + '_' + randomString(5);
  const node3Name = 'Test node key RSA-2048, sig: PSS SHA256, enc: OAEP SHA1';
  it('NDID should register node (RSA-2048, sig: PSS SHA256, enc: OAEP SHA1) successfully', async function () {
    this.timeout(10000);
    const response = await ndidApi.registerNode('ndid1', {
      node_id: node3Id,
      node_name: node3Name,
      signing_public_key: publicKeyRSA2048,
      signing_key_algorithm: cryptoUtils.keyAlgorithm.RSA,
      signing_algorithm: cryptoUtils.signatureAlgorithm.RSASSA_PSS_SHA_256.name,
      signing_master_public_key: publicKeyRSA2048,
      signing_master_key_algorithm: cryptoUtils.keyAlgorithm.RSA,
      signing_master_algorithm:
        cryptoUtils.signatureAlgorithm.RSASSA_PSS_SHA_256.name,
      encryption_public_key: publicKeyRSA2048,
      encryption_key_algorithm: cryptoUtils.keyAlgorithm.RSA,
      encryption_algorithm:
        cryptoUtils.encryptionAlgorithm.RSAES_OAEP_SHA_1.name,
      role: 'rp',
    });
    expect(response.status).to.equal(201);
  });

  it('Node (RSA-2048, sig: PSS SHA256, enc: OAEP SHA1) should be registered successfully', async function () {
    const response = await commonApi.getNodeInfo('ndid1', {
      node_id: node3Id,
    });
    const responseBody = await response.json();
    expect(responseBody.node_name).to.equal(node3Name);
    expect(responseBody.role).to.equal('RP');

    expect(responseBody.signing_public_key.public_key).to.equal(
      publicKeyRSA2048
    );
    expect(responseBody.signing_public_key.algorithm).to.equal(
      cryptoUtils.signatureAlgorithm.RSASSA_PSS_SHA_256.name
    );

    expect(responseBody.signing_master_public_key.public_key).to.equal(
      publicKeyRSA2048
    );
    expect(responseBody.signing_master_public_key.algorithm).to.equal(
      cryptoUtils.signatureAlgorithm.RSASSA_PSS_SHA_256.name
    );

    expect(responseBody.encryption_public_key.public_key).to.equal(
      publicKeyRSA2048
    );
    expect(responseBody.encryption_public_key.algorithm).to.equal(
      cryptoUtils.encryptionAlgorithm.RSAES_OAEP_SHA_1.name
    );
  });

  const node4Id = 'node_key_test_4' + '_' + randomString(5);
  const node4Name =
    'Test node key EC secp256r1/prime256v1, sig: SHA256, enc: OAEP SHA1';
  it('NDID should register node (EC secp256r1/prime256v1, sig: SHA256, enc: OAEP SHA1) successfully', async function () {
    this.timeout(10000);
    const response = await ndidApi.registerNode('ndid1', {
      node_id: node4Id,
      node_name: node4Name,
      signing_public_key: publicKeyECP256,
      signing_key_algorithm: cryptoUtils.keyAlgorithm.EC,
      signing_algorithm: cryptoUtils.signatureAlgorithm.ECDSA_SHA_256.name,
      signing_master_public_key: publicKeyECP256,
      signing_master_key_algorithm: cryptoUtils.keyAlgorithm.EC,
      signing_master_algorithm:
        cryptoUtils.signatureAlgorithm.ECDSA_SHA_256.name,
      encryption_public_key: publicKeyRSA2048,
      encryption_key_algorithm: cryptoUtils.keyAlgorithm.RSA,
      encryption_algorithm:
        cryptoUtils.encryptionAlgorithm.RSAES_OAEP_SHA_1.name,
      role: 'rp',
    });
    expect(response.status).to.equal(201);
  });

  it('Node (EC secp256r1/prime256v1, sig: SHA256, enc: OAEP SHA1) should be registered successfully', async function () {
    const response = await commonApi.getNodeInfo('ndid1', {
      node_id: node4Id,
    });
    const responseBody = await response.json();
    expect(responseBody.node_name).to.equal(node4Name);
    expect(responseBody.role).to.equal('RP');

    expect(responseBody.signing_public_key.public_key).to.equal(
      publicKeyECP256
    );
    expect(responseBody.signing_public_key.algorithm).to.equal(
      cryptoUtils.signatureAlgorithm.ECDSA_SHA_256.name
    );

    expect(responseBody.signing_master_public_key.public_key).to.equal(
      publicKeyECP256
    );
    expect(responseBody.signing_master_public_key.algorithm).to.equal(
      cryptoUtils.signatureAlgorithm.ECDSA_SHA_256.name
    );

    expect(responseBody.encryption_public_key.public_key).to.equal(
      publicKeyRSA2048
    );
    expect(responseBody.encryption_public_key.algorithm).to.equal(
      cryptoUtils.encryptionAlgorithm.RSAES_OAEP_SHA_1.name
    );
  });

  const node5Id = 'node_key_test_5' + '_' + randomString(5);
  const node5Name = 'Test node key EC secp384r1, sig: SHA256, enc: OAEP SHA1';
  it('NDID should register node (EC secp384r1, sig: SHA384, enc: OAEP SHA1) successfully', async function () {
    this.timeout(10000);
    const response = await ndidApi.registerNode('ndid1', {
      node_id: node5Id,
      node_name: node5Name,
      signing_public_key: publicKeyECP384,
      signing_key_algorithm: cryptoUtils.keyAlgorithm.EC,
      signing_algorithm: cryptoUtils.signatureAlgorithm.ECDSA_SHA_384.name,
      signing_master_public_key: publicKeyECP384,
      signing_master_key_algorithm: cryptoUtils.keyAlgorithm.EC,
      signing_master_algorithm:
        cryptoUtils.signatureAlgorithm.ECDSA_SHA_384.name,
      encryption_public_key: publicKeyRSA2048,
      encryption_key_algorithm: cryptoUtils.keyAlgorithm.RSA,
      encryption_algorithm:
        cryptoUtils.encryptionAlgorithm.RSAES_OAEP_SHA_1.name,
      role: 'rp',
    });
    expect(response.status).to.equal(201);
  });

  it('Node (EC secp384r1, sig: SHA384, enc: OAEP SHA1) should be registered successfully', async function () {
    const response = await commonApi.getNodeInfo('ndid1', {
      node_id: node5Id,
    });
    const responseBody = await response.json();
    expect(responseBody.node_name).to.equal(node5Name);
    expect(responseBody.role).to.equal('RP');

    expect(responseBody.signing_public_key.public_key).to.equal(
      publicKeyECP384
    );
    expect(responseBody.signing_public_key.algorithm).to.equal(
      cryptoUtils.signatureAlgorithm.ECDSA_SHA_384.name
    );

    expect(responseBody.signing_master_public_key.public_key).to.equal(
      publicKeyECP384
    );
    expect(responseBody.signing_master_public_key.algorithm).to.equal(
      cryptoUtils.signatureAlgorithm.ECDSA_SHA_384.name
    );

    expect(responseBody.encryption_public_key.public_key).to.equal(
      publicKeyRSA2048
    );
    expect(responseBody.encryption_public_key.algorithm).to.equal(
      cryptoUtils.encryptionAlgorithm.RSAES_OAEP_SHA_1.name
    );
  });

  const node6Id = 'node_key_test_6' + '_' + randomString(5);
  const node6Name = 'Test node key Ed25519, sig: SHA256, enc: OAEP SHA1';
  it('NDID should register node (Ed25519, sig: Ed25519, enc: OAEP SHA1) successfully', async function () {
    this.timeout(10000);
    const response = await ndidApi.registerNode('ndid1', {
      node_id: node6Id,
      node_name: node6Name,
      signing_public_key: publicKeyEd25119,
      signing_key_algorithm: cryptoUtils.keyAlgorithm.Ed25519,
      signing_algorithm: cryptoUtils.signatureAlgorithm.Ed25519.name,
      signing_master_public_key: publicKeyEd25119,
      signing_master_key_algorithm: cryptoUtils.keyAlgorithm.Ed25519,
      signing_master_algorithm: cryptoUtils.signatureAlgorithm.Ed25519.name,
      encryption_public_key: publicKeyRSA2048,
      encryption_key_algorithm: cryptoUtils.keyAlgorithm.RSA,
      encryption_algorithm:
        cryptoUtils.encryptionAlgorithm.RSAES_OAEP_SHA_1.name,
      role: 'rp',
    });
    expect(response.status).to.equal(201);
  });

  it('Node (Ed25519, sig: Ed25519, enc: OAEP SHA1) should be registered successfully', async function () {
    const response = await commonApi.getNodeInfo('ndid1', {
      node_id: node6Id,
    });
    const responseBody = await response.json();
    expect(responseBody.node_name).to.equal(node6Name);
    expect(responseBody.role).to.equal('RP');

    expect(responseBody.signing_public_key.public_key).to.equal(
      publicKeyEd25119
    );
    expect(responseBody.signing_public_key.algorithm).to.equal(
      cryptoUtils.signatureAlgorithm.Ed25519.name
    );

    expect(responseBody.signing_master_public_key.public_key).to.equal(
      publicKeyEd25119
    );
    expect(responseBody.signing_master_public_key.algorithm).to.equal(
      cryptoUtils.signatureAlgorithm.Ed25519.name
    );

    expect(responseBody.encryption_public_key.public_key).to.equal(
      publicKeyRSA2048
    );
    expect(responseBody.encryption_public_key.algorithm).to.equal(
      cryptoUtils.encryptionAlgorithm.RSAES_OAEP_SHA_1.name
    );
  });

  const node7Id = 'node_key_test_7' + '_' + randomString(5);
  const node7Name = 'Test node key different key algorithm';
  it('NDID should register node (sig: EC secp256r1, sig master: Ed25519, enc: OAEP SHA256) successfully', async function () {
    this.timeout(10000);
    const response = await ndidApi.registerNode('ndid1', {
      node_id: node7Id,
      node_name: node7Name,
      signing_public_key: publicKeyECP256,
      signing_key_algorithm: cryptoUtils.keyAlgorithm.EC,
      signing_algorithm: cryptoUtils.signatureAlgorithm.ECDSA_SHA_256.name,
      signing_master_public_key: publicKeyEd25119,
      signing_master_key_algorithm: cryptoUtils.keyAlgorithm.Ed25519,
      signing_master_algorithm: cryptoUtils.signatureAlgorithm.Ed25519.name,
      encryption_public_key: publicKeyRSA3072,
      encryption_key_algorithm: cryptoUtils.keyAlgorithm.RSA,
      encryption_algorithm:
        cryptoUtils.encryptionAlgorithm.RSAES_OAEP_SHA_256.name,
      role: 'rp',
    });
    expect(response.status).to.equal(201);
  });

  it('Node (sig: EC secp256r1, sig master: Ed25519, enc: OAEP SHA256) should be registered successfully', async function () {
    const response = await commonApi.getNodeInfo('ndid1', {
      node_id: node7Id,
    });
    const responseBody = await response.json();
    expect(responseBody.node_name).to.equal(node7Name);
    expect(responseBody.role).to.equal('RP');

    expect(responseBody.signing_public_key.public_key).to.equal(
      publicKeyECP256
    );
    expect(responseBody.signing_public_key.algorithm).to.equal(
      cryptoUtils.signatureAlgorithm.ECDSA_SHA_256.name
    );

    expect(responseBody.signing_master_public_key.public_key).to.equal(
      publicKeyEd25119
    );
    expect(responseBody.signing_master_public_key.algorithm).to.equal(
      cryptoUtils.signatureAlgorithm.Ed25519.name
    );

    expect(responseBody.encryption_public_key.public_key).to.equal(
      publicKeyRSA3072
    );
    expect(responseBody.encryption_public_key.algorithm).to.equal(
      cryptoUtils.encryptionAlgorithm.RSAES_OAEP_SHA_256.name
    );
  });

  // after(async function () {
  // });
});
