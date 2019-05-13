import { expect } from 'chai';

import * as rpApi from '../../../api/v3/rp';
import { rpEventEmitter } from '../../../callback_server';
import * as db from '../../../db';
import { createEventPromise, generateReferenceId, wait } from '../../../utils';
import * as config from '../../../config';

describe('RP get request_id by reference_id test', function() {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const rpCloseRequestReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise(); //RP
  const closeRequestResultPromise = createEventPromise(); //RP

  let createRequestParams;
  let requestId;

  before(async function() {
    this.timeout(10000);

    let identity = db.idp1Identities.filter(
      identity => identity.mode === 3 && !identity.revokeIdentityAssociation
    );

    if (identity.length === 0) {
      throw new Error('No created identity to use');
    }

    namespace = identity[0].namespace;
    identifier = identity[0].identifier;

    createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 3,
      namespace,
      identifier,
      idp_id_list: [],
      data_request_list: [],
      request_message: 'Test request message (get reference id) (mode 3)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
      bypass_identity_check:false
    };

    rpEventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'create_request_result' &&
        callbackData.reference_id === rpReferenceId
      ) {
        createRequestResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'close_request_result' &&
        callbackData.reference_id === rpCloseRequestReferenceId
      ) {
        closeRequestResultPromise.resolve(callbackData);
      }
    });

    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    requestId = responseBody.request_id;
    await createRequestResultPromise.promise;
    await wait(3000);
  });

  it('RP should get request_id by reference_id while request is unfinished (not closed or timed out) successfully', async function() {
    this.timeout(10000);
    const response = await rpApi.getRequestIdByReferenceId('rp1', {
      reference_id: rpReferenceId,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody.request_id).to.equal(requestId);
  });

  it('RP should be able to close request successfully', async function() {
    this.timeout(10000);
    const response = await rpApi.closeRequest('rp1', {
      reference_id: rpCloseRequestReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      request_id: requestId,
    });
    expect(response.status).to.equal(202);

    const closeRequestResult = await closeRequestResultPromise.promise;
    expect(closeRequestResult).to.deep.include({
      reference_id: rpCloseRequestReferenceId,
      request_id: requestId,
      success: true,
    });
    await wait(2000);
  });

  it('RP should get response status code 404 when get request_id by reference_id after request is finished (closed)', async function() {
    this.timeout(10000);
    const response = await rpApi.getRequestIdByReferenceId('rp1', {
      reference_id: rpReferenceId,
    });
    expect(response.status).to.equal(404);
  });
});
