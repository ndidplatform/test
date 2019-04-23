import { expect } from 'chai';
import forge from 'node-forge';
import uuidv4 from 'uuid/v4';

import * as identityApi from '../../../api/v3/identity';
import * as db from '../../../db';
import { generateReferenceId } from '../../../utils';
import * as config from '../../../config';

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
    let identity = db.idp1Identities.filter(
      identity =>
        identity.namespace === 'citizen_id' &&
        identity.mode === 3 &&
        !identity.revokeIdentityAssociation
    );

    if (!identity) {
      throw new Error('No created identity to use');
    }

    namespace = identity[0].namespace;
    identifier = identity[0].identifier;
    accessorId = identity[0].accessors[0].accessorId;

    // if (db.idp1Identities[0] == null) {
    //   throw new Error('No created identity to use');
    // }

    // namespace = db.idp1Identities[0].namespace;
    // identifier = db.idp1Identities[0].identifier;
    // accessorId = db.idp1Identities[0].accessors[0].accessorId;
  });

  it('IdP should get an error when creating duplicate identity (at IdP where already created an idenity for this user)', async function() {
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
      mode: 3,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20019); // Already created an idenity for this user
  });

  it('IdP should get an error when creating identity with duplicate accessor_id', async function() {
    this.timeout(10000);
    const response = await identityApi.createIdentity('idp1', {
      reference_id: referenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      identity_list: [
        {
          namespace,
          identifier: uuidv4(),
        },
      ],
      accessor_type: 'RSA',
      accessor_public_key: accessorPublicKey,
      accessor_id: accessorId,
      ial: 2.3,
      mode: 3,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20030);
  });

  it('IdP should get an error when using namespace that is not registered by NDID', async function() {
    this.timeout(10000);
    const namespace = 'namespace_is_not_registered';
    const identifier = '1234';
    // const keypair = forge.pki.rsa.generateKeyPair(2048);
    // const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);

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
      mode: 3,
    });

    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20013); // This namespace is not registered by NDID
  });

  it('IdP should get an error when using invalid format accessor public key', async function() {
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
      accessor_public_key: 'aa',
      //accessor_id,
      ial: 2.3,
      mode: 3,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20040);
  });

  it('IdP should get an mismatched type error when using accessor public key with wrong accessor_type', async function() {
    this.timeout(10000);
    const accessorPublicKey = `-----BEGIN PUBLIC KEY-----
MFYwEAYHKoZIzj0CAQYFK4EEAAoDQgAEZYQxuM06/obj3ae0R2UUTt/JWrnvDzx+
6KkEXSmW7kSHrAKXBCDTMVt5HpadpRQt8Qzc3xfSGunAxKS+lGloPw==
-----END PUBLIC KEY-----
`; // EC secp256k1 pub key
    const response = await identityApi.createIdentity('idp1', {
      reference_id: referenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      identity_list: [{ namespace, identifier }],
      accessor_type: 'RSA',
      accessor_public_key: accessorPublicKey,
      //accessor_id,
      ial: 2.3,
      mode: 3,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20042);
  });

  it('IdP should get an error when using accessor public key with length shorter than 2048-bit', async function() {
    this.timeout(30000);
    // const keypair = forge.pki.rsa.generateKeyPair(2047);
    // const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);
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
      accessor_public_key: accessorPublicKeyLengthShorterThan2048Bit,
      //accessor_id,
      ial: 2.3,
      mode: 3,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20044);
  });
});
