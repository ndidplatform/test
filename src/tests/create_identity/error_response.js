import { expect } from 'chai';
import forge from 'node-forge';

import * as idpApi from '../../api/v2/idp';
import * as db from '../../db';
import { generateReferenceId } from '../../utils';
import * as config from '../../config';

describe('Create identity errors', function() {
  let namespace;
  let identifier;

  const keypair = forge.pki.rsa.generateKeyPair(2048);
  const accessorPrivateKey = forge.pki.privateKeyToPem(keypair.privateKey);
  const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);

  const referenceId = generateReferenceId();

  before(function() {
    if (db.idp1Identities[0] == null) {
      throw new Error('No created identity to use');
    }

    namespace = db.idp1Identities[0].namespace;
    identifier = db.idp1Identities[0].identifier;

  });

  it('IDP should get an error when create duplicate identity', async function() {
    this.timeout(10000);
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

  it('IDP should get an error when create identity that is not registered by NDID', async function() {
    this.timeout(10000);
    let namespace = 'namespace_is_not_registered';
    let identifier = '1234';
    const keypair = forge.pki.rsa.generateKeyPair(2048);
    const accessorPrivateKey = forge.pki.privateKeyToPem(keypair.privateKey);
    const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);

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
});
