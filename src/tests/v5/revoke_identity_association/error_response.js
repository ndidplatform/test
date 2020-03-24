import { expect } from 'chai';

import * as identityApi from '../../../api/v5/identity';
import * as db from '../../../db';
import { generateReferenceId } from '../../../utils';
import * as config from '../../../config';

describe('Revoke identity association error response tests', function() {
  let namespace;
  let identifier;
  let accessorId;
  let referenceGroupCode;

  const idpReferenceIdRevoke = generateReferenceId();

  before(function() {
    let identity = db.idp1Identities.filter(
      identity =>
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

  it('IdP (idp1) should get an error when revoke identity association with not existing namespace', async function() {
    const response = await identityApi.revokeIdentityAssociation('idp1', {
      reference_id: idpReferenceIdRevoke,
      callback_url: config.IDP1_CALLBACK_URL,
      namespace: 'notExistingNamespace',
      identifier,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20013);
  });

  it('IdP (idp1) should get an error when revoke identity association with not existing identifier', async function() {
    const response = await identityApi.revokeIdentityAssociation('idp1', {
      reference_id: idpReferenceIdRevoke,
      callback_url: config.IDP1_CALLBACK_URL,
      namespace,
      identifier: 'notExistingIdentifier',
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20071);
  });

//   it('IdP (idp1) should get an error when revoke identity association with idp is not owner of accessor id', async function() {
//     let identity = db.idp2Identities.filter(
//       identity =>
//         identity.namespace === 'citizen_id' &&
//         identity.mode === 3 &&
//         !identity.revokeIdentityAssociation
//     );

//     if (identity.length === 0) {
//       this.test.parent.pending = true;
//       this.skip();
//     }

//     accessorId = identity[0].accessors[0].accessorId;

//     const response = await identityApi.revokeIdentityAssociation('idp1', {
//       reference_id: idpReferenceIdRevoke,
//       callback_url: config.IDP1_CALLBACK_URL,
//       namespace,
//       identifier,
//     });
//     expect(response.status).to.equal(400);
//     const responseBody = await response.json();
//     expect(responseBody.error.code).to.equal(20062);
//   });
});
