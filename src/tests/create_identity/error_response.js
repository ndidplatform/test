import { expect } from 'chai';
import forge from 'node-forge';
import uuidv4 from 'uuid/v4';

import * as idpApi from '../../api/v2/idp';
import * as db from '../../db';
import { generateReferenceId } from '../../utils';
import * as config from '../../config';

describe('Create identity errors', function() {
  let namespace;
  let identifier;
  let accessorId;

  const keypair = forge.pki.rsa.generateKeyPair(2048);
  // const accessorPrivateKey = forge.pki.privateKeyToPem(keypair.privateKey);
  const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);

  const keypairLengthShorterThan2048Bit = forge.pki.rsa.generateKeyPair(2047);
  const accessorPublicKeyLengthShorterThan2048Bit = forge.pki.publicKeyToPem(
    keypairLengthShorterThan2048Bit.publicKey
  );

  const referenceId = generateReferenceId();

  before(function() {
    if (db.idp1Identities[0] == null) {
      throw new Error('No created identity to use');
    }

    namespace = db.idp1Identities[0].namespace;
    identifier = db.idp1Identities[0].identifier;
    accessorId = db.idp1Identities[0].accessors[0].accessorId;
  });

  it('IdP should get an error when creating duplicate identity', async function() {
    this.timeout(600000);
    const response = await idpApi.createIdentity('idp1', {
      reference_id: referenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      namespace,
      identifier,
      accessor_type: 'RSA',
      accessor_public_key: accessorPublicKey,
      //accessor_id,
      ial: 2.3,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20019); // Already created an idenity for this user
  });

  it('IdP should get an error when creating identity with duplicate accessor_id', async function() {
    this.timeout(600000);
    const response = await idpApi.createIdentity('idp1', {
      reference_id: referenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      namespace,
      identifier: uuidv4(),
      accessor_type: 'RSA',
      accessor_public_key: accessorPublicKey,
      accessor_id: accessorId,
      ial: 2.3,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20030);
  });

  it('IdP should get an error when using namespace that is not registered by NDID', async function() {
    this.timeout(600000);
    const namespace = 'namespace_is_not_registered';
    const identifier = '1234';
    // const keypair = forge.pki.rsa.generateKeyPair(2048);
    // const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);

    const response = await idpApi.createIdentity('idp1', {
      reference_id: referenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      namespace,
      identifier,
      accessor_type: 'RSA',
      accessor_public_key: accessorPublicKey,
      //accessor_id,
      ial: 2.3,
    });

    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20013); // This namespace is not registered by NDID
  });

  it('IdP should get an error when using invalid format accessor public key', async function() {
    this.timeout(600000);
    const response = await idpApi.createIdentity('idp1', {
      reference_id: referenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      namespace,
      identifier,
      accessor_type: 'RSA',
      accessor_public_key: 'aa',
      //accessor_id,
      ial: 2.3,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20040);
  });

  it('IdP should get an mismatched type error when using accessor public key with wrong accessor_type', async function() {
    this.timeout(600000);
    const accessorPublicKey = `-----BEGIN PUBLIC KEY-----
MFYwEAYHKoZIzj0CAQYFK4EEAAoDQgAEZYQxuM06/obj3ae0R2UUTt/JWrnvDzx+
6KkEXSmW7kSHrAKXBCDTMVt5HpadpRQt8Qzc3xfSGunAxKS+lGloPw==
-----END PUBLIC KEY-----
`; // EC secp256k1 pub key
    const response = await idpApi.createIdentity('idp1', {
      reference_id: referenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      namespace,
      identifier,
      accessor_type: 'RSA',
      accessor_public_key: accessorPublicKey,
      //accessor_id,
      ial: 2.3,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20042);
  });

  it('IdP should get an error when using accessor public key with length shorter than 2048-bit', async function() {
    this.timeout(600000);
    // const keypair = forge.pki.rsa.generateKeyPair(2047);
    // const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);
    const response = await idpApi.createIdentity('idp1', {
      reference_id: referenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      namespace,
      identifier,
      accessor_type: 'RSA',
      accessor_public_key: accessorPublicKeyLengthShorterThan2048Bit,
      //accessor_id,
      ial: 2.3,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20044);
  });
});
