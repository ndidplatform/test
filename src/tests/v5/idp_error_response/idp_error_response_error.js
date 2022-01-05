import { expect } from 'chai';

import * as rpApi from '../../../api/v5/rp';
import * as idpApi from '../../../api/v5/idp';
import * as commonApi from '../../../api/v5/common';
import {
  idp1EventEmitter,
  rpEventEmitter,
} from '../../../callback_server';
import {
  createEventPromise,
  generateReferenceId,
  hash,
  wait,
} from '../../../utils';
import {
  createIdpIdList,
  createDataRequestList,
  createRequestMessageHash,
} from '../_fragments/fragments_utils';
import {
  receivePendingRequestStatusTest,
} from '../_fragments/common';
import * as config from '../../../config';

describe('IdP error response when request is closed', function () {
  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const rpCloseRequestReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise();
  const requestStatusPendingPromise = createEventPromise();
  const requestStatusErroredPromise = createEventPromise();

  const closeRequestResultPromise = createEventPromise();

  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise();

  const idp_requestStatusErroredPromise = createEventPromise();

  let createRequestParams;
  let lastStatusUpdateBlockHeight;

  let requestId;
  let initialSalt;

  let namespace;
  let identifier;

  let requestStatusUpdates = [];
  let rp_node_id = 'rp1';
  let requester_node_id = 'rp1';
  let idp_node_id = 'idp1';
  let idpIdList;
  let dataRequestList;
  let idpResponseParams = [];
  let requestMessageHash;

  let idpResponseErrorCode = 1000;

  before(async function () {
    namespace = 'citizen_id';
    identifier = '01234567890123';

    createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 1,
      namespace,
      identifier,
      idp_id_list: ['idp1'],
      data_request_list: [],
      request_message: 'Test request message (error response after closed)',
      min_ial: 2.3,
      min_aal: 3,
      min_idp: 1,
      request_timeout: 86400,
      bypass_identity_check: false,
    };

    rpEventEmitter.on('callback', function (callbackData) {
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
          requestStatusPendingPromise.resolve(callbackData);
        } else if (callbackData.status === 'errored') {
          requestStatusErroredPromise.resolve(callbackData);
        }
      } else if (
        callbackData.type === 'close_request_result' &&
        callbackData.reference_id === rpCloseRequestReferenceId
      ) {
        closeRequestResultPromise.resolve(callbackData);
      }
    });

    idp1EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId
      ) {
        incomingRequestPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.reference_id === idpReferenceId
      ) {
        responseResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === requestId
      ) {
        if (callbackData.status === 'errored') {
          idp_requestStatusErroredPromise.resolve(callbackData);
        }
      }
    });
  });

  it('RP should create a request successfully', async function () {
    this.timeout(10000);
    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

    requestId = responseBody.request_id;
    initialSalt = responseBody.initial_salt;

    const createRequestResult = await createRequestResultPromise.promise;
    expect(createRequestResult.success).to.equal(true);
    expect(createRequestResult.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight =
      createRequestResult.creation_block_height.split(':');
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    lastStatusUpdateBlockHeight = parseInt(splittedCreationBlockHeight[1]);
  });

  it('RP should receive pending request status', async function () {
    this.timeout(30000);

    [idpIdList, dataRequestList, requestMessageHash] = await Promise.all([
      createIdpIdList({
        createRequestParams,
        callRpApiAtNodeId: rp_node_id,
      }),
      createDataRequestList({
        createRequestParams,
        requestId,
        initialSalt,
        callRpApiAtNodeId: rp_node_id,
      }),
      createRequestMessageHash({
        createRequestParams,
        initialSalt,
      }),
    ]);

    await receivePendingRequestStatusTest({
      nodeId: rp_node_id,
      createRequestParams,
      requestId,
      idpIdList,
      dataRequestList,
      requestMessageHash,
      lastStatusUpdateBlockHeight,
      requestStatusPendingPromise,
      requesterNodeId: requester_node_id,
    });

    await wait(3000); // wait for receive message queue send success callback
  });

  it('IdP should receive incoming request callback', async function () {
    this.timeout(15000);
    const incomingRequest = await incomingRequestPromise.promise;

    const dataRequestListWithoutParams =
      createRequestParams.data_request_list.map((dataRequest) => {
        const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
        return {
          ...dataRequestWithoutParams,
        };
      });
    expect(incomingRequest).to.deep.include({
      node_id: 'idp1',
      type: 'incoming_request',
      mode: createRequestParams.mode,
      request_id: requestId,
      request_message: createRequestParams.request_message,
      request_message_hash: hash(
        createRequestParams.request_message +
          incomingRequest.request_message_salt
      ),
      requester_node_id: 'rp1',
      min_ial: createRequestParams.min_ial,
      min_aal: createRequestParams.min_aal,
      data_request_list: dataRequestListWithoutParams,
      request_timeout: createRequestParams.request_timeout,
    });
    expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
      .empty;
    expect(incomingRequest.creation_time).to.be.a('number');
    expect(incomingRequest.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight =
      incomingRequest.creation_block_height.split(':');
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('RP should be able to close request', async function () {
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

  it('IdP should NOT be able to create error response', async function () {
    this.timeout(10000);

    let idpResponse = {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      error_code: idpResponseErrorCode,
    };

    idpResponseParams.push({
      ...idpResponse,
      idp_id: 'idp1',
      valid_signature: null,
      valid_ial: null,
    });

    const response = await idpApi.createErrorResponse('idp1', idpResponse);

    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20025);
  });

  it('Should get request status successfully', async function () {
    this.timeout(10000);
    const response = await commonApi.getRequest('rp1', {
      requestId,
    });
    expect(response.status).to.equal(200);
    const responseBody = await response.json();
    expect(responseBody).to.deep.include({
      request_id: requestId,
      min_idp: createRequestParams.min_idp,
      min_aal: createRequestParams.min_aal,
      min_ial: createRequestParams.min_ial,
      request_timeout: createRequestParams.request_timeout,
      idp_id_list: createRequestParams.idp_id_list,
      data_request_list: dataRequestList,
      response_list: [],
      closed: true,
      timed_out: false,
      mode: 1,
      requester_node_id: requester_node_id,
      status: 'pending',
    });
  });

  after(function () {
    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
  });
});

describe('IdP error response when request is timed out', function () {
  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const rpCloseRequestReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise();
  const requestStatusPendingPromise = createEventPromise();
  const requestStatusErroredPromise = createEventPromise();

  const closeRequestResultPromise = createEventPromise();

  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise();

  const idp_requestStatusErroredPromise = createEventPromise();

  let createRequestParams;
  let lastStatusUpdateBlockHeight;

  let requestId;
  let initialSalt;

  let namespace;
  let identifier;

  let requestStatusUpdates = [];
  let rp_node_id = 'rp1';
  let requester_node_id = 'rp1';
  let idp_node_id = 'idp1';
  let idpIdList;
  let dataRequestList;
  let idpResponseParams = [];
  let requestMessageHash;

  let idpResponseErrorCode = 1000;

  before(async function () {
    namespace = 'citizen_id';
    identifier = '01234567890123';

    createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 1,
      namespace,
      identifier,
      idp_id_list: ['idp1'],
      data_request_list: [],
      request_message: 'Test request message (error response after timed out)',
      min_ial: 2.3,
      min_aal: 3,
      min_idp: 1,
      request_timeout: 1,
      bypass_identity_check: false,
    };

    rpEventEmitter.on('callback', function (callbackData) {
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
          requestStatusPendingPromise.resolve(callbackData);
        } else if (callbackData.status === 'errored') {
          requestStatusErroredPromise.resolve(callbackData);
        }
      } else if (
        callbackData.type === 'close_request_result' &&
        callbackData.reference_id === rpCloseRequestReferenceId
      ) {
        closeRequestResultPromise.resolve(callbackData);
      }
    });

    idp1EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId
      ) {
        incomingRequestPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.reference_id === idpReferenceId
      ) {
        responseResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === requestId
      ) {
        if (callbackData.status === 'errored') {
          idp_requestStatusErroredPromise.resolve(callbackData);
        }
      }
    });
  });

  it('RP should create a request successfully', async function () {
    this.timeout(10000);
    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

    requestId = responseBody.request_id;
    initialSalt = responseBody.initial_salt;

    const createRequestResult = await createRequestResultPromise.promise;
    expect(createRequestResult.success).to.equal(true);
    expect(createRequestResult.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight =
      createRequestResult.creation_block_height.split(':');
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    lastStatusUpdateBlockHeight = parseInt(splittedCreationBlockHeight[1]);
  });

  it('RP should receive pending request status', async function () {
    this.timeout(30000);

    [idpIdList, dataRequestList, requestMessageHash] = await Promise.all([
      createIdpIdList({
        createRequestParams,
        callRpApiAtNodeId: rp_node_id,
      }),
      createDataRequestList({
        createRequestParams,
        requestId,
        initialSalt,
        callRpApiAtNodeId: rp_node_id,
      }),
      createRequestMessageHash({
        createRequestParams,
        initialSalt,
      }),
    ]);

    await receivePendingRequestStatusTest({
      nodeId: rp_node_id,
      createRequestParams,
      requestId,
      idpIdList,
      dataRequestList,
      requestMessageHash,
      lastStatusUpdateBlockHeight,
      requestStatusPendingPromise,
      requesterNodeId: requester_node_id,
    });

    await wait(3000); // wait for receive message queue send success callback
  });

  it('IdP should receive incoming request callback', async function () {
    this.timeout(15000);
    const incomingRequest = await incomingRequestPromise.promise;

    const dataRequestListWithoutParams =
      createRequestParams.data_request_list.map((dataRequest) => {
        const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
        return {
          ...dataRequestWithoutParams,
        };
      });
    expect(incomingRequest).to.deep.include({
      node_id: 'idp1',
      type: 'incoming_request',
      mode: createRequestParams.mode,
      request_id: requestId,
      request_message: createRequestParams.request_message,
      request_message_hash: hash(
        createRequestParams.request_message +
          incomingRequest.request_message_salt
      ),
      requester_node_id: 'rp1',
      min_ial: createRequestParams.min_ial,
      min_aal: createRequestParams.min_aal,
      data_request_list: dataRequestListWithoutParams,
      request_timeout: createRequestParams.request_timeout,
    });
    expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
      .empty;
    expect(incomingRequest.creation_time).to.be.a('number');
    expect(incomingRequest.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight =
      incomingRequest.creation_block_height.split(':');
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('Should get request status successfully (timed_out = true)', async function () {
    this.timeout(10000);
    const response = await commonApi.getRequest('rp1', {
      requestId,
    });
    expect(response.status).to.equal(200);
    const responseBody = await response.json();
    expect(responseBody).to.deep.include({
      request_id: requestId,
      min_idp: createRequestParams.min_idp,
      min_aal: createRequestParams.min_aal,
      min_ial: createRequestParams.min_ial,
      request_timeout: createRequestParams.request_timeout,
      idp_id_list: createRequestParams.idp_id_list,
      data_request_list: dataRequestList,
      response_list: [],
      closed: false,
      timed_out: true,
      mode: 1,
      requester_node_id: requester_node_id,
      status: 'pending',
    });
  });

  it('IdP should NOT be able to create error response', async function () {
    this.timeout(10000);

    let idpResponse = {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      error_code: idpResponseErrorCode,
    };

    idpResponseParams.push({
      ...idpResponse,
      idp_id: 'idp1',
      valid_signature: null,
      valid_ial: null,
    });

    const response = await idpApi.createErrorResponse('idp1', idpResponse);

    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20026);
  });

  after(function () {
    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
  });
});
