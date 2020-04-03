import crypto from 'crypto';
import { expect } from 'chai';

import * as identityApi from '../../../api/v5/identity';
import * as db from '../../../db';
import { generateReferenceId } from '../../../utils';
import * as config from '../../../config';

describe('Revoke accessor error response tests', function() {
  const revokeAccessorRequestMessage =
    'Revoke accessor consent request custom message ข้อความสำหรับขอเพิกถอน accessor บนระบบ';

  let namespace;
  let identifier;
  let accessorId;
  let referenceGroupCode;

  const idpReferenceIdRevoke = generateReferenceId();

  before(function() {
    let identity = db.idp1Identities.filter(
      (identity) =>
        identity.namespace === 'citizen_id' &&
        identity.mode === 3 &&
        !identity.revokeIdentityAssociation
    );

    if (identity.length === 0) {
      throw new Error('No created identity to use');
    }

    namespace = identity[0].namespace;
    identifier = identity[0].identifier;
    referenceGroupCode = identity[0].referenceGroupCode;
    accessorId = identity[0].accessors[0].accessorId;
  });

  it('IdP (idp1) should get an error when revoke accessor with not existing namespace', async function() {
    const response = await identityApi.revokeAccessor('idp1', {
      reference_id: idpReferenceIdRevoke,
      callback_url: config.IDP1_CALLBACK_URL,
      namespace: 'notExistingNamespace',
      identifier,
      accessor_id: accessorId,
      request_message: revokeAccessorRequestMessage,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20071);
  });

  it('IdP (idp1) should get an error when revoke accessor with not existing identifier', async function() {
    const response = await identityApi.revokeAccessor('idp1', {
      reference_id: idpReferenceIdRevoke,
      callback_url: config.IDP1_CALLBACK_URL,
      namespace,
      identifier: 'notExistingIdentifier',
      accessor_id: accessorId,
      request_message: revokeAccessorRequestMessage,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20071);
  });

  it('IdP (idp1) should get an error when revoke accessor with not existing accessor id', async function() {
    const response = await identityApi.revokeAccessor('idp1', {
      reference_id: idpReferenceIdRevoke,
      callback_url: config.IDP1_CALLBACK_URL,
      namespace,
      identifier,
      accessor_id: 'notExistingAccessorId',
      request_message: revokeAccessorRequestMessage,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20011);
  });

  it('IdP (idp1) should get an error when revoke accessor with idp is not owner of accessor id', async function() {
    let identity = db.idp2Identities.filter(
      (identity) =>
        identity.namespace === 'citizen_id' &&
        identity.mode === 3 &&
        !identity.revokeIdentityAssociation
    );

    if (identity.length === 0) {
      this.test.parent.pending = true;
      this.skip();
    }

    accessorId = identity[0].accessors[0].accessorId;

    const response = await identityApi.revokeAccessor('idp1', {
      reference_id: idpReferenceIdRevoke,
      callback_url: config.IDP1_CALLBACK_URL,
      namespace,
      identifier,
      accessor_id: accessorId,
      request_message: revokeAccessorRequestMessage,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20062);
  });
});

describe('Revoke and add accessor error response tests', function() {
  const revokeAndAddAccessorRequestMessage =
    'Revoke and add accessor consent request custom message ข้อความสำหรับขอเพิกถอนและเพิ่ม accessor บนระบบ';

  let namespace;
  let identifier;
  let accessorId;
  let referenceGroupCode;

  const keypair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  // const accessorPrivateKey = keypair.privateKey.export({
  //   type: 'pkcs8',
  //   format: 'pem',
  // });
  const accessorPublicKey = keypair.publicKey.export({
    type: 'spki',
    format: 'pem',
  });

  const idpReferenceIdRevoke = generateReferenceId();

  before(function() {
    let identity = db.idp1Identities.filter(
      (identity) =>
        identity.namespace === 'citizen_id' &&
        identity.mode === 3 &&
        !identity.revokeIdentityAssociation
    );

    if (identity.length === 0) {
      throw new Error('No created identity to use');
    }

    namespace = identity[0].namespace;
    identifier = identity[0].identifier;
    referenceGroupCode = identity[0].referenceGroupCode;
    accessorId = identity[0].accessors[0].accessorId;
  });

  it('IdP (idp1) should get an error when revoke and add accessor with not existing namespace', async function() {
    const response = await identityApi.revokeAndAddAccessor('idp1', {
      reference_id: idpReferenceIdRevoke,
      callback_url: config.IDP1_CALLBACK_URL,
      namespace: 'notExistingNamespace',
      identifier,
      revoking_accessor_id: accessorId,
      accessor_type: 'RSA',
      accessor_public_key: accessorPublicKey,
      request_message: revokeAndAddAccessorRequestMessage,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20071);
  });

  it('IdP (idp1) should get an error when revoke and add accessor with not existing identifier', async function() {
    const response = await identityApi.revokeAndAddAccessor('idp1', {
      reference_id: idpReferenceIdRevoke,
      callback_url: config.IDP1_CALLBACK_URL,
      namespace,
      identifier: 'notExistingIdentifier',
      revoking_accessor_id: accessorId,
      accessor_type: 'RSA',
      accessor_public_key: accessorPublicKey,
      request_message: revokeAndAddAccessorRequestMessage,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20071);
  });

  it('IdP (idp1) should get an error when revoke and add accessor with not existing revoking accessor id', async function() {
    const response = await identityApi.revokeAndAddAccessor('idp1', {
      reference_id: idpReferenceIdRevoke,
      callback_url: config.IDP1_CALLBACK_URL,
      namespace,
      identifier,
      revoking_accessor_id: 'notExistingAccessorId',
      accessor_type: 'RSA',
      accessor_public_key: accessorPublicKey,
      request_message: revokeAndAddAccessorRequestMessage,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20011);
  });

  it('IdP (idp1) should get an error when revoke and add accessor with revoking accessor id and accessor id are the same ', async function() {
    const response = await identityApi.revokeAndAddAccessor('idp1', {
      reference_id: idpReferenceIdRevoke,
      callback_url: config.IDP1_CALLBACK_URL,
      namespace,
      identifier,
      revoking_accessor_id: accessorId,
      accessor_id: accessorId,
      accessor_type: 'RSA',
      accessor_public_key: accessorPublicKey,
      request_message: revokeAndAddAccessorRequestMessage,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20030);
  });

  it('IdP (idp1) should get an error when revoke and add accessor with idp is not owner of accessor id', async function() {
    let identity = db.idp2Identities.filter(
      (identity) =>
        identity.namespace === 'citizen_id' &&
        identity.mode === 3 &&
        !identity.revokeIdentityAssociation
    );

    if (identity.length === 0) {
      this.test.parent.pending = true;
      this.skip();
    }

    accessorId = identity[0].accessors[0].accessorId;

    const response = await identityApi.revokeAndAddAccessor('idp1', {
      reference_id: idpReferenceIdRevoke,
      callback_url: config.IDP1_CALLBACK_URL,
      namespace,
      identifier,
      revoking_accessor_id: accessorId,
      accessor_type: 'RSA',
      accessor_public_key: accessorPublicKey,
      request_message: revokeAndAddAccessorRequestMessage,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20062);
  });
});
