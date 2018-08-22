import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import { idp1Available } from '..';
import * as idpApi from '../../api/v2/idp';
import * as debugApi from '../../api/v2/debug';
import { idp1EventEmitter } from '../../callback_server';
import * as db from '../../db';
import {
  createEventPromise,
  generateReferenceId,
  hash,
  wait,
} from '../../utils';
import * as config from '../../config';

describe('IdP update identity ial', function() {
  let namespace;
  let identifier;

  const updateIalReferenceId = generateReferenceId();

  const updateIdentityIalResultPromise = createEventPromise();

  let IalBeforeUpdate;

  before(async function() {
    this.timeout(15000);
    if (!idp1Available) {
      this.skip();
    }
    if (db.idp1Identities[0] == null) {
      throw new Error('No created identity to use');
    }

    namespace = db.idp1Identities[0].namespace;
    identifier = db.idp1Identities[0].identifier;

    IalBeforeUpdate = await debugApi.query('idp1', {
      fnName: 'GetIdentityInfo',
      hash_id: hash(namespace + ':' + identifier),
      node_id: 'idp1',
    });

    idp1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'update_ial_result' &&
        callbackData.reference_id === updateIalReferenceId
      ) {
        updateIdentityIalResultPromise.resolve(callbackData);
      }
    });
  });

  it('IdP should update identity ial successfully', async function() {
    this.timeout(15000);
    const response = await idpApi.updateIdentityIal('idp1', {
      namespace: namespace,
      identifier: identifier,
      reference_id: updateIalReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      ial: 3,
    });
    expect(response.status).to.equal(202);

    const updateIdentityIalResult = await updateIdentityIalResultPromise.promise;
    expect(updateIdentityIalResult).to.deep.include({
      reference_id: updateIalReferenceId,
      success: true,
    });
  });

  it('Identity ial should be updated successfully', async function() {
    this.timeout(15000);

    const response = await debugApi.query('idp1', {
      fnName: 'GetIdentityInfo',
      hash_id: hash(namespace + ':' + identifier),
      node_id: 'idp1',
    });
    expect(response.ial).to.equal(3);
  });

  after(async function() {
    this.timeout(10000);
    await idpApi.updateIdentityIal('idp1', {
      namespace: namespace,
      identifier: identifier,
      reference_id: uuidv4(),
      callback_url: config.IDP1_CALLBACK_URL,
      ial: IalBeforeUpdate.ial,
    });
    await wait(3000);
    idp1EventEmitter.removeAllListeners('callback');
  });
});
