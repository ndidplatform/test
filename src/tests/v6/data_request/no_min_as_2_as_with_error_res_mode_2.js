import { expect } from 'chai';

import * as rpApi from '../../../api/v6/rp';
import * as idpApi from '../../../api/v6/idp';
import * as asApi from '../../../api/v6/as';
import * as commonApi from '../../../api/v6/common';
import * as apiHelpers from '../../../api/helpers';
import {
  idp1EventEmitter,
  rpEventEmitter,
  as1EventEmitter,
  as2EventEmitter,
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
  receivePartialCompletedRequestStatusTest,
} from '../_fragments/common';
import * as config from '../../../config';

import { getAndVerifyRequestMessagePaddedHashTest } from '../_fragments/request_flow_fragments/idp';

describe('No min AS, 2 AS, with error response, 1 Service, mode 2', function () {
  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const asReferenceId = generateReferenceId();
  const as2ReferenceId = generateReferenceId();
  const rpCloseRequestReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise();
  const requestStatusPendingPromise = createEventPromise();
  const requestStatusASErrorPromise = createEventPromise();
  const requestStatusSignedDataPromise = createEventPromise();
  const requestStatusReceivedDataPromise = createEventPromise();
  const closeRequestResultPromise = createEventPromise();
  const requestClosedPromise = createEventPromise();

  const incomingRequestPromise = createEventPromise(); // idp1
  const responseResultPromise = createEventPromise();
  const idp_requestStatusASErrorPromise = createEventPromise();
  const idp_requestStatusSignedDataPromise = createEventPromise();
  const idp_requestStatusReceivedDataPromise = createEventPromise();
  const idp_requestClosedPromise = createEventPromise();

  const dataRequestReceivedPromise = createEventPromise();
  const sendDataResultPromise = createEventPromise();
  const as_requestStatusASErrorPromise = createEventPromise();
  const as_requestStatusSignedDataPromise = createEventPromise();
  const as_requestStatusReceivedDataPromise = createEventPromise();
  const as_requestClosedPromise = createEventPromise();

  const dataRequestReceivedPromise2 = createEventPromise();
  const sendDataResultPromise2 = createEventPromise();
  const as_requestStatusASErrorPromise2 = createEventPromise();
  const as_requestStatusSignedDataPromise2 = createEventPromise();
  const as_requestStatusReceivedDataPromise2 = createEventPromise();
  const as_requestClosedPromise2 = createEventPromise();

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

  const data = JSON.stringify({
    test: 'test',
    withEscapedChar: 'test|fff||ss\\|NN\\\\|',
    arr: [1, 2, 3],
  });

  let asResponseErrorCode = 10101; // pre-registered error code (on dev init script)

  before(async function () {
    const identity = db.idp1Identities.find((identity) => identity.mode === 2);
    namespace = identity.namespace;
    identifier = identity.identifier;

    createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 2,
      namespace,
      identifier,
      idp_id_list: ['idp1'],
      data_request_list: [
        {
          service_id: 'bank_statement',
          as_id_list: ['as1', 'as2'],
          min_as: 0,
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
              (as) => as.as_id === 'as2'
            );
            if (asAnswer.signed) {
              requestStatusSignedDataPromise.resolve(callbackData);
            }
          }
        } else if (callbackData.status === 'partial_completed') {
          if (callbackData.data_request_list[0].response_list.length === 2) {
            let asAnswer = callbackData.data_request_list[0].response_list.find(
              (as) => as.as_id === 'as2'
            );
            if (asAnswer.received_data) {
              requestStatusReceivedDataPromise.resolve(callbackData);
            }
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
        if (callbackData.status === 'confirmed') {
          if (callbackData.data_request_list[0].response_list.length === 1) {
            idp_requestStatusASErrorPromise.resolve(callbackData);
          } else if (
            callbackData.data_request_list[0].response_list.length === 2
          ) {
            let asAnswer = callbackData.data_request_list[0].response_list.find(
              (as) => as.as_id === 'as2'
            );
            if (asAnswer.signed) {
              idp_requestStatusSignedDataPromise.resolve(callbackData);
            }
          }
        } else if (callbackData.status === 'partial_completed') {
          if (callbackData.data_request_list[0].response_list.length === 2) {
            let asAnswer = callbackData.data_request_list[0].response_list.find(
              (as) => as.as_id === 'as2'
            );
            if (asAnswer.received_data) {
              idp_requestStatusReceivedDataPromise.resolve(callbackData);
            }
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
        callbackData.type === 'response_result' &&
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
              (as) => as.as_id === 'as2'
            );
            if (asAnswer.signed) {
              as_requestStatusSignedDataPromise.resolve(callbackData);
            }
          }
        } else if (callbackData.status === 'partial_completed') {
          if (callbackData.data_request_list[0].response_list.length === 2) {
            let asAnswer = callbackData.data_request_list[0].response_list.find(
              (as) => as.as_id === 'as2'
            );
            if (asAnswer.received_data) {
              as_requestStatusReceivedDataPromise.resolve(callbackData);
            }
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
        callbackData.type === 'response_result' &&
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
              (as) => as.as_id === 'as2'
            );
            if (asAnswer.signed) {
              as_requestStatusSignedDataPromise2.resolve(callbackData);
            }
          }
        } else if (callbackData.status === 'partial_completed') {
          if (callbackData.data_request_list[0].response_list.length === 2) {
            let asAnswer = callbackData.data_request_list[0].response_list.find(
              (as) => as.as_id === 'as2'
            );
            if (asAnswer.received_data) {
              as_requestStatusReceivedDataPromise2.resolve(callbackData);
            }
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

  it('IdP (idp1) should receive incoming request callback', async function () {
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
    const splittedCreationBlockHeight =
      dataRequest.creation_block_height.split(':');
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
    const splittedCreationBlockHeight =
      dataRequest.creation_block_height.split(':');
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
      type: 'response_result',
      reference_id: asReferenceId,
      success: true,
    });

    dataRequestList = setASResponseError(
      dataRequestList,
      createRequestParams.data_request_list[0].service_id,
      'as1',
      asResponseErrorCode
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
      type: 'response_result',
      reference_id: as2ReferenceId,
      success: true,
    });

    dataRequestList = setDataSigned(
      dataRequestList,
      createRequestParams.data_request_list[0].service_id,
      'as2'
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
      'as2'
    );
  });

  it('RP should receive partial completed with received data request status', async function () {
    this.timeout(15000);

    const testResult = await receivePartialCompletedRequestStatusTest({
      nodeId: rp_node_id,
      requestStatusPartialCompletedPromise: requestStatusReceivedDataPromise,
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

  it('IdP should receive partial completed with received data request status', async function () {
    this.timeout(20000);

    const testResult = await receivePartialCompletedRequestStatusTest({
      nodeId: 'idp1',
      requestStatusPartialCompletedPromise:
        idp_requestStatusReceivedDataPromise,
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

  it('AS (as1) should receive partial completed with received data request status', async function () {
    this.timeout(20000);

    const testResult = await receivePartialCompletedRequestStatusTest({
      nodeId: 'as1',
      requestStatusPartialCompletedPromise: as_requestStatusReceivedDataPromise,
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

  it('AS (as2) should receive partial completed with received data request status', async function () {
    this.timeout(20000);

    const testResult = await receivePartialCompletedRequestStatusTest({
      nodeId: 'as2',
      requestStatusPartialCompletedPromise:
        as_requestStatusReceivedDataPromise2,
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

  // it('RP should receive request closed status', async function () {
  //   this.timeout(15000);
  //   const testResult = await receiveRequestClosedStatusTest({
  //     nodeId: rp_node_id,
  //     requestClosedPromise: requestClosedPromise,
  //     requestId,
  //     createRequestParams,
  //     dataRequestList,
  //     idpResponse: idpResponseParams,
  //     requestMessageHash,
  //     idpIdList,
  //     // status: 'errored',
  //     lastStatusUpdateBlockHeight,
  //     requesterNodeId: requester_node_id,
  //   });

  //   lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  // });

  // it('IdP should receive request closed status', async function () {
  //   this.timeout(15000);

  //   await receiveRequestClosedStatusTest({
  //     nodeId: idp_node_id,
  //     requestClosedPromise: idp_requestClosedPromise,
  //     requestId,
  //     createRequestParams,
  //     dataRequestList,
  //     idpResponse: idpResponseParams,
  //     requestMessageHash,
  //     idpIdList,
  //     // status: 'errored',
  //     lastStatusUpdateBlockHeight,
  //     testForEqualLastStatusUpdateBlockHeight: true,
  //     requesterNodeId: requester_node_id,
  //   });
  // });

  // it('AS (as1) should receive request closed status', async function () {
  //   this.timeout(15000);

  //   await receiveRequestClosedStatusTest({
  //     nodeId: 'as1',
  //     requestClosedPromise: as_requestClosedPromise,
  //     requestId,
  //     createRequestParams,
  //     dataRequestList,
  //     idpResponse: idpResponseParams,
  //     requestMessageHash,
  //     idpIdList,
  //     // status: 'errored',
  //     lastStatusUpdateBlockHeight,
  //     testForEqualLastStatusUpdateBlockHeight: true,
  //     requesterNodeId: requester_node_id,
  //   });
  // });

  // it('AS (as2) should receive request closed status', async function () {
  //   this.timeout(15000);

  //   await receiveRequestClosedStatusTest({
  //     nodeId: 'as2',
  //     requestClosedPromise: as_requestClosedPromise2,
  //     requestId,
  //     createRequestParams,
  //     dataRequestList,
  //     idpResponse: idpResponseParams,
  //     requestMessageHash,
  //     idpIdList,
  //     // status: 'errored',
  //     lastStatusUpdateBlockHeight,
  //     testForEqualLastStatusUpdateBlockHeight: true,
  //     requesterNodeId: requester_node_id,
  //   });
  // });

  it('Should get request status with partial completed status successfully', async function () {
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
      mode: 2,
      requester_node_id: requester_node_id,
      status: 'partial_completed',
    });
  });

  it('RP should get data received from AS', async function () {
    this.timeout(100000);
    const response = await rpApi.getDataFromAS('rp1', {
      requestId,
    });
    const dataArr = await response.json();
    expect(response.status).to.equal(200);

    const nodeInfoResponse = await apiHelpers.getResponseAndBody(
      commonApi.getNodeInfo('rp1', {
        node_id: 'as2',
      })
    );
    const asNodeInfo = nodeInfoResponse.responseBody;

    expect(dataArr).to.have.lengthOf(1);
    expect(dataArr[0]).to.deep.include({
      source_node_id: 'as2',
      service_id: createRequestParams.data_request_list[0].service_id,
      signature_signing_algorithm: asNodeInfo.signing_public_key.algorithm,
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
