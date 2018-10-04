import { expect } from 'chai';

import * as rpApi from '../../api/v2/rp';
import { rpEventEmitter } from '../../callback_server';
import * as db from '../../db';
import { createEventPromise, generateReferenceId, wait } from '../../utils';
import * as config from '../../config';

describe('Create request with duplicate reference id test', function() {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const rpCloseRequestReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise(); //RP

  let createRequestParams;
  let requestId;

  before(async function() {
    this.timeout(10000);
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
      request_message: 'Test request message (duplicate reference id) (mode 3)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    };

    rpEventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'create_request_result' &&
        callbackData.reference_id === rpReferenceId
      ) {
        createRequestResultPromise.resolve(callbackData);
      }
    });

    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    requestId = responseBody.request_id;
    await createRequestResultPromise.promise;
    await wait(2000);
  });

  it('RP should create a request with duplicate reference id unsuccessfully', async function() {
    this.timeout(10000);
    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20045);
  });

  it('RP should create a request with duplicate reference id unsuccessfully', async function() {
    this.timeout(10000);
    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20045);
  });

  after(async function() {
    this.timeout(15000);
    await rpApi.closeRequest('rp1', {
      reference_id: rpCloseRequestReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      request_id: requestId,
    });
    await wait(3000);
    rpEventEmitter.removeAllListeners('callback');
  });
});

describe('Create request with duplicate reference id that is not in progress (closed) test', function() {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const rpCloseRequestReferenceId = generateReferenceId();

  const createRequestResultPromise1st = createEventPromise(); //RP
  const createRequestResultPromise2nd = createEventPromise(); //RP
  const closeRequestResultPromise = createEventPromise(); //RP

  let createRequestParams;
  let requestId1st;
  let requestId2nd;

  before(async function() {
    this.timeout(10000);
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
      request_message:
        'Test request message (duplicate reference id is not in progress (closed)) (mode 3)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400, //sec
    };

    rpEventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'create_request_result' &&
        callbackData.request_id === requestId1st
      ) {
        createRequestResultPromise1st.resolve(callbackData);
      } else if (
        callbackData.type === 'create_request_result' &&
        callbackData.request_id === requestId2nd
      ) {
        createRequestResultPromise2nd.resolve(callbackData);
      } else if (
        callbackData.type === 'close_request_result' &&
        callbackData.reference_id === rpCloseRequestReferenceId
      ) {
        closeRequestResultPromise.resolve(callbackData);
      }
    });

    let response = await rpApi.createRequest('rp1', createRequestParams);
    let responseBody = await response.json();
    requestId1st = responseBody.request_id;
    await createRequestResultPromise1st.promise;
    await wait(2000);
  });

  it('RP should create a request with duplicate reference id unsuccessfully', async function() {
    this.timeout(10000);
    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20045);
  });

  it('RP should be able to close request successfully', async function() {
    this.timeout(10000);
    const response = await rpApi.closeRequest('rp1', {
      reference_id: rpCloseRequestReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      request_id: requestId1st,
    });
    expect(response.status).to.equal(202);

    const closeRequestResult = await closeRequestResultPromise.promise;
    expect(closeRequestResult).to.deep.include({
      reference_id: rpCloseRequestReferenceId,
      request_id: requestId1st,
      success: true,
    });
    await wait(3000);
  });

  it('After request duplicate reference id is not in progress (closed) RP should create a request successfully', async function() {
    this.timeout(10000);
    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

    requestId2nd = responseBody.request_id;

    const createRequestResult = await createRequestResultPromise2nd.promise;
    expect(createRequestResult.success).to.equal(true);
  });

  after(async function() {
    this.timeout(5000);
    await rpApi.closeRequest('rp1', {
      reference_id: rpCloseRequestReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      request_id: requestId2nd,
    });
    rpEventEmitter.removeAllListeners('callback');
    await wait(3000);
  });
});

describe('Create request with duplicate reference id that is not in progress (timed out) test', function() {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const rpCloseRequestReferenceId = generateReferenceId();

  const createRequestResultPromise1st = createEventPromise(); //RP
  const createRequestResultPromise2nd = createEventPromise(); //RP
  const requestStatusTimedOutPromise = createEventPromise(); // RP

  let createRequestParams;
  let requestId1st;
  let requestId2nd;

  before(async function() {
    this.timeout(10000);
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
      request_message:
        'Test request message (duplicate reference id is not in progress (timed out)) (mode 3)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 7, //sec
    };

    rpEventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'create_request_result' &&
        callbackData.request_id === requestId1st
      ) {
        createRequestResultPromise1st.resolve(callbackData);
      } else if (
        callbackData.type === 'create_request_result' &&
        callbackData.request_id === requestId2nd
      ) {
        createRequestResultPromise2nd.resolve(callbackData);
      } else if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === requestId1st
      ) {
        if (callbackData.status === 'pending') {
          if (callbackData.timed_out) {
            requestStatusTimedOutPromise.resolve(callbackData);
          }
        }
      }
    });

    let response = await rpApi.createRequest('rp1', createRequestParams);
    let responseBody = await response.json();
    requestId1st = responseBody.request_id;
    await createRequestResultPromise1st.promise;
    await wait(2000);
  });

  it('RP should create a request with duplicate reference id unsuccessfully', async function() {
    this.timeout(10000);
    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20045);
  });

  it('RP should receive request timed out status', async function() {
    this.timeout(20000);
    const requestStatus = await requestStatusTimedOutPromise.promise;
    expect(requestStatus).to.deep.include({
      request_id: requestId1st,
      status: 'pending',
      mode: createRequestParams.mode,
      min_idp: createRequestParams.min_idp,
      answered_idp_count: 0,
      closed: false,
      timed_out: true,
      service_list: [],
      response_valid_list: [],
    });
    expect(requestStatus).to.have.property('block_height');
    expect(requestStatus.block_height).is.a('number');
  });

  it('After request duplicate reference id is not in progress (timed out) RP should create a request successfully', async function() {
    this.timeout(10000);
    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

    requestId2nd = responseBody.request_id;

    const createRequestResult = await createRequestResultPromise2nd.promise;
    expect(createRequestResult.success).to.equal(true);
  });

  after(async function() {
    this.timeout(5000);
    await rpApi.closeRequest('rp1', {
      reference_id: rpCloseRequestReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      request_id: requestId2nd,
    });
    rpEventEmitter.removeAllListeners('callback');
    await wait(3000);
  });
});
