import crypto from 'crypto';
import { expect } from 'chai';

import { idp2Available } from '../..';
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
} from '../_fragments/fragments_utils';
import {
  receivePendingRequestStatusTest,
  receiveConfirmedRequestStatusTest,
  receiveErroredRequestStatusTest,
  receiveCompletedRequestStatusTest,
  receiveRequestClosedStatusTest,
} from '../_fragments/common';
import * as config from '../../../config';
import { getAndVerifyRequestMessagePaddedHashTest } from '../_fragments/request_flow_fragments/idp';

describe('RP create request (mode 1) min_idp = 1 and IdP response with an error code', function () {
  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise();
  const requestStatusPendingPromise = createEventPromise();
  const requestStatusErroredPromise = createEventPromise();

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
  let nonExistingErrorCode = 9999;

  before(async function () {
    this.skip();
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
      console.log(callbackData);
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
      console.log(callbackData);
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
      error_code: idpResponseErrorCode,
    };

    idpResponseParams.push({
      ...idpResponse,
      idp_id: 'idp1',
      valid_signature: null,
      valid_ial: null,
    });

    const response = await idpApi.createErrorResponse('idp1', idpResponse);
    expect(response.status).to.equal(202);
  });

  it('IdP shoud receive callback create response result with success = true', async function () {
    const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      node_id: 'idp1',
      type: 'response_result',
      reference_id: idpReferenceId,
      request_id: requestId,
      success: true,
    });
  });

  // it('RP should receive errored request status', async function () {
  //   this.timeout(15000);

  //   const testResult = await receiveErroredRequestStatusTest({
  //     nodeId: rp_node_id,
  //     requestStatusErroredPromise,
  //     requestId,
  //     createRequestParams,
  //     dataRequestList,
  //     idpResponse: idpResponseParams,
  //     requestMessageHash,
  //     idpIdList,
  //     lastStatusUpdateBlockHeight,
  //     requesterNodeId: requester_node_id,
  //   });
  //   lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  // });

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
      // testForEqualLastStatusUpdateBlockHeight: true,
      isNotRp: true,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;

    await wait(3000); //wait for data propagate
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
      response_list: [
        {
          idp_id: idp_node_id,
          valid_ial: null,
          valid_signature: null,
          error_code: idpResponseErrorCode,
        },
      ],
      closed: false,
      timed_out: false,
      mode: 1,
      requester_node_id: requester_node_id,
      status: 'errored',
    });
  });
});

describe('RP create request (mode 1) min_idp = 1 to 2 idps and first IdP response with an error code', function () {
  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const idp2ReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise();
  const requestStatusPendingPromise = createEventPromise();
  const requestStatusErroredPromise = createEventPromise();

  const incomingRequestPromise = createEventPromise(); // idp1
  const responseResultPromise = createEventPromise();

  const incomingRequestPromise2 = createEventPromise(); // idp2
  const responseResultPromise2 = createEventPromise(); // idp2

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
  let idpIdList;
  let dataRequestList;
  let idpResponseParams = [];
  let requestMessageHash;

  let idpResponseErrorCode = 1000;

  before(async function () {
    this.skip();
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
      console.log(callbackData);
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
      console.log(callbackData);
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

    idp2EventEmitter.on('callback', function (callbackData) {
      console.log(callbackData);
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId
      ) {
        incomingRequestPromise2.resolve(callbackData);
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.reference_id === idp2ReferenceId
      ) {
        responseResultPromise2.resolve(callbackData);
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

  it('IdP should receive incoming request callback', async function () {
    this.timeout(15000);
    const incomingRequest = await incomingRequestPromise2.promise;

    const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
      (dataRequest) => {
        const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
        return {
          ...dataRequestWithoutParams,
        };
      },
    );
    expect(incomingRequest).to.deep.include({
      node_id: 'idp2',
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

  it('IdP (idp1) should create response (error) successfully', async function () {
    this.timeout(15000);

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

    let response = await idpApi.createErrorResponse('idp1', idpResponse);
    expect(response.status).to.equal(202);
  });

  it('IdP shoud receive callback create response result with success = true', async function () {
    this.timeout(15000);
    const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      node_id: 'idp1',
      type: 'response_result',
      reference_id: idpReferenceId,
      request_id: requestId,
      success: true,
    });

    await wait(3000);
  });

  it('IdP (idp2) should create response (error) unsuccessfully', async function () {
    this.timeout(10000);

    let idpResponse = {
      reference_id: idp2ReferenceId,
      callback_url: config.IDP2_CALLBACK_URL,
      request_id: requestId,
      error_code: idpResponseErrorCode,
    };

    const response = await idpApi.createErrorResponse('idp2', idpResponse);
    expect(response.status).to.equal(202);
  });

  it('IdP (idp2) shoud receive callback create response result with success = false', async function () {
    this.timeout(15000);
    const responseResult = await responseResultPromise2.promise;
    expect(responseResult).to.deep.include({
      node_id: 'idp2',
      type: 'response_result',
      reference_id: idp2ReferenceId,
      request_id: requestId,
      success: false,
    });
  });

  // it('RP should receive errored request status', async function () {
  //   this.timeout(15000);

  //   const testResult = await receiveErroredRequestStatusTest({
  //     nodeId: rp_node_id,
  //     requestStatusErroredPromise,
  //     requestId,
  //     createRequestParams,
  //     dataRequestList,
  //     idpResponse: idpResponseParams,
  //     requestMessageHash,
  //     idpIdList,
  //     lastStatusUpdateBlockHeight,
  //     requesterNodeId: requester_node_id,
  //   });
  //   lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  // });

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
      // testForEqualLastStatusUpdateBlockHeight: true,
      isNotRp: true,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;

    await wait(3000); //wait for data propagate
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
      response_list: [
        {
          idp_id: 'idp1',
          valid_ial: null,
          valid_signature: null,
          error_code: idpResponseErrorCode,
        },
      ],
      closed: false,
      timed_out: false,
      mode: 1,
      requester_node_id: requester_node_id,
      status: 'errored',
    });
  });
});

describe('RP create request (mode 1) min_idp = 2 to 2 idps and 1st IdP response error code and 2nd response accept', function () {
  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const idp2ReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise();
  const requestStatusPendingPromise = createEventPromise();
  const requestStatusErroredPromise = createEventPromise();

  const incomingRequestPromise = createEventPromise(); // idp1
  const responseResultPromise = createEventPromise();

  const incomingRequestPromise2 = createEventPromise(); // idp2
  const responseResultPromise2 = createEventPromise(); // idp2

  const idp_requestStatusErroredPromise = createEventPromise();
  const idp_requestStatusErroredPromise2 = createEventPromise();

  let createRequestParams;
  let lastStatusUpdateBlockHeight;

  let requestId;
  let initialSalt;

  let namespace;
  let identifier;

  let requestStatusUpdates = [];
  let rp_node_id = 'rp1';
  let requester_node_id = 'rp1';
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
      idp_id_list: ['idp1', 'idp2'],
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
      min_idp: 2,
      request_timeout: 86400,
      bypass_identity_check: false,
    };

    rpEventEmitter.on('callback', function (callbackData) {
      console.log(callbackData);
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
      console.log(callbackData);
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

    idp2EventEmitter.on('callback', function (callbackData) {
      console.log(callbackData);
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId
      ) {
        incomingRequestPromise2.resolve(callbackData);
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.reference_id === idp2ReferenceId
      ) {
        responseResultPromise2.resolve(callbackData);
      } else if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === requestId
      ) {
        if (callbackData.status === 'errored') {
          idp_requestStatusErroredPromise2.resolve(callbackData);
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

  it('IdP should receive incoming request callback', async function () {
    this.timeout(15000);
    const incomingRequest = await incomingRequestPromise2.promise;

    const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
      (dataRequest) => {
        const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
        return {
          ...dataRequestWithoutParams,
        };
      },
    );
    expect(incomingRequest).to.deep.include({
      node_id: 'idp2',
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

  it('IdP (idp1) should create response (error) successfully', async function () {
    this.timeout(15000);

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

    let response = await idpApi.createErrorResponse('idp1', idpResponse);
    expect(response.status).to.equal(202);
  });

  it('IdP shoud receive callback create response result with success = true', async function () {
    this.timeout(15000);
    const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      node_id: 'idp1',
      type: 'response_result',
      reference_id: idpReferenceId,
      request_id: requestId,
      success: true,
    });

    await wait(3000);
  });

  it('IdP (idp2) should create response (error) successfully', async function () {
    this.timeout(10000);

    let idpResponse = {
      reference_id: idp2ReferenceId,
      callback_url: config.IDP2_CALLBACK_URL,
      request_id: requestId,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      signature: 'some-signature',
    };
    const response = await idpApi.createResponse('idp2', idpResponse);
    expect(response.status).to.equal(202);
  });

  it('IdP (idp2) shoud receive callback create response result with success = false', async function () {
    this.timeout(15000);
    const responseResult = await responseResultPromise2.promise;
    expect(responseResult).to.deep.include({
      node_id: 'idp2',
      type: 'response_result',
      reference_id: idp2ReferenceId,
      request_id: requestId,
      success: true,
    });
  });

  // it('RP should receive errored request status', async function () {
  //   this.timeout(15000);

  //   const testResult = await receiveErroredRequestStatusTest({
  //     nodeId: rp_node_id,
  //     requestStatusErroredPromise,
  //     requestId,
  //     createRequestParams,
  //     dataRequestList,
  //     idpResponse: idpResponseParams,
  //     requestMessageHash,
  //     idpIdList,
  //     lastStatusUpdateBlockHeight,
  //     requesterNodeId: requester_node_id,
  //   });
  //   lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  // });

  it('IdP (idp1) should receive errored request status', async function () {
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
      // testForEqualLastStatusUpdateBlockHeight: true,
      isNotRp: true,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('IdP (idp2) should receive errored request status', async function () {
    this.timeout(20000);

    const testResult = await receiveErroredRequestStatusTest({
      nodeId: 'idp2',
      requestStatusErroredPromise: idp_requestStatusErroredPromise2,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
      // testForEqualLastStatusUpdateBlockHeight: true,
      isNotRp: true,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;

    await wait(3000); //wait for data propagate
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
      response_list: [
        {
          idp_id: 'idp1',
          valid_ial: null,
          valid_signature: null,
          error_code: idpResponseErrorCode,
        },
        {
          idp_id: 'idp2',
          ial: 2.3,
          aal: 3,
          valid_ial: null,
          valid_signature: null,
          status: 'accept',
        },
      ],
      closed: false,
      timed_out: false,
      mode: 1,
      requester_node_id: requester_node_id,
      status: 'errored',
    });
  });
});

describe('RP create request (mode 1) min_idp = 2 to 2 idps and 1st IdP response error code and 2nd response reject', function () {
  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const idp2ReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise();
  const requestStatusPendingPromise = createEventPromise();
  const requestStatusErroredPromise = createEventPromise();

  const incomingRequestPromise = createEventPromise(); // idp1
  const responseResultPromise = createEventPromise();

  const incomingRequestPromise2 = createEventPromise(); // idp2
  const responseResultPromise2 = createEventPromise(); // idp2

  const idp_requestStatusErroredPromise = createEventPromise();
  const idp_requestStatusErroredPromise2 = createEventPromise();

  let createRequestParams;
  let lastStatusUpdateBlockHeight;

  let requestId;
  let initialSalt;

  let namespace;
  let identifier;

  let requestStatusUpdates = [];
  let rp_node_id = 'rp1';
  let requester_node_id = 'rp1';
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
      idp_id_list: ['idp1', 'idp2'],
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
      min_idp: 2,
      request_timeout: 86400,
      bypass_identity_check: false,
    };

    rpEventEmitter.on('callback', function (callbackData) {
      console.log(callbackData);
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
      console.log(callbackData);
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

    idp2EventEmitter.on('callback', function (callbackData) {
      console.log(callbackData);
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId
      ) {
        incomingRequestPromise2.resolve(callbackData);
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.reference_id === idp2ReferenceId
      ) {
        responseResultPromise2.resolve(callbackData);
      } else if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === requestId
      ) {
        if (callbackData.status === 'errored') {
          idp_requestStatusErroredPromise2.resolve(callbackData);
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

  it('IdP should receive incoming request callback', async function () {
    this.timeout(15000);
    const incomingRequest = await incomingRequestPromise2.promise;

    const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
      (dataRequest) => {
        const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
        return {
          ...dataRequestWithoutParams,
        };
      },
    );
    expect(incomingRequest).to.deep.include({
      node_id: 'idp2',
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

  it('IdP (idp1) should create response (error) successfully', async function () {
    this.timeout(15000);

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

    let response = await idpApi.createErrorResponse('idp1', idpResponse);
    expect(response.status).to.equal(202);
  });

  it('IdP shoud receive callback create response result with success = true', async function () {
    this.timeout(15000);
    const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      node_id: 'idp1',
      type: 'response_result',
      reference_id: idpReferenceId,
      request_id: requestId,
      success: true,
    });

    await wait(3000);
  });

  it('IdP (idp2) should create response (error) successfully', async function () {
    this.timeout(10000);

    let idpResponse = {
      reference_id: idp2ReferenceId,
      callback_url: config.IDP2_CALLBACK_URL,
      request_id: requestId,
      ial: 2.3,
      aal: 3,
      status: 'reject',
      signature: 'some-signature',
    };
    const response = await idpApi.createResponse('idp2', idpResponse);
    expect(response.status).to.equal(202);
  });

  it('IdP (idp2) shoud receive callback create response result with success = false', async function () {
    this.timeout(15000);
    const responseResult = await responseResultPromise2.promise;
    expect(responseResult).to.deep.include({
      node_id: 'idp2',
      type: 'response_result',
      reference_id: idp2ReferenceId,
      request_id: requestId,
      success: true,
    });
  });

  // it('RP should receive errored request status', async function () {
  //   this.timeout(15000);

  //   const testResult = await receiveErroredRequestStatusTest({
  //     nodeId: rp_node_id,
  //     requestStatusErroredPromise,
  //     requestId,
  //     createRequestParams,
  //     dataRequestList,
  //     idpResponse: idpResponseParams,
  //     requestMessageHash,
  //     idpIdList,
  //     lastStatusUpdateBlockHeight,
  //     requesterNodeId: requester_node_id,
  //   });
  //   lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  // });

  it('IdP (idp1) should receive errored request status', async function () {
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
      // testForEqualLastStatusUpdateBlockHeight: true,
      isNotRp: true,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('IdP (idp2) should receive errored request status', async function () {
    this.timeout(20000);

    const testResult = await receiveErroredRequestStatusTest({
      nodeId: 'idp2',
      requestStatusErroredPromise: idp_requestStatusErroredPromise2,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
      // testForEqualLastStatusUpdateBlockHeight: true,
      isNotRp: true,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;

    await wait(3000); //wait for data propagate
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
      response_list: [
        {
          idp_id: 'idp1',
          valid_ial: null,
          valid_signature: null,
          error_code: idpResponseErrorCode,
        },
        {
          idp_id: 'idp2',
          ial: 2.3,
          aal: 3,
          valid_ial: null,
          valid_signature: null,
          status: 'reject',
        },
      ],
      closed: false,
      timed_out: false,
      mode: 1,
      requester_node_id: requester_node_id,
      status: 'errored',
    });
  });
});

describe('RP create request (mode 1) min_idp = 2 to 2 idps and 1st IdP response error code and 2nd response error', function () {
  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const idp2ReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise();
  const requestStatusPendingPromise = createEventPromise();
  const requestStatusErroredPromise = createEventPromise();

  const incomingRequestPromise = createEventPromise(); // idp1
  const responseResultPromise = createEventPromise();

  const incomingRequestPromise2 = createEventPromise(); // idp2
  const responseResultPromise2 = createEventPromise(); // idp2

  const idp_requestStatusErroredPromise = createEventPromise();
  const idp_requestStatusErroredPromise2 = createEventPromise();

  let createRequestParams;
  let lastStatusUpdateBlockHeight;

  let requestId;
  let initialSalt;

  let namespace;
  let identifier;

  let requestStatusUpdates = [];
  let rp_node_id = 'rp1';
  let requester_node_id = 'rp1';
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
      idp_id_list: ['idp1', 'idp2'],
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
      min_idp: 2,
      request_timeout: 86400,
      bypass_identity_check: false,
    };

    rpEventEmitter.on('callback', function (callbackData) {
      console.log(callbackData);
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
      console.log(callbackData);
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

    idp2EventEmitter.on('callback', function (callbackData) {
      console.log(callbackData);
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId
      ) {
        incomingRequestPromise2.resolve(callbackData);
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.reference_id === idp2ReferenceId
      ) {
        responseResultPromise2.resolve(callbackData);
      } else if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === requestId
      ) {
        if (callbackData.status === 'errored') {
          idp_requestStatusErroredPromise2.resolve(callbackData);
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

  it('IdP should receive incoming request callback', async function () {
    this.timeout(15000);
    const incomingRequest = await incomingRequestPromise2.promise;

    const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
      (dataRequest) => {
        const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
        return {
          ...dataRequestWithoutParams,
        };
      },
    );
    expect(incomingRequest).to.deep.include({
      node_id: 'idp2',
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

  it('IdP (idp1) should create response (error) successfully', async function () {
    this.timeout(15000);

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

    let response = await idpApi.createErrorResponse('idp1', idpResponse);
    expect(response.status).to.equal(202);
  });

  it('IdP shoud receive callback create response result with success = true', async function () {
    this.timeout(15000);
    const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      node_id: 'idp1',
      type: 'response_result',
      reference_id: idpReferenceId,
      request_id: requestId,
      success: true,
    });

    await wait(3000);
  });

  it('IdP (idp2) should create response (error) successfully', async function () {
    this.timeout(10000);

    let idpResponse = {
      reference_id: idp2ReferenceId,
      callback_url: config.IDP2_CALLBACK_URL,
      request_id: requestId,
      error_code: idpResponseErrorCode,
    };
    const response = await idpApi.createErrorResponse('idp2', idpResponse);
    expect(response.status).to.equal(202);
  });

  it('IdP (idp2) shoud receive callback create response result with success = false', async function () {
    this.timeout(15000);
    const responseResult = await responseResultPromise2.promise;
    expect(responseResult).to.deep.include({
      node_id: 'idp2',
      type: 'response_result',
      reference_id: idp2ReferenceId,
      request_id: requestId,
      success: true,
    });
  });

  // it('RP should receive errored request status', async function () {
  //   this.timeout(15000);

  //   const testResult = await receiveErroredRequestStatusTest({
  //     nodeId: rp_node_id,
  //     requestStatusErroredPromise,
  //     requestId,
  //     createRequestParams,
  //     dataRequestList,
  //     idpResponse: idpResponseParams,
  //     requestMessageHash,
  //     idpIdList,
  //     lastStatusUpdateBlockHeight,
  //     requesterNodeId: requester_node_id,
  //   });
  //   lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  // });

  it('IdP (idp1) should receive errored request status', async function () {
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
      // testForEqualLastStatusUpdateBlockHeight: true,
      isNotRp: true,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('IdP (idp2) should receive errored request status', async function () {
    this.timeout(20000);

    const testResult = await receiveErroredRequestStatusTest({
      nodeId: 'idp2',
      requestStatusErroredPromise: idp_requestStatusErroredPromise2,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
      // testForEqualLastStatusUpdateBlockHeight: true,
      isNotRp: true,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;

    await wait(3000); //wait for data propagate
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
      response_list: [
        {
          idp_id: 'idp1',
          valid_ial: null,
          valid_signature: null,
          error_code: idpResponseErrorCode,
        },
        {
          idp_id: 'idp2',
          valid_ial: null,
          valid_signature: null,
          error_code: idpResponseErrorCode,
        },
      ],
      closed: false,
      timed_out: false,
      mode: 1,
      requester_node_id: requester_node_id,
      status: 'errored',
    });
  });
});