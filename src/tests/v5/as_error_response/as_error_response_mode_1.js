import crypto from 'crypto';
import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import { idp2Available, idp3Available } from '../..';
import * as rpApi from '../../../api/v5/rp';
import * as idpApi from '../../../api/v5/idp';
import * as asApi from '../../../api/v5/as';
import * as commonApi from '../../../api/v5/common';
import * as identityApi from '../../../api/v5/identity';
import * as ndidApi from '../../../api/v5/ndid';
import {
  idp1EventEmitter,
  rpEventEmitter,
  as1EventEmitter,
  idp2EventEmitter,
  idp3EventEmitter,
  as2EventEmitter,
  setAsSendErrorThroughCallback,
} from '../../../callback_server';
import * as db from '../../../db';
import {
  createEventPromise,
  generateReferenceId,
  hash,
  createResponseSignature,
  wait,
} from '../../../utils';
import {
  createIdpIdList,
  createDataRequestList,
  createRequestMessageHash,
  setDataReceived,
  setDataSigned,
  setASResponseError,
} from '../_fragments/fragments_utils';
import {
  receivePendingRequestStatusTest,
  receiveConfirmedRequestStatusTest,
  receiveErroredRequestStatusTest,
  receiveRejectedRequestStatusTest,
  receiveCompletedRequestStatusTest,
  receiveRequestClosedStatusTest,
} from '../_fragments/common';
import * as config from '../../../config';

describe('RP create request (mode 1) min_as = 1 and AS response with an error code (through callback)', function () {
  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const asReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise();
  const requestStatusPendingPromise = createEventPromise();
  const requestStatusErroredPromise = createEventPromise();

  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise();

  const idp_requestStatusErroredPromise = createEventPromise();

  const dataRequestReceivedPromise = createEventPromise();
  const sendDataResultPromise = createEventPromise();
  const as_requestStatusErroredPromise = createEventPromise();

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
  let as_node_id = 'as1';
  let idpIdList;
  let dataRequestList;
  let idpResponseParams = [];
  let requestMessageHash;

  let asResponseErrorCode = 1000;
  let nonExistingErrorCode = 9999;

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
      data_request_list: [
        {
          service_id: 'bank_statement',
          as_id_list: ['as1'],
          min_as: 1,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
      ],
      request_message: 'Test request message (error data response)',
      min_ial: 2.3,
      min_aal: 3,
      min_idp: 1,
      request_timeout: 86400,
      bypass_identity_check: false,
    };

    setAsSendErrorThroughCallback(true);

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

    as1EventEmitter.on('callback', function (callbackData, sendData) {
      if (
        callbackData.type === 'data_request' &&
        callbackData.request_id === requestId
      ) {
        dataRequestReceivedPromise.resolve(callbackData);
        sendData({
          error_code: asResponseErrorCode,
        });
      } else if (
        callbackData.type === 'send_data_result' &&
        callbackData.reference_id === asReferenceId
      ) {
        sendDataResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === requestId
      ) {
        if (callbackData.status === 'errored') {
          as_requestStatusErroredPromise.resolve(callbackData);
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
    const splittedCreationBlockHeight = createRequestResult.creation_block_height.split(
      ':',
    );
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

    const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
      (dataRequest) => {
        const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
        return {
          ...dataRequestWithoutParams,
        };
      },
    );
    expect(incomingRequest).to.deep.include({
      node_id: 'idp1',
      type: 'incoming_request',
      mode: createRequestParams.mode,
      request_id: requestId,
      request_message: createRequestParams.request_message,
      request_message_hash: hash(
        createRequestParams.request_message +
          incomingRequest.request_message_salt,
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
    const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
      ':',
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('idp response with an non-existing error code', async function () {
    this.timeout(10000);

    const response = await idpApi.createErrorResponse('idp1', {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      error_code: nonExistingErrorCode,
    });

    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20078);
  });

  it('IdP should create response (error) successfully', async function () {
    this.timeout(10000);

    let idpResponse = {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      signature: 'some-signature',
    };

    idpResponseParams.push({
      ...idpResponse,
      idp_id: 'idp1',
      valid_signature: null,
      valid_ial: null,
    });

    const response = await idpApi.createResponse('idp1', idpResponse);
    expect(response.status).to.equal(202);
  });

  it('IdP should receive callback create response result with success = true', async function () {
    const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      node_id: 'idp1',
      type: 'response_result',
      reference_id: idpReferenceId,
      request_id: requestId,
      success: true,
    });
  });

  it('AS should receive data request', async function () {
    this.timeout(15000);
    const dataRequest = await dataRequestReceivedPromise.promise;
    expect(dataRequest).to.deep.include({
      type: 'data_request',
      request_id: requestId,
      mode: createRequestParams.mode,
      namespace,
      identifier,
      service_id: createRequestParams.data_request_list[0].service_id,
      request_params: createRequestParams.data_request_list[0].request_params,
      requester_node_id: 'rp1',
      max_ial: 2.3,
      max_aal: 3,

      request_timeout: createRequestParams.request_timeout,
    });
    expect(dataRequest.response_signature_list).to.have.lengthOf(1);
    expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is.not
      .empty;
    expect(dataRequest.creation_time).to.be.a('number');
    expect(dataRequest.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight = dataRequest.creation_block_height.split(
      ':',
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('AS esponse with non-existent error code', async function () {
    this.timeout(15000);
    const response = await asApi.sendDataError('as1', {
      requestId,
      serviceId: 'bank_statement',
      reference_id: asReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      error_code: nonExistingErrorCode,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20078);
  });

  it('AS (as1) response with error code successfully', async function () {
    this.timeout(200000);
    // const response = await asApi.sendDataError('as1', {
    //   requestId,
    //   serviceId: createRequestParams.data_request_list[0].service_id,
    //   reference_id: asReferenceId,
    //   callback_url: config.AS1_CALLBACK_URL,
    //   error_code: asResponseErrorCode,
    // });
    // expect(response.status).to.equal(202);

    // const sendDataResult = await sendDataResultPromise.promise;
    // expect(sendDataResult).to.deep.include({
    //   node_id: 'as1',
    //   type: 'send_data_result',
    //   reference_id: asReferenceId,
    //   success: true,
    // });

    dataRequestList = setASResponseError(
      dataRequestList,
      createRequestParams.data_request_list[0].service_id,
      as_node_id,
      asResponseErrorCode,
    );
  });

  it('RP should receive errored request status', async function () {
    this.timeout(15000);

    const testResult = await receiveErroredRequestStatusTest({
      nodeId: rp_node_id,
      requestStatusErroredPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('IdP should receive errored request status', async function () {
    this.timeout(20000);

    const testResult = await receiveErroredRequestStatusTest({
      nodeId: idp_node_id,
      requestStatusErroredPromise: idp_requestStatusErroredPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
      testForEqualLastStatusUpdateBlockHeight: true,
      isNotRp: true,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
    await wait(3000); //wait for data propagate
  });

  it('AS should receive errored request status', async function () {
    this.timeout(20000);
    const testResult = await receiveErroredRequestStatusTest({
      nodeId: as_node_id,
      requestStatusErroredPromise: as_requestStatusErroredPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
      testForEqualLastStatusUpdateBlockHeight: true,
      isNotRp: true,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
    await wait(3000); //wait for data propagate
  });

  it('Should get request status successfully', async function () {
    this.timeout(10000);

    let response_list = idpResponseParams.map((idpResponse) => {
      const {
        reference_id,
        callback_url,
        request_id,
        accessor_id,
        node_id,
        ...rest
      } = idpResponse;

      if (createRequestParams.mode === 1) {
        rest.valid_signature = null;
        rest.valid_ial = null;
      }
      return rest;
    });

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
      response_list,
      closed: true,
      timed_out: false,
      mode: 1,
      requester_node_id: requester_node_id,
      status: 'errored',
    });
  });

  it('RP should get the empty data received from AS', async function () {
    this.timeout(100000);
    const response = await rpApi.getDataFromAS('rp1', {
      requestId,
    });
    const dataArr = await response.json();
    expect(response.status).to.equal(200);
    expect(dataArr).to.be.an('array').to.be.empty;
  });

  after(function () {
    setAsSendErrorThroughCallback(false);
    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
    as1EventEmitter.removeAllListeners('callback');
  });
});

describe('RP create request (mode 1) min_as = 1 and AS response with an error code', function () {
  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const asReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise();
  const requestStatusPendingPromise = createEventPromise();
  const requestStatusErroredPromise = createEventPromise();

  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise();

  const idp_requestStatusErroredPromise = createEventPromise();

  const dataRequestReceivedPromise = createEventPromise();
  const sendDataResultPromise = createEventPromise();
  const as_requestStatusErroredPromise = createEventPromise();

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
  let as_node_id = 'as1';
  let idpIdList;
  let dataRequestList;
  let idpResponseParams = [];
  let requestMessageHash;

  let asResponseErrorCode = 1000;
  let nonExistingErrorCode = 9999;

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
      data_request_list: [
        {
          service_id: 'bank_statement',
          as_id_list: ['as1'],
          min_as: 1,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
      ],
      request_message: 'Test request message (error data response)',
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

    as1EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'data_request' &&
        callbackData.request_id === requestId
      ) {
        dataRequestReceivedPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'send_data_result' &&
        callbackData.reference_id === asReferenceId
      ) {
        sendDataResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === requestId
      ) {
        if (callbackData.status === 'errored') {
          as_requestStatusErroredPromise.resolve(callbackData);
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
    const splittedCreationBlockHeight = createRequestResult.creation_block_height.split(
      ':',
    );
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

    const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
      (dataRequest) => {
        const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
        return {
          ...dataRequestWithoutParams,
        };
      },
    );
    expect(incomingRequest).to.deep.include({
      node_id: 'idp1',
      type: 'incoming_request',
      mode: createRequestParams.mode,
      request_id: requestId,
      request_message: createRequestParams.request_message,
      request_message_hash: hash(
        createRequestParams.request_message +
          incomingRequest.request_message_salt,
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
    const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
      ':',
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('idp response with an non-existing error code', async function () {
    this.timeout(10000);

    const response = await idpApi.createErrorResponse('idp1', {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      error_code: nonExistingErrorCode,
    });

    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20078);
  });

  it('IdP should create response (error) successfully', async function () {
    this.timeout(10000);

    let idpResponse = {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      signature: 'some-signature',
    };

    idpResponseParams.push({
      ...idpResponse,
      idp_id: 'idp1',
      valid_signature: null,
      valid_ial: null,
    });

    const response = await idpApi.createResponse('idp1', idpResponse);
    expect(response.status).to.equal(202);
  });

  it('IdP should receive callback create response result with success = true', async function () {
    const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      node_id: 'idp1',
      type: 'response_result',
      reference_id: idpReferenceId,
      request_id: requestId,
      success: true,
    });
  });

  it('AS should receive data request', async function () {
    this.timeout(15000);
    const dataRequest = await dataRequestReceivedPromise.promise;
    expect(dataRequest).to.deep.include({
      type: 'data_request',
      request_id: requestId,
      mode: createRequestParams.mode,
      namespace,
      identifier,
      service_id: createRequestParams.data_request_list[0].service_id,
      request_params: createRequestParams.data_request_list[0].request_params,
      requester_node_id: 'rp1',
      max_ial: 2.3,
      max_aal: 3,

      request_timeout: createRequestParams.request_timeout,
    });
    expect(dataRequest.response_signature_list).to.have.lengthOf(1);
    expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is.not
      .empty;
    expect(dataRequest.creation_time).to.be.a('number');
    expect(dataRequest.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight = dataRequest.creation_block_height.split(
      ':',
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('AS esponse with non-existent error code', async function () {
    this.timeout(15000);
    const response = await asApi.sendDataError('as1', {
      requestId,
      serviceId: 'bank_statement',
      reference_id: asReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      error_code: nonExistingErrorCode,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20078);
  });

  it('AS (as1) response with error code successfully', async function () {
    this.timeout(200000);
    const response = await asApi.sendDataError('as1', {
      requestId,
      serviceId: createRequestParams.data_request_list[0].service_id,
      reference_id: asReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      error_code: asResponseErrorCode,
    });
    expect(response.status).to.equal(202);

    const sendDataResult = await sendDataResultPromise.promise;
    expect(sendDataResult).to.deep.include({
      node_id: 'as1',
      type: 'send_data_result',
      reference_id: asReferenceId,
      success: true,
    });

    dataRequestList = setASResponseError(
      dataRequestList,
      createRequestParams.data_request_list[0].service_id,
      as_node_id,
      asResponseErrorCode,
    );
  });

  it('RP should receive errored request status', async function () {
    this.timeout(15000);

    const testResult = await receiveErroredRequestStatusTest({
      nodeId: rp_node_id,
      requestStatusErroredPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('IdP should receive errored request status', async function () {
    this.timeout(20000);

    const testResult = await receiveErroredRequestStatusTest({
      nodeId: idp_node_id,
      requestStatusErroredPromise: idp_requestStatusErroredPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
      testForEqualLastStatusUpdateBlockHeight: true,
      isNotRp: true,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
    await wait(3000); //wait for data propagate
  });

  it('AS should receive errored request status', async function () {
    this.timeout(20000);
    const testResult = await receiveErroredRequestStatusTest({
      nodeId: as_node_id,
      requestStatusErroredPromise: as_requestStatusErroredPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
      testForEqualLastStatusUpdateBlockHeight: true,
      isNotRp: true,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
    await wait(3000); //wait for data propagate
  });

  it('Should get request status successfully', async function () {
    this.timeout(10000);

    let response_list = idpResponseParams.map((idpResponse) => {
      const {
        reference_id,
        callback_url,
        request_id,
        accessor_id,
        node_id,
        ...rest
      } = idpResponse;

      if (createRequestParams.mode === 1) {
        rest.valid_signature = null;
        rest.valid_ial = null;
      }
      return rest;
    });

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
      response_list,
      closed: true,
      timed_out: false,
      mode: 1,
      requester_node_id: requester_node_id,
      status: 'errored',
    });
  });

  it('RP should get the empty data received from AS', async function () {
    this.timeout(100000);
    const response = await rpApi.getDataFromAS('rp1', {
      requestId,
    });
    const dataArr = await response.json();
    expect(response.status).to.equal(200);
    expect(dataArr).to.be.an('array').to.be.empty;
  });

  after(function () {
    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
    as1EventEmitter.removeAllListeners('callback');
  });
});

describe('RP create request (mode 1) min_as = 1 to 2 AS and 1st AS response with an error code and 2nd AS response data', function () {
  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const asReferenceId = generateReferenceId();
  const as2ReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise();
  const requestStatusPendingPromise = createEventPromise();
  const requestStatusASErrorPromise = createEventPromise();
  const requestStatusSignedDataPromise = createEventPromise();
  const requestStatusCompletedPromise = createEventPromise();
  const requestClosedPromise = createEventPromise();

  const incomingRequestPromise = createEventPromise(); // idp1
  const responseResultPromise = createEventPromise();
  const idp_requestStatusASErrorPromise = createEventPromise();
  const idp_requestStatusSignedDataPromise = createEventPromise();
  const idp_requestStatusCompletedPromise = createEventPromise();
  const idp_requestClosedPromise = createEventPromise();

  const dataRequestReceivedPromise = createEventPromise();
  const sendDataResultPromise = createEventPromise();
  const as_requestStatusASErrorPromise = createEventPromise();
  const as_requestStatusSignedDataPromise = createEventPromise();
  const as_requestClosedPromise = createEventPromise();
  const as_requestStatusCompletedPromise = createEventPromise();

  const dataRequestReceivedPromise2 = createEventPromise();
  const sendDataResultPromise2 = createEventPromise();
  const as_requestStatusASErrorPromise2 = createEventPromise();
  const as_requestStatusSignedDataPromise2 = createEventPromise();
  const as_requestClosedPromise2 = createEventPromise();
  const as_requestStatusCompletedPromise2 = createEventPromise();

  let createRequestParams;
  let lastStatusUpdateBlockHeight;

  let requestId;
  let initialSalt;

  let namespace;
  let identifier;

  let rp_node_id = 'rp1';
  let requester_node_id = 'rp1';
  let idp_node_id = 'idp1';
  let idpIdList;
  let dataRequestList;
  let idpResponseParams = [];
  let requestMessageHash;

  const data = JSON.stringify({
    test: 'test',
    withEscapedChar: 'test|fff||ss\\|NN\\\\|',
    arr: [1, 2, 3],
  });

  let asResponseErrorCode = 1000;

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
      data_request_list: [
        {
          service_id: 'bank_statement',
          as_id_list: ['as1', 'as2'],
          min_as: 1,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
      ],
      request_message: 'Test request message (error data response)',
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
        if (callbackData.status === 'pending') {
          requestStatusPendingPromise.resolve(callbackData);
        } else if (callbackData.status === 'confirmed') {
          if (callbackData.data_request_list[0].response_list.length === 1) {
            requestStatusASErrorPromise.resolve(callbackData);
          } else if (
            callbackData.data_request_list[0].response_list.length === 2
          ) {
            let asAnswer = callbackData.data_request_list[0].response_list.find(
              (as) => as.as_id === 'as2',
            );
            if (asAnswer.signed) {
              requestStatusSignedDataPromise.resolve(callbackData);
            }
          }
        } else if (callbackData.status === 'completed') {
          if (callbackData.closed) {
            requestClosedPromise.resolve(callbackData);
          } else {
            requestStatusCompletedPromise.resolve(callbackData);
          }
        }
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
        if (callbackData.status === 'confirmed') {
          if (callbackData.data_request_list[0].response_list.length === 1) {
            idp_requestStatusASErrorPromise.resolve(callbackData);
          } else if (
            callbackData.data_request_list[0].response_list.length === 2
          ) {
            let asAnswer = callbackData.data_request_list[0].response_list.find(
              (as) => as.as_id === 'as2',
            );
            if (asAnswer.signed) {
              idp_requestStatusSignedDataPromise.resolve(callbackData);
            }
          }
        } else if (callbackData.status === 'completed') {
          if (callbackData.closed) {
            idp_requestClosedPromise.resolve(callbackData);
          } else {
            idp_requestStatusCompletedPromise.resolve(callbackData);
          }
        }
      }
    });

    as1EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'data_request' &&
        callbackData.request_id === requestId
      ) {
        dataRequestReceivedPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'send_data_result' &&
        callbackData.reference_id === asReferenceId
      ) {
        sendDataResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === requestId
      ) {
        if (callbackData.status === 'confirmed') {
          if (callbackData.data_request_list[0].response_list.length === 1) {
            as_requestStatusASErrorPromise.resolve(callbackData);
          } else if (
            callbackData.data_request_list[0].response_list.length === 2
          ) {
            let asAnswer = callbackData.data_request_list[0].response_list.find(
              (as) => as.as_id === 'as2',
            );
            if (asAnswer.signed) {
              as_requestStatusSignedDataPromise.resolve(callbackData);
            }
          }
        } else if (callbackData.status === 'completed') {
          if (callbackData.closed) {
            as_requestClosedPromise.resolve(callbackData);
          } else {
            as_requestStatusCompletedPromise.resolve(callbackData);
          }
        }
      }
    });

    as2EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'data_request' &&
        callbackData.request_id === requestId
      ) {
        dataRequestReceivedPromise2.resolve(callbackData);
      } else if (
        callbackData.type === 'send_data_result' &&
        callbackData.reference_id === as2ReferenceId
      ) {
        sendDataResultPromise2.resolve(callbackData);
      } else if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === requestId
      ) {
        if (callbackData.status === 'confirmed') {
          if (callbackData.data_request_list[0].response_list.length === 1) {
            as_requestStatusASErrorPromise2.resolve(callbackData);
          } else if (
            callbackData.data_request_list[0].response_list.length === 2
          ) {
            let asAnswer = callbackData.data_request_list[0].response_list.find(
              (as) => as.as_id === 'as2',
            );
            if (asAnswer.signed) {
              as_requestStatusSignedDataPromise2.resolve(callbackData);
            }
          }
        } else if (callbackData.status === 'completed') {
          if (callbackData.closed) {
            as_requestClosedPromise2.resolve(callbackData);
          } else {
            as_requestStatusCompletedPromise2.resolve(callbackData);
          }
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
    const splittedCreationBlockHeight = createRequestResult.creation_block_height.split(
      ':',
    );
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

  it('IdP (idp1) should receive incoming request callback', async function () {
    this.timeout(15000);
    const incomingRequest = await incomingRequestPromise.promise;

    const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
      (dataRequest) => {
        const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
        return {
          ...dataRequestWithoutParams,
        };
      },
    );
    expect(incomingRequest).to.deep.include({
      node_id: 'idp1',
      type: 'incoming_request',
      mode: createRequestParams.mode,
      request_id: requestId,
      request_message: createRequestParams.request_message,
      request_message_hash: hash(
        createRequestParams.request_message +
          incomingRequest.request_message_salt,
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
    const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
      ':',
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('IdP (idp1) should create response (accept) successfully', async function () {
    this.timeout(15000);

    let idpResponse = {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      signature: 'some-signature',
    };

    idpResponseParams.push({
      ...idpResponse,
      idp_id: 'idp1',
      valid_signature: null,
      valid_ial: null,
    });

    const response = await idpApi.createResponse('idp1', idpResponse);
    expect(response.status).to.equal(202);
  });

  it('IdP should receive callback create response result with success = true', async function () {
    this.timeout(15000);
    const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      node_id: 'idp1',
      type: 'response_result',
      reference_id: idpReferenceId,
      request_id: requestId,
      success: true,
    });
  });

  it('AS (as1) should receive data request', async function () {
    this.timeout(15000);
    const dataRequest = await dataRequestReceivedPromise.promise;
    expect(dataRequest).to.deep.include({
      type: 'data_request',
      request_id: requestId,
      mode: createRequestParams.mode,
      namespace,
      identifier,
      service_id: createRequestParams.data_request_list[0].service_id,
      request_params: createRequestParams.data_request_list[0].request_params,
      requester_node_id: 'rp1',
      max_ial: 2.3,
      max_aal: 3,

      request_timeout: createRequestParams.request_timeout,
    });
    expect(dataRequest.response_signature_list).to.have.lengthOf(1);
    expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is.not
      .empty;
    expect(dataRequest.creation_time).to.be.a('number');
    expect(dataRequest.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight = dataRequest.creation_block_height.split(
      ':',
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('AS (as2) should receive data request', async function () {
    this.timeout(15000);
    const dataRequest = await dataRequestReceivedPromise2.promise;
    expect(dataRequest).to.deep.include({
      type: 'data_request',
      request_id: requestId,
      mode: createRequestParams.mode,
      namespace,
      identifier,
      service_id: createRequestParams.data_request_list[0].service_id,
      request_params: createRequestParams.data_request_list[0].request_params,
      requester_node_id: 'rp1',
      max_ial: 2.3,
      max_aal: 3,

      request_timeout: createRequestParams.request_timeout,
    });
    expect(dataRequest.response_signature_list).to.have.lengthOf(1);
    expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is.not
      .empty;
    expect(dataRequest.creation_time).to.be.a('number');
    expect(dataRequest.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight = dataRequest.creation_block_height.split(
      ':',
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('AS (as1) response with error code successfully', async function () {
    this.timeout(200000);
    const response = await asApi.sendDataError('as1', {
      requestId,
      serviceId: createRequestParams.data_request_list[0].service_id,
      reference_id: asReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      error_code: asResponseErrorCode,
    });
    expect(response.status).to.equal(202);

    const sendDataResult = await sendDataResultPromise.promise;
    expect(sendDataResult).to.deep.include({
      node_id: 'as1',
      type: 'send_data_result',
      reference_id: asReferenceId,
      success: true,
    });

    dataRequestList = setASResponseError(
      dataRequestList,
      createRequestParams.data_request_list[0].service_id,
      'as1',
      asResponseErrorCode,
    );
  });

  it('RP should receive confirmed request status', async function () {
    this.timeout(15000);

    const testResult = await receiveConfirmedRequestStatusTest({
      nodeId: rp_node_id,
      requestStatusConfirmedPromise: requestStatusASErrorPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('IdP should receive confirmed request status', async function () {
    this.timeout(20000);

    const testResult = await receiveConfirmedRequestStatusTest({
      nodeId: 'idp1',
      requestStatusConfirmedPromise: idp_requestStatusASErrorPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
      testForEqualLastStatusUpdateBlockHeight: true,
      isNotRp: true,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('AS (as1) should receive confirmed request status', async function () {
    this.timeout(20000);

    const testResult = await receiveConfirmedRequestStatusTest({
      nodeId: 'as1',
      requestStatusConfirmedPromise: as_requestStatusASErrorPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
      testForEqualLastStatusUpdateBlockHeight: true,
      isNotRp: true,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('AS (as2) should receive confirmed request status', async function () {
    this.timeout(20000);

    const testResult = await receiveConfirmedRequestStatusTest({
      nodeId: 'as2',
      requestStatusConfirmedPromise: as_requestStatusASErrorPromise2,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
      testForEqualLastStatusUpdateBlockHeight: true,
      isNotRp: true,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('AS (as2) response data successfully', async function () {
    this.timeout(15000);
    const response = await asApi.sendData('as2', {
      requestId,
      serviceId: createRequestParams.data_request_list[0].service_id,
      reference_id: as2ReferenceId,
      callback_url: config.AS2_CALLBACK_URL,
      data,
    });
    expect(response.status).to.equal(202);

    const sendDataResult = await sendDataResultPromise2.promise;
    expect(sendDataResult).to.deep.include({
      node_id: 'as2',
      type: 'send_data_result',
      reference_id: as2ReferenceId,
      success: true,
    });

    dataRequestList = setDataSigned(
      dataRequestList,
      createRequestParams.data_request_list[0].service_id,
      'as2',
    );
  });

  it('RP should receive confirmed request status', async function () {
    this.timeout(15000);

    const testResult = await receiveConfirmedRequestStatusTest({
      nodeId: rp_node_id,
      requestStatusConfirmedPromise: requestStatusSignedDataPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('IdP should receive confirmed request status', async function () {
    this.timeout(20000);

    const testResult = await receiveConfirmedRequestStatusTest({
      nodeId: 'idp1',
      requestStatusConfirmedPromise: idp_requestStatusSignedDataPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
      testForEqualLastStatusUpdateBlockHeight: true,
      isNotRp: true,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('AS (as1) should receive confirmed request status', async function () {
    this.timeout(20000);

    const testResult = await receiveConfirmedRequestStatusTest({
      nodeId: 'as1',
      requestStatusConfirmedPromise: as_requestStatusSignedDataPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
      testForEqualLastStatusUpdateBlockHeight: true,
      isNotRp: true,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('AS (as2) should receive confirmed request status', async function () {
    this.timeout(20000);

    const testResult = await receiveConfirmedRequestStatusTest({
      nodeId: 'as2',
      requestStatusConfirmedPromise: as_requestStatusSignedDataPromise2,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
      testForEqualLastStatusUpdateBlockHeight: true,
      isNotRp: true,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;

    dataRequestList = setDataReceived(
      dataRequestList,
      createRequestParams.data_request_list[0].service_id,
      'as2',
    );
  });

  it('RP should receive completed request status', async function () {
    this.timeout(20000);
    const testResult = await receiveCompletedRequestStatusTest({
      nodeId: rp_node_id,
      requestStatusCompletedPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
    });

    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('IdP should receive completed request status', async function () {
    this.timeout(15000);
    await receiveCompletedRequestStatusTest({
      nodeId: idp_node_id,
      requestStatusCompletedPromise: idp_requestStatusCompletedPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      testForEqualLastStatusUpdateBlockHeight: true,
      requesterNodeId: requester_node_id,
      isNotRp: true,
    });
  });

  it('AS (as1) should receive completed request status', async function () {
    this.timeout(15000);
    await receiveCompletedRequestStatusTest({
      nodeId: 'as1',
      requestStatusCompletedPromise: as_requestStatusCompletedPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      testForEqualLastStatusUpdateBlockHeight: true,
      requesterNodeId: requester_node_id,
      isNotRp: true,
    });
  });

  it('AS (as2) should receive completed request status', async function () {
    this.timeout(15000);
    await receiveCompletedRequestStatusTest({
      nodeId: 'as2',
      requestStatusCompletedPromise: as_requestStatusCompletedPromise2,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      testForEqualLastStatusUpdateBlockHeight: true,
      requesterNodeId: requester_node_id,
      isNotRp: true,
    });
  });

  it('RP should receive request closed status', async function () {
    this.timeout(15000);
    const testResult = await receiveRequestClosedStatusTest({
      nodeId: rp_node_id,
      requestClosedPromise: requestClosedPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      // status: 'errored',
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
    });

    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('IdP should receive request closed status', async function () {
    this.timeout(15000);

    await receiveRequestClosedStatusTest({
      nodeId: idp_node_id,
      requestClosedPromise: idp_requestClosedPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      // status: 'errored',
      lastStatusUpdateBlockHeight,
      testForEqualLastStatusUpdateBlockHeight: true,
      requesterNodeId: requester_node_id,
    });
  });

  it('AS (as1) should receive request closed status', async function () {
    this.timeout(15000);

    await receiveRequestClosedStatusTest({
      nodeId: 'as1',
      requestClosedPromise: as_requestClosedPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      // status: 'errored',
      lastStatusUpdateBlockHeight,
      testForEqualLastStatusUpdateBlockHeight: true,
      requesterNodeId: requester_node_id,
    });
  });

  it('AS (as2) should receive request closed status', async function () {
    this.timeout(15000);

    await receiveRequestClosedStatusTest({
      nodeId: 'as2',
      requestClosedPromise: as_requestClosedPromise2,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      // status: 'errored',
      lastStatusUpdateBlockHeight,
      testForEqualLastStatusUpdateBlockHeight: true,
      requesterNodeId: requester_node_id,
    });
  });

  it('Should get request status with completed status and closed successfully', async function () {
    this.timeout(10000);

    let response_list = idpResponseParams.map((idpResponse) => {
      const {
        reference_id,
        callback_url,
        request_id,
        accessor_id,
        node_id,
        ...rest
      } = idpResponse;

      if (createRequestParams.mode === 1) {
        rest.valid_signature = null;
        rest.valid_ial = null;
      }
      return rest;
    });

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
      response_list,
      closed: true,
      timed_out: false,
      mode: 1,
      requester_node_id: requester_node_id,
      status: 'completed',
    });
  });

  it('RP should get the data received from AS', async function () {
    this.timeout(100000);
    const response = await rpApi.getDataFromAS('rp1', {
      requestId,
    });
    expect(response.status).to.equal(200);
    const dataArr = await response.json();
    expect(dataArr).to.have.lengthOf(1);
    expect(dataArr[0]).to.deep.include({
      source_node_id: 'as2',
      service_id: createRequestParams.data_request_list[0].service_id,
      signature_sign_method: 'RSA-SHA256',
      data,
    });
    expect(dataArr[0].source_signature).to.be.a('string').that.is.not.empty;
    expect(dataArr[0].data_salt).to.be.a('string').that.is.not.empty;
  });

  after(function () {
    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
    as1EventEmitter.removeAllListeners('callback');
    as2EventEmitter.removeAllListeners('callback');
  });
});

describe('RP create request (mode 1) min_as = 1 to 2 AS and 1st AS response data and 2nd should not response error', function () {
  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const asReferenceId = generateReferenceId();
  const as2ReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise();
  const requestStatusPendingPromise = createEventPromise();
  const requestStatusDataSignedPromise = createEventPromise();
  const requestClosedPromise = createEventPromise();
  const requestStatusCompletedPromise = createEventPromise();

  const incomingRequestPromise = createEventPromise(); // idp1
  const responseResultPromise = createEventPromise();
  const idp_requestStatusDataSignedPromise = createEventPromise();
  const idp_requestStatusCompletedPromise = createEventPromise();
  const idp_requestClosedPromise = createEventPromise();

  const dataRequestReceivedPromise = createEventPromise();
  const sendDataResultPromise = createEventPromise();
  const as_requestStatusDataSignedPromise = createEventPromise();
  const as_requestClosedPromise = createEventPromise();
  const as_requestStatusCompletedPromise = createEventPromise();

  const dataRequestReceivedPromise2 = createEventPromise();
  const sendDataResultPromise2 = createEventPromise();
  const as_requestStatusDataSignedPromise2 = createEventPromise();
  const as_requestClosedPromise2 = createEventPromise();
  const as_requestStatusCompletedPromise2 = createEventPromise();

  let createRequestParams;
  let lastStatusUpdateBlockHeight;

  let requestId;
  let initialSalt;

  let namespace;
  let identifier;

  let rp_node_id = 'rp1';
  let requester_node_id = 'rp1';
  let idp_node_id = 'idp1';
  let idpIdList;
  let dataRequestList;
  let idpResponseParams = [];
  let requestMessageHash;

  const data = JSON.stringify({
    test: 'test',
    withEscapedChar: 'test|fff||ss\\|NN\\\\|',
    arr: [1, 2, 3],
  });

  let asResponseErrorCode = 1000;

  before(async function () {
    namespace = 'citizen_id';
    identifier = '01234567890123';

    createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 1,
      namespace,
      identifier,
      idp_id_list: ['idp1', 'idp2'],
      data_request_list: [
        {
          service_id: 'bank_statement',
          as_id_list: ['as1', 'as2'],
          min_as: 1,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
      ],
      request_message: 'Test request message (error data response)',
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
        if (callbackData.status === 'pending') {
          requestStatusPendingPromise.resolve(callbackData);
        } else if (callbackData.status === 'confirmed') {
          if (callbackData.data_request_list.length > 0) {
            if (callbackData.data_request_list[0].response_list.length > 0) {
              if (callbackData.data_request_list[0].response_list[0].signed) {
                requestStatusDataSignedPromise.resolve(callbackData);
              }
            }
          }
        } else if (callbackData.status === 'completed') {
          if (callbackData.closed) {
            requestClosedPromise.resolve(callbackData);
          } else {
            requestStatusCompletedPromise.resolve(callbackData);
          }
        }
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
        if (callbackData.status === 'confirmed') {
          if (callbackData.data_request_list.length > 0) {
            if (callbackData.data_request_list[0].response_list.length > 0) {
              if (callbackData.data_request_list[0].response_list[0].signed) {
                idp_requestStatusDataSignedPromise.resolve(callbackData);
              }
            }
          }
        } else if (callbackData.status === 'completed') {
          if (callbackData.closed) {
            idp_requestClosedPromise.resolve(callbackData);
          } else {
            idp_requestStatusCompletedPromise.resolve(callbackData);
          }
        }
      }
    });

    as1EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'data_request' &&
        callbackData.request_id === requestId
      ) {
        dataRequestReceivedPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'send_data_result' &&
        callbackData.reference_id === asReferenceId
      ) {
        sendDataResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === requestId
      ) {
        if (callbackData.status === 'confirmed') {
          if (callbackData.data_request_list.length > 0) {
            if (callbackData.data_request_list[0].response_list.length > 0) {
              if (callbackData.data_request_list[0].response_list[0].signed) {
                as_requestStatusDataSignedPromise.resolve(callbackData);
              }
            }
          }
        } else if (callbackData.status === 'completed') {
          if (callbackData.closed) {
            as_requestClosedPromise.resolve(callbackData);
          } else {
            as_requestStatusCompletedPromise.resolve(callbackData);
          }
        }
      }
    });

    as2EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'data_request' &&
        callbackData.request_id === requestId
      ) {
        dataRequestReceivedPromise2.resolve(callbackData);
      } else if (
        callbackData.type === 'send_data_result' &&
        callbackData.reference_id === as2ReferenceId
      ) {
        sendDataResultPromise2.resolve(callbackData);
      } else if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === requestId
      ) {
        if (callbackData.status === 'confirmed') {
          if (callbackData.data_request_list.length > 0) {
            if (callbackData.data_request_list[0].response_list.length > 0) {
              if (callbackData.data_request_list[0].response_list[0].signed) {
                as_requestStatusDataSignedPromise2.resolve(callbackData);
              }
            }
          }
        } else if (callbackData.status === 'completed') {
          if (callbackData.closed) {
            as_requestClosedPromise2.resolve(callbackData);
          } else {
            as_requestStatusCompletedPromise2.resolve(callbackData);
          }
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
    const splittedCreationBlockHeight = createRequestResult.creation_block_height.split(
      ':',
    );
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

    const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
      (dataRequest) => {
        const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
        return {
          ...dataRequestWithoutParams,
        };
      },
    );
    expect(incomingRequest).to.deep.include({
      node_id: 'idp1',
      type: 'incoming_request',
      mode: createRequestParams.mode,
      request_id: requestId,
      request_message: createRequestParams.request_message,
      request_message_hash: hash(
        createRequestParams.request_message +
          incomingRequest.request_message_salt,
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
    const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
      ':',
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('IdP (idp1) should create response (accept) successfully', async function () {
    this.timeout(15000);

    let idpResponse = {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      signature: 'some-signature',
    };

    idpResponseParams.push({
      ...idpResponse,
      idp_id: 'idp1',
      valid_signature: null,
      valid_ial: null,
    });

    let response = await idpApi.createResponse('idp1', idpResponse);
    expect(response.status).to.equal(202);
  });

  it('IdP should receive callback create response result with success = true', async function () {
    this.timeout(15000);
    const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      node_id: 'idp1',
      type: 'response_result',
      reference_id: idpReferenceId,
      request_id: requestId,
      success: true,
    });
  });

  it('AS (as1) should receive data request', async function () {
    this.timeout(15000);
    const dataRequest = await dataRequestReceivedPromise.promise;
    expect(dataRequest).to.deep.include({
      type: 'data_request',
      request_id: requestId,
      mode: createRequestParams.mode,
      namespace,
      identifier,
      service_id: createRequestParams.data_request_list[0].service_id,
      request_params: createRequestParams.data_request_list[0].request_params,
      requester_node_id: 'rp1',
      max_ial: 2.3,
      max_aal: 3,

      request_timeout: createRequestParams.request_timeout,
    });
    expect(dataRequest.response_signature_list).to.have.lengthOf(1);
    expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is.not
      .empty;
    expect(dataRequest.creation_time).to.be.a('number');
    expect(dataRequest.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight = dataRequest.creation_block_height.split(
      ':',
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('AS (as2) should receive data request', async function () {
    this.timeout(15000);
    const dataRequest = await dataRequestReceivedPromise2.promise;
    expect(dataRequest).to.deep.include({
      type: 'data_request',
      request_id: requestId,
      mode: createRequestParams.mode,
      namespace,
      identifier,
      service_id: createRequestParams.data_request_list[0].service_id,
      request_params: createRequestParams.data_request_list[0].request_params,
      requester_node_id: 'rp1',
      max_ial: 2.3,
      max_aal: 3,

      request_timeout: createRequestParams.request_timeout,
    });
    expect(dataRequest.response_signature_list).to.have.lengthOf(1);
    expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is.not
      .empty;
    expect(dataRequest.creation_time).to.be.a('number');
    expect(dataRequest.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight = dataRequest.creation_block_height.split(
      ':',
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('AS (as1) response data successfully', async function () {
    this.timeout(15000);
    const response = await asApi.sendData('as1', {
      requestId,
      serviceId: createRequestParams.data_request_list[0].service_id,
      reference_id: asReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      data,
    });
    expect(response.status).to.equal(202);

    const sendDataResult = await sendDataResultPromise.promise;
    expect(sendDataResult).to.deep.include({
      node_id: 'as1',
      type: 'send_data_result',
      reference_id: asReferenceId,
      success: true,
    });

    dataRequestList = setDataSigned(
      dataRequestList,
      createRequestParams.data_request_list[0].service_id,
      'as1',
    );
  });

  it('AS (as2) response with error code unsuccessfully', async function () {
    this.timeout(200000);
    const response = await asApi.sendDataError('as2', {
      requestId,
      serviceId: createRequestParams.data_request_list[0].service_id,
      reference_id: as2ReferenceId,
      callback_url: config.AS2_CALLBACK_URL,
      error_code: asResponseErrorCode,
    });
    if (response.status === 202) {
      expect(response.status).to.equal(202);
      const sendDataResult = await sendDataResultPromise2.promise;
      expect(sendDataResult).to.deep.include({
        node_id: 'as2',
        type: 'send_data_result',
        reference_id: as2ReferenceId,
        success: false,
      });
    } else {
      const responseBody = await response.json();
      expect(responseBody.error.code).to.equal(20082);
    }
  });

  it('RP should receive confirmed request status', async function () {
    this.timeout(15000);

    const testResult = await receiveConfirmedRequestStatusTest({
      nodeId: rp_node_id,
      requestStatusConfirmedPromise: requestStatusDataSignedPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('IdP should receive confirmed request status', async function () {
    this.timeout(20000);

    const testResult = await receiveConfirmedRequestStatusTest({
      nodeId: 'idp1',
      requestStatusConfirmedPromise: idp_requestStatusDataSignedPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
      testForEqualLastStatusUpdateBlockHeight: true,
      isNotRp: true,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('AS (as1) should receive confirmed request status', async function () {
    this.timeout(20000);

    const testResult = await receiveConfirmedRequestStatusTest({
      nodeId: 'as1',
      requestStatusConfirmedPromise: as_requestStatusDataSignedPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
      testForEqualLastStatusUpdateBlockHeight: true,
      isNotRp: true,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('AS (as2) should receive confirmed request status', async function () {
    this.timeout(20000);

    const testResult = await receiveConfirmedRequestStatusTest({
      nodeId: 'as2',
      requestStatusConfirmedPromise: as_requestStatusDataSignedPromise2,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
      testForEqualLastStatusUpdateBlockHeight: true,
      isNotRp: true,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;

    dataRequestList = setDataReceived(
      dataRequestList,
      createRequestParams.data_request_list[0].service_id,
      'as1',
    );
  });

  it('RP should receive completed request status', async function () {
    this.timeout(15000);
    const testResult = await receiveCompletedRequestStatusTest({
      nodeId: rp_node_id,
      requestStatusCompletedPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
    });

    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('IdP should receive completed request status', async function () {
    this.timeout(15000);

    await receiveCompletedRequestStatusTest({
      nodeId: idp_node_id,
      requestStatusCompletedPromise: idp_requestStatusCompletedPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      testForEqualLastStatusUpdateBlockHeight: true,
      requesterNodeId: requester_node_id,
      isNotRp: true,
    });
  });

  it('AS (as1) should receive completed request status', async function () {
    this.timeout(15000);

    await receiveCompletedRequestStatusTest({
      nodeId: 'as1',
      requestStatusCompletedPromise: as_requestStatusCompletedPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      testForEqualLastStatusUpdateBlockHeight: true,
      requesterNodeId: requester_node_id,
      isNotRp: true,
    });
  });

  it('AS (as2) should receive completed request status', async function () {
    this.timeout(15000);

    await receiveCompletedRequestStatusTest({
      nodeId: 'as2',
      requestStatusCompletedPromise: as_requestStatusCompletedPromise2,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      testForEqualLastStatusUpdateBlockHeight: true,
      requesterNodeId: requester_node_id,
      isNotRp: true,
    });
  });

  it('RP should receive request closed status', async function () {
    this.timeout(15000);

    const testResult = await receiveRequestClosedStatusTest({
      nodeId: rp_node_id,
      requestClosedPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('IdP should receive request closed status', async function () {
    this.timeout(15000);

    await receiveRequestClosedStatusTest({
      nodeId: idp_node_id,
      requestClosedPromise: idp_requestClosedPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      testForEqualLastStatusUpdateBlockHeight: true,
      requesterNodeId: requester_node_id,
    });

    await wait(3000); //wait for data propagate
  });

  it('Should get request status successfully', async function () {
    this.timeout(10000);

    let response_list = idpResponseParams.map((idpResponse) => {
      const {
        reference_id,
        callback_url,
        request_id,
        accessor_id,
        node_id,
        ...rest
      } = idpResponse;

      if (createRequestParams.mode === 1) {
        rest.valid_signature = null;
        rest.valid_ial = null;
      }
      return rest;
    });

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
      response_list,
      closed: true,
      timed_out: false,
      mode: 1,
      requester_node_id: requester_node_id,
      status: 'completed',
    });
  });

  it('RP should get the data received from AS', async function () {
    this.timeout(100000);
    const response = await rpApi.getDataFromAS('rp1', {
      requestId,
    });
    expect(response.status).to.equal(200);
    const dataArr = await response.json();
    expect(dataArr).to.have.lengthOf(1);
    expect(dataArr[0]).to.deep.include({
      source_node_id: 'as1',
      service_id: createRequestParams.data_request_list[0].service_id,
      signature_sign_method: 'RSA-SHA256',
      data,
    });
    expect(dataArr[0].source_signature).to.be.a('string').that.is.not.empty;
    expect(dataArr[0].data_salt).to.be.a('string').that.is.not.empty;
  });

  after(function () {
    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
    as1EventEmitter.removeAllListeners('callback');
    as2EventEmitter.removeAllListeners('callback');
  });
});

//min_as = 2 to 2 AS

describe('RP create request (mode 1) min_as = 2 to 2 AS and 1st AS response data and 2nd AS response with an error', function () {
  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const asReferenceId = generateReferenceId();
  const as2ReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise();
  const requestStatusPendingPromise = createEventPromise();
  const requestStatusSignedDataPromise = createEventPromise();
  const requestStatusReceivedDataPromise = createEventPromise();
  const requestStatusErroredPromise = createEventPromise();
  const requestClosedPromise = createEventPromise();

  const incomingRequestPromise = createEventPromise(); // idp1
  const responseResultPromise = createEventPromise();
  const idp_requestStatusSignedDataPromise = createEventPromise();
  const idp_requestStatusReceivedDataPromise = createEventPromise();
  const idp_requestStatusErroredPromise = createEventPromise();
  const idp_requestClosedPromise = createEventPromise();

  const dataRequestReceivedPromise = createEventPromise();
  const sendDataResultPromise = createEventPromise();
  const as_requestStatusSignedDataPromise = createEventPromise();
  const as_requestStatusReceivedDataPromise = createEventPromise();
  const as_requestStatusErroredPromise = createEventPromise();
  const as_requestClosedPromise = createEventPromise();

  const dataRequestReceivedPromise2 = createEventPromise();
  const sendDataResultPromise2 = createEventPromise();
  const as_requestStatusSignedDataPromise2 = createEventPromise();
  const as_requestStatusReceivedDataPromise2 = createEventPromise();
  const as_requestStatusErroredPromise2 = createEventPromise();
  const as_requestClosedPromise2 = createEventPromise();

  let createRequestParams;
  let lastStatusUpdateBlockHeight;

  let requestId;
  let initialSalt;

  let namespace;
  let identifier;

  let rp_node_id = 'rp1';
  let requester_node_id = 'rp1';
  let idp_node_id = 'idp1';
  let idpIdList;
  let dataRequestList;
  let idpResponseParams = [];
  let requestMessageHash;

  let asResponseErrorCode = 1000;

  const data = JSON.stringify({
    test: 'test',
    withEscapedChar: 'test|fff||ss\\|NN\\\\|',
    arr: [1, 2, 3],
  });

  before(async function () {
    namespace = 'citizen_id';
    identifier = '01234567890123';

    createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 1,
      namespace,
      identifier,
      idp_id_list: ['idp1', 'idp2'],
      data_request_list: [
        {
          service_id: 'bank_statement',
          as_id_list: ['as1', 'as2'],
          min_as: 2,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
      ],
      request_message: 'Test request message (error data response)',
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
        if (callbackData.status === 'pending') {
          requestStatusPendingPromise.resolve(callbackData);
        } else if (callbackData.status === 'confirmed') {
          if (callbackData.data_request_list.length > 0) {
            if (callbackData.data_request_list[0].response_list.length > 0) {
              if (
                callbackData.data_request_list[0].response_list[0].received_data
              ) {
                requestStatusReceivedDataPromise.resolve(callbackData);
              } else if (
                callbackData.data_request_list[0].response_list[0].signed
              ) {
                requestStatusSignedDataPromise.resolve(callbackData);
              }
            }
          }
        } else if (callbackData.status === 'errored') {
          if (callbackData.closed) {
            requestClosedPromise.resolve(callbackData);
          } else {
            requestStatusErroredPromise.resolve(callbackData);
          }
        }
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
        if (callbackData.status === 'confirmed') {
          if (callbackData.data_request_list.length > 0) {
            if (callbackData.data_request_list[0].response_list.length > 0) {
              if (
                callbackData.data_request_list[0].response_list[0].received_data
              ) {
                idp_requestStatusReceivedDataPromise.resolve(callbackData);
              } else if (
                callbackData.data_request_list[0].response_list[0].signed
              ) {
                idp_requestStatusSignedDataPromise.resolve(callbackData);
              }
            }
          }
        } else if (callbackData.status === 'errored') {
          if (callbackData.closed) {
            idp_requestClosedPromise.resolve(callbackData);
          } else {
            idp_requestStatusErroredPromise.resolve(callbackData);
          }
        }
      }
    });

    as1EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'data_request' &&
        callbackData.request_id === requestId
      ) {
        dataRequestReceivedPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'send_data_result' &&
        callbackData.reference_id === asReferenceId
      ) {
        sendDataResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === requestId
      ) {
        if (callbackData.status === 'confirmed') {
          if (callbackData.data_request_list.length > 0) {
            if (callbackData.data_request_list[0].response_list.length > 0) {
              if (
                callbackData.data_request_list[0].response_list[0].received_data
              ) {
                as_requestStatusReceivedDataPromise.resolve(callbackData);
              } else if (
                callbackData.data_request_list[0].response_list[0].signed
              ) {
                as_requestStatusSignedDataPromise.resolve(callbackData);
              }
            }
          }
        } else if (callbackData.status === 'errored') {
          if (callbackData.closed) {
            as_requestClosedPromise.resolve(callbackData);
          } else {
            as_requestStatusErroredPromise.resolve(callbackData);
          }
        }
      }
    });

    as2EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'data_request' &&
        callbackData.request_id === requestId
      ) {
        dataRequestReceivedPromise2.resolve(callbackData);
      } else if (
        callbackData.type === 'send_data_result' &&
        callbackData.reference_id === as2ReferenceId
      ) {
        sendDataResultPromise2.resolve(callbackData);
      } else if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === requestId
      ) {
        if (callbackData.status === 'confirmed') {
          if (callbackData.data_request_list.length > 0) {
            if (callbackData.data_request_list[0].response_list.length > 0) {
              if (
                callbackData.data_request_list[0].response_list[0].received_data
              ) {
                as_requestStatusReceivedDataPromise2.resolve(callbackData);
              } else if (
                callbackData.data_request_list[0].response_list[0].signed
              ) {
                as_requestStatusSignedDataPromise2.resolve(callbackData);
              }
            }
          }
        } else if (callbackData.status === 'errored') {
          if (callbackData.closed) {
            as_requestClosedPromise2.resolve(callbackData);
          } else {
            as_requestStatusErroredPromise2.resolve(callbackData);
          }
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
    const splittedCreationBlockHeight = createRequestResult.creation_block_height.split(
      ':',
    );
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

  it('IdP (idp1) should receive incoming request callback', async function () {
    this.timeout(15000);
    const incomingRequest = await incomingRequestPromise.promise;

    const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
      (dataRequest) => {
        const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
        return {
          ...dataRequestWithoutParams,
        };
      },
    );
    expect(incomingRequest).to.deep.include({
      node_id: 'idp1',
      type: 'incoming_request',
      mode: createRequestParams.mode,
      request_id: requestId,
      request_message: createRequestParams.request_message,
      request_message_hash: hash(
        createRequestParams.request_message +
          incomingRequest.request_message_salt,
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
    const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
      ':',
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('IdP (idp1) should create response (accept) successfully', async function () {
    this.timeout(15000);

    let idpResponse = {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      signature: 'some-signature',
    };

    idpResponseParams.push({
      ...idpResponse,
      idp_id: 'idp1',
      valid_signature: null,
      valid_ial: null,
    });

    let response = await idpApi.createResponse('idp1', idpResponse);
    expect(response.status).to.equal(202);
  });

  it('IdP (idp1) should receive callback create response result with success = true', async function () {
    this.timeout(15000);
    const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      node_id: 'idp1',
      type: 'response_result',
      reference_id: idpReferenceId,
      request_id: requestId,
      success: true,
    });
  });

  it('AS (as1) should receive data request', async function () {
    this.timeout(15000);
    const dataRequest = await dataRequestReceivedPromise.promise;
    expect(dataRequest).to.deep.include({
      type: 'data_request',
      request_id: requestId,
      mode: createRequestParams.mode,
      namespace,
      identifier,
      service_id: createRequestParams.data_request_list[0].service_id,
      request_params: createRequestParams.data_request_list[0].request_params,
      requester_node_id: 'rp1',
      max_ial: 2.3,
      max_aal: 3,

      request_timeout: createRequestParams.request_timeout,
    });
    expect(dataRequest.response_signature_list).to.have.lengthOf(1);
    expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is.not
      .empty;
    expect(dataRequest.creation_time).to.be.a('number');
    expect(dataRequest.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight = dataRequest.creation_block_height.split(
      ':',
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('AS (as2) should receive data request', async function () {
    this.timeout(15000);
    const dataRequest = await dataRequestReceivedPromise2.promise;
    expect(dataRequest).to.deep.include({
      type: 'data_request',
      request_id: requestId,
      mode: createRequestParams.mode,
      namespace,
      identifier,
      service_id: createRequestParams.data_request_list[0].service_id,
      request_params: createRequestParams.data_request_list[0].request_params,
      requester_node_id: 'rp1',
      max_ial: 2.3,
      max_aal: 3,

      request_timeout: createRequestParams.request_timeout,
    });
    expect(dataRequest.response_signature_list).to.have.lengthOf(1);
    expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is.not
      .empty;
    expect(dataRequest.creation_time).to.be.a('number');
    expect(dataRequest.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight = dataRequest.creation_block_height.split(
      ':',
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('AS (as1) response data successfully', async function () {
    this.timeout(15000);
    const response = await asApi.sendData('as1', {
      requestId,
      serviceId: createRequestParams.data_request_list[0].service_id,
      reference_id: asReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      data,
    });
    expect(response.status).to.equal(202);

    const sendDataResult = await sendDataResultPromise.promise;
    expect(sendDataResult).to.deep.include({
      node_id: 'as1',
      type: 'send_data_result',
      reference_id: asReferenceId,
      success: true,
    });

    dataRequestList = setDataSigned(
      dataRequestList,
      createRequestParams.data_request_list[0].service_id,
      'as1',
    );
  });

  it('RP should receive confirmed request status', async function () {
    this.timeout(15000);

    const testResult = await receiveConfirmedRequestStatusTest({
      nodeId: rp_node_id,
      requestStatusConfirmedPromise: requestStatusSignedDataPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('IdP should receive confirmed request status', async function () {
    this.timeout(20000);

    const testResult = await receiveConfirmedRequestStatusTest({
      nodeId: 'idp1',
      requestStatusConfirmedPromise: idp_requestStatusSignedDataPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
      testForEqualLastStatusUpdateBlockHeight: true,
      isNotRp: true,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('AS (as1) should receive confirmed request status', async function () {
    this.timeout(20000);

    const testResult = await receiveConfirmedRequestStatusTest({
      nodeId: 'as1',
      requestStatusConfirmedPromise: as_requestStatusSignedDataPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
      testForEqualLastStatusUpdateBlockHeight: true,
      isNotRp: true,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('AS (as2) should receive confirmed request status', async function () {
    this.timeout(20000);

    const testResult = await receiveConfirmedRequestStatusTest({
      nodeId: 'as2',
      requestStatusConfirmedPromise: as_requestStatusSignedDataPromise2,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
      testForEqualLastStatusUpdateBlockHeight: true,
      isNotRp: true,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;

    dataRequestList = setDataReceived(
      dataRequestList,
      createRequestParams.data_request_list[0].service_id,
      'as1',
    );
  });

  it('RP should receive confirmed with received data request status', async function () {
    this.timeout(15000);

    const testResult = await receiveConfirmedRequestStatusTest({
      nodeId: rp_node_id,
      requestStatusConfirmedPromise: requestStatusReceivedDataPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('IdP should receive confirmed with received data request status', async function () {
    this.timeout(20000);

    const testResult = await receiveConfirmedRequestStatusTest({
      nodeId: 'idp1',
      requestStatusConfirmedPromise: idp_requestStatusReceivedDataPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
      testForEqualLastStatusUpdateBlockHeight: true,
      isNotRp: true,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('AS (as1) should receive confirmed with received data request status', async function () {
    this.timeout(20000);

    const testResult = await receiveConfirmedRequestStatusTest({
      nodeId: 'as1',
      requestStatusConfirmedPromise: as_requestStatusReceivedDataPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
      testForEqualLastStatusUpdateBlockHeight: true,
      isNotRp: true,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('AS (as2) should receive confirmed with received data request status', async function () {
    this.timeout(20000);

    const testResult = await receiveConfirmedRequestStatusTest({
      nodeId: 'as2',
      requestStatusConfirmedPromise: as_requestStatusReceivedDataPromise2,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
      testForEqualLastStatusUpdateBlockHeight: true,
      isNotRp: true,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('AS (as2) response with error code unsuccessfully', async function () {
    this.timeout(200000);
    const response = await asApi.sendDataError('as2', {
      requestId,
      serviceId: createRequestParams.data_request_list[0].service_id,
      reference_id: as2ReferenceId,
      callback_url: config.AS2_CALLBACK_URL,
      error_code: asResponseErrorCode,
    });
    expect(response.status).to.equal(202);
    const sendDataResult = await sendDataResultPromise2.promise;
    expect(sendDataResult).to.deep.include({
      node_id: 'as2',
      type: 'send_data_result',
      reference_id: as2ReferenceId,
      success: true,
    });

    dataRequestList = setASResponseError(
      dataRequestList,
      createRequestParams.data_request_list[0].service_id,
      'as2',
      asResponseErrorCode,
    );
  });

  it('RP should receive errored request status', async function () {
    this.timeout(15000);

    const testResult = await receiveErroredRequestStatusTest({
      nodeId: rp_node_id,
      requestStatusErroredPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('IdP should receive errored request status', async function () {
    this.timeout(20000);

    const testResult = await receiveErroredRequestStatusTest({
      nodeId: 'idp1',
      requestStatusErroredPromise: idp_requestStatusErroredPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
      testForEqualLastStatusUpdateBlockHeight: true,
      isNotRp: true,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('AS (as1) should receive errored request status', async function () {
    this.timeout(20000);

    const testResult = await receiveErroredRequestStatusTest({
      nodeId: 'as1',
      requestStatusErroredPromise: as_requestStatusErroredPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
      testForEqualLastStatusUpdateBlockHeight: true,
      isNotRp: true,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('AS (as2) should receive errored request status', async function () {
    this.timeout(20000);

    const testResult = await receiveErroredRequestStatusTest({
      nodeId: 'as2',
      requestStatusErroredPromise: as_requestStatusErroredPromise2,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
      testForEqualLastStatusUpdateBlockHeight: true,
      isNotRp: true,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('RP should receive request closed status', async function () {
    this.timeout(10000);

    const testResult = await receiveRequestClosedStatusTest({
      nodeId: rp_node_id,
      requestClosedPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      status: 'errored',
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('IdP should receive request closed status', async function () {
    this.timeout(15000);

    await receiveRequestClosedStatusTest({
      nodeId: idp_node_id,
      requestClosedPromise: idp_requestClosedPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      status: 'errored',
      lastStatusUpdateBlockHeight,
      testForEqualLastStatusUpdateBlockHeight: true,
      requesterNodeId: requester_node_id,
    });
  });

  it('AS (as1) should receive request closed status', async function () {
    this.timeout(15000);

    await receiveRequestClosedStatusTest({
      nodeId: 'as1',
      requestClosedPromise: as_requestClosedPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      status: 'errored',
      lastStatusUpdateBlockHeight,
      testForEqualLastStatusUpdateBlockHeight: true,
      requesterNodeId: requester_node_id,
    });
  });

  it('AS (as2) should receive request closed status', async function () {
    this.timeout(15000);

    await receiveRequestClosedStatusTest({
      nodeId: 'as2',
      requestClosedPromise: as_requestClosedPromise2,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      status: 'errored',
      lastStatusUpdateBlockHeight,
      testForEqualLastStatusUpdateBlockHeight: true,
      requesterNodeId: requester_node_id,
    });
    await wait(3000);
  });

  it('Should get request status with errored status and closed successfully', async function () {
    this.timeout(10000);

    let response_list = idpResponseParams.map((idpResponse) => {
      const {
        reference_id,
        callback_url,
        request_id,
        accessor_id,
        node_id,
        ...rest
      } = idpResponse;

      if (createRequestParams.mode === 1) {
        rest.valid_signature = null;
        rest.valid_ial = null;
      }
      return rest;
    });

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
      response_list,
      closed: true,
      timed_out: false,
      mode: 1,
      requester_node_id: requester_node_id,
      status: 'errored',
    });
  });

  it('RP should get the data received from AS', async function () {
    this.timeout(100000);
    const response = await rpApi.getDataFromAS('rp1', {
      requestId,
    });
    expect(response.status).to.equal(200);
    const dataArr = await response.json();
    expect(dataArr).to.have.lengthOf(1);
    expect(dataArr[0]).to.deep.include({
      source_node_id: 'as1',
      service_id: createRequestParams.data_request_list[0].service_id,
      signature_sign_method: 'RSA-SHA256',
      data,
    });
    expect(dataArr[0].source_signature).to.be.a('string').that.is.not.empty;
    expect(dataArr[0].data_salt).to.be.a('string').that.is.not.empty;
  });

  after(function () {
    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
    as1EventEmitter.removeAllListeners('callback');
    as2EventEmitter.removeAllListeners('callback');
  });
});

describe('RP create request (mode 1) min_as = 2 to 2 AS and 1st AS response error and 2nd AS should not response', function () {
  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const asReferenceId = generateReferenceId();
  const as2ReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise();
  const requestStatusPendingPromise = createEventPromise();
  const requestStatusErroredPromise = createEventPromise();
  const requestClosedPromise = createEventPromise();

  const incomingRequestPromise = createEventPromise(); // idp1
  const responseResultPromise = createEventPromise();
  const idp_requestStatusErroredPromise = createEventPromise();
  const idp_requestClosedPromise = createEventPromise();

  const dataRequestReceivedPromise = createEventPromise();
  const sendDataResultPromise = createEventPromise();
  const as_requestStatusErroredPromise = createEventPromise();
  const as_requestClosedPromise = createEventPromise();

  const dataRequestReceivedPromise2 = createEventPromise();
  const sendDataResultPromise2 = createEventPromise();
  const as_requestStatusErroredPromise2 = createEventPromise();
  const as_requestClosedPromise2 = createEventPromise();

  let createRequestParams;
  let lastStatusUpdateBlockHeight;

  let requestId;
  let initialSalt;

  let namespace;
  let identifier;

  let rp_node_id = 'rp1';
  let requester_node_id = 'rp1';
  let idp_node_id = 'idp1';
  let idpIdList;
  let dataRequestList;
  let idpResponseParams = [];
  let requestMessageHash;

  let asResponseErrorCode = 1000;

  const data = JSON.stringify({
    test: 'test',
    withEscapedChar: 'test|fff||ss\\|NN\\\\|',
    arr: [1, 2, 3],
  });

  before(async function () {
    namespace = 'citizen_id';
    identifier = '01234567890123';

    createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 1,
      namespace,
      identifier,
      idp_id_list: ['idp1', 'idp2'],
      data_request_list: [
        {
          service_id: 'bank_statement',
          as_id_list: ['as1', 'as2'],
          min_as: 2,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
      ],
      request_message: 'Test request message (error data response)',
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
        if (callbackData.status === 'pending') {
          requestStatusPendingPromise.resolve(callbackData);
        } else if (callbackData.status === 'errored') {
          if (callbackData.closed) {
            requestClosedPromise.resolve(callbackData);
          } else {
            requestStatusErroredPromise.resolve(callbackData);
          }
        }
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
          if (callbackData.closed) {
            idp_requestClosedPromise.resolve(callbackData);
          } else {
            idp_requestStatusErroredPromise.resolve(callbackData);
          }
        }
      }
    });

    as1EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'data_request' &&
        callbackData.request_id === requestId
      ) {
        dataRequestReceivedPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'send_data_result' &&
        callbackData.reference_id === asReferenceId
      ) {
        sendDataResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === requestId
      ) {
        if (callbackData.status === 'errored') {
          if (callbackData.closed) {
            as_requestClosedPromise.resolve(callbackData);
          } else {
            as_requestStatusErroredPromise.resolve(callbackData);
          }
        }
      }
    });

    as2EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'data_request' &&
        callbackData.request_id === requestId
      ) {
        dataRequestReceivedPromise2.resolve(callbackData);
      } else if (
        callbackData.type === 'send_data_result' &&
        callbackData.reference_id === as2ReferenceId
      ) {
        sendDataResultPromise2.resolve(callbackData);
      } else if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === requestId
      ) {
        if (callbackData.status === 'errored') {
          if (callbackData.closed) {
            as_requestClosedPromise2.resolve(callbackData);
          } else {
            as_requestStatusErroredPromise2.resolve(callbackData);
          }
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
    const splittedCreationBlockHeight = createRequestResult.creation_block_height.split(
      ':',
    );
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

  it('IdP (idp1) should receive incoming request callback', async function () {
    this.timeout(15000);
    const incomingRequest = await incomingRequestPromise.promise;

    const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
      (dataRequest) => {
        const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
        return {
          ...dataRequestWithoutParams,
        };
      },
    );
    expect(incomingRequest).to.deep.include({
      node_id: 'idp1',
      type: 'incoming_request',
      mode: createRequestParams.mode,
      request_id: requestId,
      request_message: createRequestParams.request_message,
      request_message_hash: hash(
        createRequestParams.request_message +
          incomingRequest.request_message_salt,
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
    const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
      ':',
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('IdP (idp1) should create response (accept) successfully', async function () {
    this.timeout(15000);

    let idpResponse = {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      signature: 'some-signature',
    };

    idpResponseParams.push({
      ...idpResponse,
      idp_id: 'idp1',
      valid_signature: null,
      valid_ial: null,
    });

    let response = await idpApi.createResponse('idp1', idpResponse);
    expect(response.status).to.equal(202);
  });

  it('IdP (idp1) should receive callback create response result with success = true', async function () {
    this.timeout(15000);
    const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      node_id: 'idp1',
      type: 'response_result',
      reference_id: idpReferenceId,
      request_id: requestId,
      success: true,
    });
  });

  it('AS (as1) should receive data request', async function () {
    this.timeout(15000);
    const dataRequest = await dataRequestReceivedPromise.promise;
    expect(dataRequest).to.deep.include({
      type: 'data_request',
      request_id: requestId,
      mode: createRequestParams.mode,
      namespace,
      identifier,
      service_id: createRequestParams.data_request_list[0].service_id,
      request_params: createRequestParams.data_request_list[0].request_params,
      requester_node_id: 'rp1',
      max_ial: 2.3,
      max_aal: 3,

      request_timeout: createRequestParams.request_timeout,
    });
    expect(dataRequest.response_signature_list).to.have.lengthOf(1);
    expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is.not
      .empty;
    expect(dataRequest.creation_time).to.be.a('number');
    expect(dataRequest.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight = dataRequest.creation_block_height.split(
      ':',
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('AS (as2) should receive data request', async function () {
    this.timeout(15000);
    const dataRequest = await dataRequestReceivedPromise2.promise;
    expect(dataRequest).to.deep.include({
      type: 'data_request',
      request_id: requestId,
      mode: createRequestParams.mode,
      namespace,
      identifier,
      service_id: createRequestParams.data_request_list[0].service_id,
      request_params: createRequestParams.data_request_list[0].request_params,
      requester_node_id: 'rp1',
      max_ial: 2.3,
      max_aal: 3,

      request_timeout: createRequestParams.request_timeout,
    });
    expect(dataRequest.response_signature_list).to.have.lengthOf(1);
    expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is.not
      .empty;
    expect(dataRequest.creation_time).to.be.a('number');
    expect(dataRequest.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight = dataRequest.creation_block_height.split(
      ':',
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('AS (as1) response data successfully', async function () {
    this.timeout(15000);
    const response = await asApi.sendDataError('as1', {
      requestId,
      serviceId: createRequestParams.data_request_list[0].service_id,
      reference_id: asReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      error_code: asResponseErrorCode,
    });
    expect(response.status).to.equal(202);

    const sendDataResult = await sendDataResultPromise.promise;
    expect(sendDataResult).to.deep.include({
      node_id: 'as1',
      type: 'send_data_result',
      reference_id: asReferenceId,
      success: true,
    });

    dataRequestList = setASResponseError(
      dataRequestList,
      createRequestParams.data_request_list[0].service_id,
      'as1',
      asResponseErrorCode,
    );
  });

  it('AS (as2) response with error code unsuccessfully', async function () {
    this.timeout(200000);
    const response = await asApi.sendDataError('as2', {
      requestId,
      serviceId: createRequestParams.data_request_list[0].service_id,
      reference_id: as2ReferenceId,
      callback_url: config.AS2_CALLBACK_URL,
      error_code: asResponseErrorCode,
    });
    if (response.status === 202) {
      expect(response.status).to.equal(202);
      const sendDataResult = await sendDataResultPromise2.promise;
      expect(sendDataResult).to.deep.include({
        node_id: 'as2',
        type: 'send_data_result',
        reference_id: as2ReferenceId,
        success: false,
      });
    } else {
      const responseBody = await response.json();
      expect(responseBody.error.code).to.equal(20082);
    }
  });

  it('RP should receive errored request status', async function () {
    this.timeout(15000);

    const testResult = await receiveErroredRequestStatusTest({
      nodeId: rp_node_id,
      requestStatusErroredPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('IdP should receive errored request status', async function () {
    this.timeout(20000);

    const testResult = await receiveErroredRequestStatusTest({
      nodeId: 'idp1',
      requestStatusErroredPromise: idp_requestStatusErroredPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
      testForEqualLastStatusUpdateBlockHeight: true,
      isNotRp: true,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('AS (as1) should receive errored request status', async function () {
    this.timeout(20000);

    const testResult = await receiveErroredRequestStatusTest({
      nodeId: 'as1',
      requestStatusErroredPromise: as_requestStatusErroredPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
      testForEqualLastStatusUpdateBlockHeight: true,
      isNotRp: true,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('AS (as2) should receive errored request status', async function () {
    this.timeout(20000);

    const testResult = await receiveErroredRequestStatusTest({
      nodeId: 'as2',
      requestStatusErroredPromise: as_requestStatusErroredPromise2,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
      testForEqualLastStatusUpdateBlockHeight: true,
      isNotRp: true,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('RP should receive request closed status', async function () {
    this.timeout(10000);

    const testResult = await receiveRequestClosedStatusTest({
      nodeId: rp_node_id,
      requestClosedPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      status: 'errored',
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('IdP should receive request closed status', async function () {
    this.timeout(15000);

    await receiveRequestClosedStatusTest({
      nodeId: idp_node_id,
      requestClosedPromise: idp_requestClosedPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      status: 'errored',
      lastStatusUpdateBlockHeight,
      testForEqualLastStatusUpdateBlockHeight: true,
      requesterNodeId: requester_node_id,
    });
  });

  it('AS (as1) should receive request closed status', async function () {
    this.timeout(15000);

    await receiveRequestClosedStatusTest({
      nodeId: 'as1',
      requestClosedPromise: as_requestClosedPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      status: 'errored',
      lastStatusUpdateBlockHeight,
      testForEqualLastStatusUpdateBlockHeight: true,
      requesterNodeId: requester_node_id,
    });
  });

  it('AS (as2) should receive request closed status', async function () {
    this.timeout(15000);

    await receiveRequestClosedStatusTest({
      nodeId: 'as2',
      requestClosedPromise: as_requestClosedPromise2,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      status: 'errored',
      lastStatusUpdateBlockHeight,
      testForEqualLastStatusUpdateBlockHeight: true,
      requesterNodeId: requester_node_id,
    });
    await wait(3000);
  });

  it('Should get request status with errored status and closed successfully', async function () {
    this.timeout(10000);

    let response_list = idpResponseParams.map((idpResponse) => {
      const {
        reference_id,
        callback_url,
        request_id,
        accessor_id,
        node_id,
        ...rest
      } = idpResponse;

      if (createRequestParams.mode === 1) {
        rest.valid_signature = null;
        rest.valid_ial = null;
      }
      return rest;
    });

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
      response_list,
      closed: true,
      timed_out: false,
      mode: 1,
      requester_node_id: requester_node_id,
      status: 'errored',
    });
  });

  it('RP should get empty data received from AS', async function () {
    this.timeout(100000);
    const response = await rpApi.getDataFromAS('rp1', {
      requestId,
    });
    const dataArr = await response.json();
    expect(response.status).to.equal(200);

    expect(dataArr).to.be.an('array').to.be.empty;
  });

  after(function () {
    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
    as1EventEmitter.removeAllListeners('callback');
    as2EventEmitter.removeAllListeners('callback');
  });
});

// TODO: min_as = 2 to 3 as ???
