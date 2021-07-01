import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import { idp1Available } from '../..';
import * as identityApi from '../../../api/v5/identity';
import * as commonApi from '../../../api/v5/common';
import { idp1EventEmitter } from '../../../callback_server';
import * as db from '../../../db';
import { createEventPromise, generateReferenceId, wait } from '../../../utils';
import * as config from '../../../config';

describe('IdP update identity LAAL test', function () {
  let namespace;
  let identifier;

  const updateLaalReferenceId = generateReferenceId();

  const updateIdentityLaalResultPromise = createEventPromise();

  let laalBeforeUpdate;

  before(async function () {
    this.timeout(15000);
    if (!idp1Available) {
      this.skip();
    }

    const identity = db.idp1Identities.filter(
      (identity) => identity.namespace === 'citizen_id' && identity.mode === 3
    );

    if (identity.length === 0) {
      throw new Error('No created identity to use');
    }

    namespace = identity[0].namespace;
    identifier = identity[0].identifier;

    const response = await identityApi.getIdentityLaal('idp1', {
      namespace,
      identifier,
    });

    const responseBody = await response.json();
    laalBeforeUpdate = responseBody.laal;

    idp1EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'update_laal_result' &&
        callbackData.reference_id === updateLaalReferenceId
      ) {
        updateIdentityLaalResultPromise.resolve(callbackData);
      }
    });
  });

  it('IdP should update identity LAAL successfully', async function () {
    this.timeout(15000);
    const response = await identityApi.updateIdentityLaal('idp1', {
      namespace: namespace,
      identifier: identifier,
      reference_id: updateLaalReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      laal: !laalBeforeUpdate,
    });
    expect(response.status).to.equal(202);

    const updateIdentityLaalResult =
      await updateIdentityLaalResultPromise.promise;
    expect(updateIdentityLaalResult).to.deep.include({
      reference_id: updateLaalReferenceId,
      success: true,
    });
  });

  it('Identity LAAL should be updated successfully', async function () {
    const response = await identityApi.getIdentityLaal('idp1', {
      namespace,
      identifier,
    });
    const responseBody = await response.json();
    expect(responseBody.laal).to.equal(!laalBeforeUpdate);
  });

  it('Should get relevant IdP nodes by sid successfully', async function () {
    const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
      namespace,
      identifier,
    });
    const responseBody = await response.json();
    const idp = responseBody.find((node) => node.node_id === 'idp1');
    expect(idp.laal).to.equal(!laalBeforeUpdate);
  });

  after(async function () {
    this.timeout(10000);
    await identityApi.updateIdentityLaal('idp1', {
      namespace: namespace,
      identifier: identifier,
      reference_id: uuidv4(),
      callback_url: config.IDP1_CALLBACK_URL,
      laal: laalBeforeUpdate,
    });
    await wait(5000);
    idp1EventEmitter.removeAllListeners('callback');
  });
});
