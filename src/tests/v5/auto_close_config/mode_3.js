import { expect } from 'chai';

import * as rpApi from '../../../api/v5/rp';
import * as idpApi from '../../../api/v5/idp';
import * as commonApi from '../../../api/v5/common';
import * as miscApi from '../../../api/common';
import {
  idp1EventEmitter,
  rpEventEmitter,
  as1EventEmitter,
  idp2EventEmitter,
  idp3EventEmitter,
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
  receiveRejectedRequestStatusTest,
  receiveComplicatedRequestStatusTest,
  receiveCompletedRequestStatusTest,
  receiveRequestClosedStatusTest,
} from '../_fragments/common';
import * as config from '../../../config';
import { getAndVerifyRequestMessagePaddedHashTest } from '../_fragments/request_flow_fragments/idp';

describe('mode 3, auto close on completed set to off', function () {
  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const rpCloseRequestReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise();
  const requestStatusPendingPromise = createEventPromise();
  const requestStatusCompletedPromise = createEventPromise();
  const requestClosedPromise = createEventPromise();

  const closeRequestResultPromise = createEventPromise();

  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise();

  const idp_requestStatusCompletedPromise = createEventPromise();
  const idp_requestClosedPromise = createEventPromise();


  let createRequestParams;
  let lastStatusUpdateBlockHeight;

  let requestId;
  let initialSalt;

  let namespace;
  let identifier;
  let identityForResponse;
  let responseAccessorId;
  let requestMessagePaddedHash;

  let rp_node_id = 'rp1';
  let requester_node_id = 'rp1';
  let idp_node_id = 'idp1';
  let idpIdList;
  let dataRequestList;
  let idpResponseParams = [];
  let requestMessageHash;

  before(async function () {
    const identity = db.idp1Identities.find(
      (identity) =>
        identity.mode === 3 && identity.relevantAllIdP,
    );
    namespace = identity.namespace;
    identifier = identity.identifier;

    createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 3,
      namespace,
      identifier,
      idp_id_list: ['idp1'],
      data_request_list: [],
      request_message: 'Test request message ()',
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
        } else if (callbackData.status === 'completed') {
          if (callbackData.closed) {
            requestClosedPromise.resolve(callbackData);
          }
          else {
            requestStatusCompletedPromise.resolve(callbackData);
          }
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
        if (callbackData.status === 'completed') {
          if (callbackData.closed) {
            idp_requestClosedPromise.resolve(callbackData);
          } else {
            idp_requestStatusCompletedPromise.resolve(callbackData);
          }
        }
      }
    });
  });

  it('RP should set auto close config successfully', async function () {
    this.timeout(15000);

    const response = await miscApi.setConfig('rp1', {
      AUTO_CLOSE_REQUEST_ON_COMPLETED: false,
    });

    const responseBody = await response.json();
    expect(responseBody.autoCloseRequestOnCompleted).to.equal(false);

    const responseGetConfig = await miscApi.getConfig('rp1');
    const responseBodyGetConfig = await responseGetConfig.json();
    expect(responseBodyGetConfig.autoCloseRequestOnCompleted).to.equal(false);
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
      ':'
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
      }
    );
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
    const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
      ':'
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('IdP (idp1) should get request_message_padded_hash successfully', async function () {
    this.timeout(15000);
    identityForResponse = db.idp1Identities.find(
      (identity) =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    let latestAccessor;
    if (identityForResponse) {
      latestAccessor = identityForResponse.accessors.length - 1;
    } else {
      throw new Error('Identity not found');
    }

    responseAccessorId =
      identityForResponse.accessors[latestAccessor].accessorId;

    let accessorPublicKey =
      identityForResponse.accessors[latestAccessor].accessorPublicKey;

    const testResult = await getAndVerifyRequestMessagePaddedHashTest({
      callApiAtNodeId: 'idp1',
      idpNodeId: 'idp1',
      requestId,
      incomingRequestPromise,
      accessorPublicKey,
      accessorId: responseAccessorId,
    });
    requestMessagePaddedHash = testResult.verifyRequestMessagePaddedHash;
  });

  it('IdP (idp1) should create response (accept) successfully', async function () {
    this.timeout(15000);

    let latestAccessor = identityForResponse.accessors.length - 1;

    let accessorPrivateKey =
      identityForResponse.accessors[latestAccessor].accessorPrivateKey;

    const signature = createResponseSignature(
      accessorPrivateKey,
      requestMessagePaddedHash
    );

    let idpResponse = {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      accessor_id: responseAccessorId,
      signature,
    };

    idpResponseParams.push({
      ...idpResponse,
      idp_id: 'idp1',
      valid_signature: true,
      valid_ial: true,
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

  it('Should get request status (not closed) successfully', async function () {
    this.timeout(15000);

    let response_list = idpResponseParams.map((idpResponse) => {
      const {
        reference_id,
        callback_url,
        request_id,
        accessor_id,
        node_id,
        ...rest
      } = idpResponse;
      rest.valid_signature = null;
      rest.valid_ial = null;
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
      closed: false,
      timed_out: false,
      mode: 3,
      requester_node_id: requester_node_id,
      status: 'completed',
    });
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
  });

  it('Should get request status (closed) successfully', async function () {
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
      mode: 3,
      requester_node_id: requester_node_id,
      status: 'completed',
    });
  });

  after(async function () {
    await miscApi.setConfig('rp1', {
      AUTO_CLOSE_REQUEST_ON_COMPLETED: true,
    });

    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
  });
});

describe('mode 3, auto close on rejected set to on', function () {
  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const rpCloseRequestReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise();
  const requestStatusPendingPromise = createEventPromise();
  const requestStatusRejectPromise = createEventPromise();
  const requestClosedPromise = createEventPromise();

  const closeRequestResultPromise = createEventPromise();

  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise();

  const idp_requestStatusRejectPromise = createEventPromise();
  const idp_requestClosedPromise = createEventPromise();


  let createRequestParams;
  let lastStatusUpdateBlockHeight;

  let requestId;
  let initialSalt;

  let namespace;
  let identifier;
  let identityForResponse;
  let responseAccessorId;
  let requestMessagePaddedHash;

  let rp_node_id = 'rp1';
  let requester_node_id = 'rp1';
  let idp_node_id = 'idp1';
  let idpIdList;
  let dataRequestList;
  let idpResponseParams = [];
  let requestMessageHash;

  before(async function () {
    const identity = db.idp1Identities.find(
      (identity) =>
        identity.mode === 3 && identity.relevantAllIdP,
    );
    namespace = identity.namespace;
    identifier = identity.identifier;

    createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 3,
      namespace,
      identifier,
      idp_id_list: ['idp1'],
      data_request_list: [],
      request_message: 'Test request message ()',
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
        } else if (callbackData.status === 'rejected') {
          if (callbackData.closed) {
            requestClosedPromise.resolve(callbackData);
          }
          else {
            requestStatusRejectPromise.resolve(callbackData);
          }
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
        if (callbackData.status === 'rejected') {
          if (callbackData.closed) {
            idp_requestClosedPromise.resolve(callbackData);
          } else {
            idp_requestStatusRejectPromise.resolve(callbackData);
          }
        }
      }
    });
  });

  it('RP should set auto close config successfully', async function () {
    this.timeout(15000);

    const response = await miscApi.setConfig('rp1', {
      AUTO_CLOSE_REQUEST_ON_REJECTED: true,
    });

    const responseBody = await response.json();
    expect(responseBody.autoCloseRequestOnRejected).to.equal(true);

    const responseGetConfig = await miscApi.getConfig('rp1');
    const responseBodyGetConfig = await responseGetConfig.json();
    expect(responseBodyGetConfig.autoCloseRequestOnRejected).to.equal(true);
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
      ':'
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
      }
    );
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
    const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
      ':'
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('IdP (idp1) should get request_message_padded_hash successfully', async function () {
    this.timeout(15000);
    identityForResponse = db.idp1Identities.find(
      (identity) =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    let latestAccessor;
    if (identityForResponse) {
      latestAccessor = identityForResponse.accessors.length - 1;
    } else {
      throw new Error('Identity not found');
    }

    responseAccessorId =
      identityForResponse.accessors[latestAccessor].accessorId;

    let accessorPublicKey =
      identityForResponse.accessors[latestAccessor].accessorPublicKey;

    const testResult = await getAndVerifyRequestMessagePaddedHashTest({
      callApiAtNodeId: 'idp1',
      idpNodeId: 'idp1',
      requestId,
      incomingRequestPromise,
      accessorPublicKey,
      accessorId: responseAccessorId,
    });
    requestMessagePaddedHash = testResult.verifyRequestMessagePaddedHash;
  });

  it('IdP (idp1) should create response (reject) successfully', async function () {
    this.timeout(15000);

    let latestAccessor = identityForResponse.accessors.length - 1;

    let accessorPrivateKey =
      identityForResponse.accessors[latestAccessor].accessorPrivateKey;

    const signature = createResponseSignature(
      accessorPrivateKey,
      requestMessagePaddedHash
    );

    let idpResponse = {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      ial: 2.3,
      aal: 3,
      status: 'reject',
      accessor_id: responseAccessorId,
      signature,
    };

    idpResponseParams.push({
      ...idpResponse,
      idp_id: 'idp1',
      valid_signature: true,
      valid_ial: true,
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

  it('RP should receive rejected request status', async function () {
    this.timeout(15000);

    const testResult = await receiveRejectedRequestStatusTest({
      nodeId: rp_node_id,
      requestStatusRejectPromise,
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

  it('IdP should receive rejected request status', async function () {
    this.timeout(20000);

    const testResult = await receiveRejectedRequestStatusTest({
      nodeId: 'idp1',
      requestStatusRejectPromise: idp_requestStatusRejectPromise,
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
      status: 'rejected',
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
      status: 'rejected',
      lastStatusUpdateBlockHeight,
      testForEqualLastStatusUpdateBlockHeight: true,
      requesterNodeId: requester_node_id,
    });

    await wait(3000);
  });

  it('Should get request status with rejected status and closed successfully', async function () {
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
      mode: 3,
      requester_node_id: requester_node_id,
      status: 'rejected',
    });
  });

  after(async function () {
    await miscApi.setConfig('rp1', {
      AUTO_CLOSE_REQUEST_ON_REJECTED: false,
    });

    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
  });
});

describe('mode 3, auto close on complicated set to true', function () {
  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const idp2ReferenceId = generateReferenceId();
  const rpCloseRequestReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise();
  const requestStatusPendingPromise = createEventPromise();
  const requestStatusComplicatedPromise = createEventPromise();
  const requestClosedPromise = createEventPromise();

  const closeRequestResultPromise = createEventPromise();

  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise();

  const incomingRequestPromise2 = createEventPromise(); // idp2
  const responseResultPromise2 = createEventPromise(); // idp2

  const idp_requestStatusComplicatedPromise = createEventPromise();
  const idp_requestClosedPromise = createEventPromise();


  let createRequestParams;
  let lastStatusUpdateBlockHeight;

  let requestId;
  let initialSalt;

  let namespace;
  let identifier;
  let identityForResponse;
  let responseAccessorId;
  let requestMessagePaddedHash;

  let rp_node_id = 'rp1';
  let requester_node_id = 'rp1';
  let idp_node_id = 'idp1';
  let idpIdList;
  let dataRequestList;
  let idpResponseParams = [];
  let requestMessageHash;

  before(async function () {
    const identity = db.idp1Identities.find(
      (identity) =>
        identity.mode === 3 && identity.relevantAllIdP,
    );

    if (!identity) {
      this.test.parent.pending = true;
      this.skip();
    }

    namespace = identity.namespace;
    identifier = identity.identifier;

    createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 3,
      namespace,
      identifier,
      idp_id_list: ['idp1', 'idp2'],
      data_request_list: [],
      request_message: 'Test request message ()',
      min_ial: 2.3,
      min_aal: 3,
      min_idp: 2,
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
        } else if (callbackData.status === 'complicated') {
          if (callbackData.closed) {
            requestClosedPromise.resolve(callbackData);
          }
          else {
            requestStatusComplicatedPromise.resolve(callbackData);
          }
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
        if (callbackData.status === 'complicated') {
          if (callbackData.closed) {
            idp_requestClosedPromise.resolve(callbackData);
          } else {
            idp_requestStatusComplicatedPromise.resolve(callbackData);
          }
        }
      }
    });

    idp2EventEmitter.on('callback', function (callbackData) {
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

  it('RP should set auto close config successfully', async function () {
    this.timeout(15000);

    const response = await miscApi.setConfig('rp1', {
      AUTO_CLOSE_REQUEST_ON_COMPLICATED: true,
    });

    const responseBody = await response.json();
    expect(responseBody.autoCloseRequestOnComplicated).to.equal(true);

    const responseGetConfig = await miscApi.getConfig('rp1');
    const responseBodyGetConfig = await responseGetConfig.json();
    expect(responseBodyGetConfig.autoCloseRequestOnComplicated).to.equal(true);
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
      ':'
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
      }
    );
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
    const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
      ':'
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('IdP (idp2) should receive incoming request callback', async function () {
    this.timeout(15000);
    const incomingRequest = await incomingRequestPromise2.promise;

    const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
      (dataRequest) => {
        const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
        return {
          ...dataRequestWithoutParams,
        };
      }
    );
    expect(incomingRequest).to.deep.include({
      node_id: 'idp2',
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
    const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
      ':'
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('IdP (idp1) should get request_message_padded_hash successfully', async function () {
    this.timeout(15000);
    identityForResponse = db.idp1Identities.find(
      (identity) =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    let latestAccessor;
    if (identityForResponse) {
      latestAccessor = identityForResponse.accessors.length - 1;
    } else {
      throw new Error('Identity not found');
    }

    responseAccessorId =
      identityForResponse.accessors[latestAccessor].accessorId;

    let accessorPublicKey =
      identityForResponse.accessors[latestAccessor].accessorPublicKey;

    const testResult = await getAndVerifyRequestMessagePaddedHashTest({
      callApiAtNodeId: 'idp1',
      idpNodeId: 'idp1',
      requestId,
      incomingRequestPromise,
      accessorPublicKey,
      accessorId: responseAccessorId,
    });
    requestMessagePaddedHash = testResult.verifyRequestMessagePaddedHash;
  });

  it('IdP (idp1) should create response (accept) successfully', async function () {
    this.timeout(15000);

    let latestAccessor = identityForResponse.accessors.length - 1;

    let accessorPrivateKey =
      identityForResponse.accessors[latestAccessor].accessorPrivateKey;

    const signature = createResponseSignature(
      accessorPrivateKey,
      requestMessagePaddedHash
    );

    let idpResponse = {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      accessor_id: responseAccessorId,
      signature,
    };

    idpResponseParams.push({
      ...idpResponse,
      idp_id: 'idp1',
      valid_signature: true,
      valid_ial: true,
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

  it('IdP (idp2) should get request_message_padded_hash successfully', async function () {
    this.timeout(15000);
    identityForResponse = db.idp2Identities.find(
      (identity) =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    let latestAccessor;
    if (identityForResponse) {
      latestAccessor = identityForResponse.accessors.length - 1;
    } else {
      throw new Error('Identity not found');
    }

    responseAccessorId =
      identityForResponse.accessors[latestAccessor].accessorId;

    let accessorPublicKey =
      identityForResponse.accessors[latestAccessor].accessorPublicKey;

    const testResult = await getAndVerifyRequestMessagePaddedHashTest({
      callApiAtNodeId: 'idp2',
      idpNodeId: 'idp2',
      requestId,
      incomingRequestPromise: incomingRequestPromise2,
      accessorPublicKey,
      accessorId: responseAccessorId,
    });
    requestMessagePaddedHash = testResult.verifyRequestMessagePaddedHash;
  });

  it('IdP (idp2) should create response (reject) successfully', async function () {
    this.timeout(15000);

    let latestAccessor = identityForResponse.accessors.length - 1;

    let accessorPrivateKey =
      identityForResponse.accessors[latestAccessor].accessorPrivateKey;

    const signature = createResponseSignature(
      accessorPrivateKey,
      requestMessagePaddedHash
    );

    let idpResponse = {
      reference_id: idp2ReferenceId,
      callback_url: config.IDP2_CALLBACK_URL,
      request_id: requestId,
      ial: 2.3,
      aal: 3,
      status: 'reject',
      accessor_id: responseAccessorId,
      signature,
    };

    idpResponseParams.push({
      ...idpResponse,
      idp_id: 'idp2',
      valid_signature: true,
      valid_ial: true,
    });

    let response = await idpApi.createResponse('idp2', idpResponse);
    expect(response.status).to.equal(202);
  });

  it('IdP should receive callback create response result with success = true', async function () {
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

  it('RP should receive complicated request status', async function () {
    this.timeout(15000);

    const testResult = await receiveComplicatedRequestStatusTest({
      nodeId: rp_node_id,
      requestStatusComplicatedPromise,
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

  it('IdP should receive complicated request status', async function () {
    this.timeout(20000);

    const testResult = await receiveComplicatedRequestStatusTest({
      nodeId: 'idp1',
      requestStatusComplicatedPromise: idp_requestStatusComplicatedPromise,
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
      status: 'complicated',
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
      status: 'complicated',
      lastStatusUpdateBlockHeight,
      testForEqualLastStatusUpdateBlockHeight: true,
      requesterNodeId: requester_node_id,
    });

    await wait(3000);
  });

  it('Should get request status with complicated status and closed successfully', async function () {
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
      mode: 3,
      requester_node_id: requester_node_id,
      status: 'complicated',
    });
  });

  after(async function () {
    await miscApi.setConfig('rp1', {
      AUTO_CLOSE_REQUEST_ON_COMPLICATED: false,
    });

    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
    idp2EventEmitter.removeAllListeners('callback');
  });
});

describe('mode 3, auto close on errored set to off', function () {
  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const rpCloseRequestReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise();
  const requestStatusPendingPromise = createEventPromise();
  const requestStatusErroredPromise = createEventPromise();
  const requestClosedPromise = createEventPromise();

  const closeRequestResultPromise = createEventPromise();

  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise();

  const idp_requestStatusErroredPromise = createEventPromise();
  const idp_requestClosedPromise = createEventPromise();


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

  let idpResponseErrorCode = 1000;

  before(async function () {
    const identity = db.idp1Identities.find(
      (identity) =>
        identity.mode === 3 && identity.relevantAllIdP,
    );
    namespace = identity.namespace;
    identifier = identity.identifier;

    createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 3,
      namespace,
      identifier,
      idp_id_list: ['idp1'],
      data_request_list: [],
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
          }
          else {
            requestStatusErroredPromise.resolve(callbackData);
          }
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
          if (callbackData.closed) {
            idp_requestClosedPromise.resolve(callbackData);
          } else {
            idp_requestStatusErroredPromise.resolve(callbackData);
          }
        }
      }
    });
  });

  it('RP should set auto close config successfully', async function () {
    this.timeout(15000);

    const response = await miscApi.setConfig('rp1', {
      AUTO_CLOSE_REQUEST_ON_ERRORED: false,
    });

    const responseBody = await response.json();
    expect(responseBody.autoCloseRequestOnErrored).to.equal(false);

    const responseGetConfig = await miscApi.getConfig('rp1');
    const responseBodyGetConfig = await responseGetConfig.json();
    expect(responseBodyGetConfig.autoCloseRequestOnErrored).to.equal(false);
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
      ':'
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
      }
    );
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
    const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
      ':'
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
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

  it('Should get request status (not closed) successfully', async function () {
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
      mode: 3,
      requester_node_id: requester_node_id,
      status: 'errored',
    });
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
      closed: true,
      timed_out: false,
      mode: 3,
      requester_node_id: requester_node_id,
      status: 'errored',
    });
  });

  after(async function () {
    await miscApi.setConfig('rp1', {
      AUTO_CLOSE_REQUEST_ON_ERRORED: true,
    });

    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
  });
});