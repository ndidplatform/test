import { expect } from 'chai';

import * as rpApi from '../../api/v2/rp';
import * as commonApi from '../../api/v2/common';
import { rpEventEmitter } from '../../callback_server';
import * as db from '../../db';
import { createEventPromise, generateReferenceId, wait } from '../../utils';
import * as config from '../../config';

describe('Long timeout test (>2147483647 seconds or >24.8 days - greater than 32-bit integer)', function() {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise(); // RP
  const requestStatusPendingPromise = createEventPromise(); // RP
  const requestStatusTimedOutPromise = createEventPromise(); // RP

  let createRequestParams;

  let requestId;

  const requestStatusUpdates = [];

  before(function() {
    if (db.idp1Identities[0] == null) {
      throw new Error('No created identity to use');
    }

    namespace = db.idp1Identities[0].namespace;
    identifier = db.idp1Identities[0].identifier;

    createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 3,
      namespace,
      identifier,
      idp_id_list: [],
      data_request_list: [],
      request_message: 'Test request message (mode 3)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 9947483647, // seconds
    };

    rpEventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'create_request_result' &&
        callbackData.reference_id === rpReferenceId
      ) {
        createRequestResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === requestId
      ) {
        requestStatusUpdates.push(callbackData);
        if (callbackData.status === 'pending') {
          if (callbackData.timed_out) {
            requestStatusTimedOutPromise.resolve(callbackData);
          } else {
            requestStatusPendingPromise.resolve(callbackData);
          }
        }
      }
    });
  });

  it('RP should create a request successfully', async function() {
    this.timeout(10000);
    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;

    requestId = responseBody.request_id;

    const createRequestResult = await createRequestResultPromise.promise;
    expect(createRequestResult.success).to.equal(true);
  });

  it('RP should receive pending request status', async function() {
    this.timeout(10000);
    const requestStatus = await requestStatusPendingPromise.promise;
    expect(requestStatus).to.deep.include({
      request_id: requestId,
      status: 'pending',
      mode: createRequestParams.mode,
      min_idp: createRequestParams.min_idp,
      answered_idp_count: 0,
      closed: false,
      timed_out: false,
      service_list: [],
      response_valid_list: [],
    });
    expect(requestStatus).to.have.property('block_height');
    expect(requestStatus.block_height).is.a('number');
  });

  it('Created request should not timeout within time limit', async function() {
    this.timeout(10000);
    await wait(7000);
    const response = await commonApi.getRequest('rp1', {
      requestId,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);

    expect(responseBody.timed_out).to.equal(false);
  });

  it('RP should receive 1 request status update', function() {
    expect(requestStatusUpdates).to.have.lengthOf(1);
  });

  after(function() {
    rpEventEmitter.removeAllListeners('callback');
  });
});
