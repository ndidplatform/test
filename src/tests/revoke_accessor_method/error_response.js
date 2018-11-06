import { expect } from 'chai';

import * as idpApi from '../../api/v2/idp';
import * as db from '../../db';
import { generateReferenceId } from '../../utils';
import * as config from '../../config';

describe('Revoke accessor error response tests', function() {
  let namespace;
  let identifier;
  let accessorId;

  const idpReferenceIdRevoke = generateReferenceId();

  before(function() {
    if (db.idp1Identities[0] == null) {
      throw new Error('No created identity to use');
    }
    namespace = db.idp1Identities[0].namespace;
    identifier = db.idp1Identities[0].identifier;

    const identity = db.idp1Identities.find(
      (identity) =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    const latestAccessor = identity.accessors.length - 1;
    accessorId = identity.accessors[latestAccessor].accessorId;
  });

  it('IdP (idp1) should get an error when revoke accessor with not existing namespace', async function() {
    const response = await idpApi.revokeAccessorMethod('idp1', {
      reference_id: idpReferenceIdRevoke,
      callback_url: config.IDP1_CALLBACK_URL,
      namespace: 'notExistingNamespace',
      identifier,
      accessor_id: accessorId,
    });
    expect(response.status).to.equal(404);
  });

  it('IdP (idp1) should get an error when revoke accessor with not existing identifier', async function() {
    const response = await idpApi.revokeAccessorMethod('idp1', {
      reference_id: idpReferenceIdRevoke,
      callback_url: config.IDP1_CALLBACK_URL,
      namespace,
      identifier: 'notExistingIdentifier',
      accessor_id: accessorId,
    });
    expect(response.status).to.equal(404);
  });

  it('IdP (idp1) should get an error when revoke accessor with not existing accessor id', async function() {
    const response = await idpApi.revokeAccessorMethod('idp1', {
      reference_id: idpReferenceIdRevoke,
      callback_url: config.IDP1_CALLBACK_URL,
      namespace,
      identifier,
      accessor_id: 'notExistingAccessorId',
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20011);
  });
});
