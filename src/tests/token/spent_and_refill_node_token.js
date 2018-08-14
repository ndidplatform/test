import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import * as ndidApi from '../../api/v2/ndid';
import * as commonApi from '../../api/v2/common';
import { createRequest } from '../../api/v2/rp';
import { wait, generateReferenceId, createEventPromise } from '../../utils';
import { ndidAvailable, idp1Available } from '..';
import { RP_CALLBACK_URL } from '../../config';
import { rpEventEmitter } from '../../callback_server';

describe('Spent and refill node token test', function() {
  let nodeTokenBeforeTest = 0;
  let namespace = 'cid';
  let identifier = uuidv4();

  const RequestOutOfTokenReferenceId = generateReferenceId();
  const RequestAfterAddNodeTokenReferenceId = generateReferenceId();

  const createRequestOutOfTokenResultPromise = createEventPromise();
  const createRequestAfterAddNodeTokenResultPromise = createEventPromise();

  before(async function() {
    if (!ndidAvailable || !idp1Available) {
      this.skip();
    }

    const response = await commonApi.getToken('rp1');
    const responseBody = await response.json();
    nodeTokenBeforeTest = responseBody.amount;

    await ndidApi.setNodeToken('ndid1', {
      node_id: 'rp1',
      amount: 5,
    });

    rpEventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'create_request_result' &&
        callbackData.reference_id === RequestOutOfTokenReferenceId
      ) {
        createRequestOutOfTokenResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'create_request_result' &&
        callbackData.reference_id === RequestAfterAddNodeTokenReferenceId
      ) {
        createRequestAfterAddNodeTokenResultPromise.resolve(callbackData);
      }
    });
  });

  it('RP should be out of token', async function() {
    this.timeout(30000);
    // flood 5 blocks for spent token
    for (let i = 0; i < 5; i++) {
      await createRequest('rp1', {
        reference_id: uuidv4(),
        callback_url: RP_CALLBACK_URL,
        mode: 1,
        namespace,
        identifier,
        idp_id_list: ['idp1'],
        data_request_list: [],
        request_message: 'Flood block #' + i.toString(),
        min_ial: 1.1,
        min_aal: 1,
        min_idp: 1,
        request_timeout: 86400,
      });
      await wait(1000);
    }

    await wait(1000);

    const response = await commonApi.getToken('rp1');
    const responseBody = await response.json();

    expect(response.status).to.equal(200);
    expect(responseBody.amount).to.equal(0);
  });

  it('RP should get an error making a request when out of token', async function() {
    this.timeout(10000);

    const response = await createRequest('rp1', {
      reference_id: RequestOutOfTokenReferenceId,
      callback_url: RP_CALLBACK_URL,
      mode: 1,
      namespace,
      identifier,
      idp_id_list: ['idp1'],
      data_request_list: [],
      request_message: 'Test making a request when out of token',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

    const requestId = responseBody.request_id;

    const createRequestResult = await createRequestOutOfTokenResultPromise.promise;

    expect(createRequestResult).to.deep.include({
      type: 'create_request_result',
      success: false,
      reference_id: RequestOutOfTokenReferenceId,
      request_id: requestId,
      error: {
        code: 25007,
        message: 'Not enough token to make a transaction',
      },
    });
  });

  it('NDID should add node token successfully', async function() {
    this.timeout(10000);

    const response = await ndidApi.addNodeToken('ndid1', {
      node_id: 'rp1',
      amount: 5,
    });
    expect(response.status).to.equal(204);
    await wait(1000);
  });

  it('RP should making request after add node token successfully', async function() {
    this.timeout(10000);

    const response = await createRequest('rp1', {
      reference_id: RequestAfterAddNodeTokenReferenceId,
      callback_url: RP_CALLBACK_URL,
      mode: 1,
      namespace,
      identifier,
      idp_id_list: ['idp1'],
      data_request_list: [],
      request_message: 'Test making a request after add node token',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

    const createRequestResult = await createRequestAfterAddNodeTokenResultPromise.promise;
    expect(createRequestResult.success).to.equal(true);
  });

  after(async function() {
    await ndidApi.setNodeToken('ndid1', {
      node_id: 'rp1',
      amount: nodeTokenBeforeTest,
    });
    
    rpEventEmitter.removeAllListeners('callback');

  });
});
