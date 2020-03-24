import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import { ndidAvailable, idp1Available } from '../..';
import * as identityApi from '../../../api/v5/identity';
import * as ndidApi from '../../../api/v5/ndid';
import * as commonApi from '../../../api/v5/common';
import { idp1EventEmitter } from '../../../callback_server';
import * as db from '../../../db';
import { createEventPromise, generateReferenceId, wait } from '../../../utils';
import * as config from '../../../config';

describe('IdP update identity ial test', function() {
  let namespace;
  let identifier;

  const updateIalReferenceId = generateReferenceId();

  const updateIdentityIalResultPromise = createEventPromise();

  let ialBeforeUpdate;

  before(async function() {
    this.timeout(15000);
    if (!idp1Available) {
      this.skip();
    }

    const identity = db.idp1Identities.filter(
      identity => identity.namespace === 'citizen_id' && identity.mode === 3,
    );

    if (identity.length === 0) {
      throw new Error('No created identity to use');
    }

    namespace = identity[0].namespace;
    identifier = identity[0].identifier;

    const response = await identityApi.getIdentityIal('idp1', {
      namespace,
      identifier,
    });

    const responseBody = await response.json();
    ialBeforeUpdate = responseBody.ial;

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
    const response = await identityApi.updateIdentityIal('idp1', {
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

    const response = await identityApi.getIdentityIal('idp1', {
      namespace,
      identifier,
    });
    const responseBody = await response.json();
    expect(responseBody.ial).to.equal(3);
  });

  it('Should get relevant IdP nodes by sid successfully', async function() {
    this.timeout(15000);

    const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
      namespace,
      identifier,
    });
    const responseBody = await response.json();
    const idp = responseBody.find(node => node.node_id === 'idp1');
    expect(idp.ial).to.equal(3);
  });

  after(async function() {
    this.timeout(10000);
    await identityApi.updateIdentityIal('idp1', {
      namespace: namespace,
      identifier: identifier,
      reference_id: uuidv4(),
      callback_url: config.IDP1_CALLBACK_URL,
      ial: ialBeforeUpdate,
    });
    await wait(5000);
    idp1EventEmitter.removeAllListeners('callback');
  });
});

describe("IdP update identity ial greater than node's max ial test", function() {
  let namespace;
  let identifier;

  const updateIalReferenceId = generateReferenceId();

  let ialBeforeUpdate;
  let maxIalNodeBeforeUpdate;

  before(async function() {
    this.timeout(30000);
    if (!idp1Available || !ndidAvailable) {
      this.test.parent.pending = true;
      this.skip();
    }
    if (db.idp1Identities[0] == null) {
      throw new Error('No created identity to use');
    }

    namespace = db.idp1Identities[0].namespace;
    identifier = db.idp1Identities[0].identifier;

    const response = await identityApi.getIdentityIal('idp1', {
      namespace,
      identifier,
    });

    const responseBodyIdentityInfo = await response.json();
    ialBeforeUpdate = responseBodyIdentityInfo.ial;

    const responseNodeInfo = await commonApi.getNodeInfo('idp1');
    const responseBodyNodeInfo = await responseNodeInfo.json();
    maxIalNodeBeforeUpdate = responseBodyNodeInfo.max_ial;

    await ndidApi.updateNode('ndid1', {
      node_id: 'idp1',
      max_ial: 1.1,
    });
    await wait(5000);
  });

  it("IdP should update identity ial greater than node's max ial unsuccessfully", async function() {
    this.timeout(15000);
    const response = await identityApi.updateIdentityIal('idp1', {
      namespace: namespace,
      identifier: identifier,
      reference_id: updateIalReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      ial: 3,
    });

    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20021);
  });

  after(async function() {
    this.timeout(15000);
    await identityApi.updateIdentityIal('idp1', {
      namespace: namespace,
      identifier: identifier,
      reference_id: uuidv4(),
      callback_url: config.IDP1_CALLBACK_URL,
      ial: ialBeforeUpdate,
    });
    await ndidApi.updateNode('ndid1', {
      node_id: 'idp1',
      max_ial: maxIalNodeBeforeUpdate,
    });
    await wait(5000);
  });
});
