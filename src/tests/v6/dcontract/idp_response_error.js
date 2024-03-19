import { expect } from 'chai';

import * as rpApi from '../../../api/v6/rp';
import * as idpApi from '../../../api/v6/idp';
import * as commonApi from '../../../api/v6/common';
import { rpEventEmitter, idp1EventEmitter } from '../../../callback_server';
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
import * as config from '../../../config';
import { eventEmitter as nodeCallbackEventEmitter } from '../../../callback_server/node';
import {
  receivePendingRequestStatusTest,
  receiveMessagequeueSendSuccessCallback,
  receiveErroredRequestStatusTest,
} from '../_fragments/common';

const REQUEST_TYPE_DCONTRACT = 'dsign.dcontract';

const IDP_ERROR_CODE_DOCUMENT_INTEGRITY_FAILED = 31000;

describe('Create request (mode 1) with dcontract request type and wrong hash link', function () {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const rpCloseRequestReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise(); // RP
  const requestStatusPendingPromise = createEventPromise(); // RP
  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise(); // IDP
  const requestStatusErroredPromise = createEventPromise(); // RP
  const closeRequestResultPromise = createEventPromise(); // RP

  const idp_requestStatusPendingPromise = createEventPromise();
  const idp_requestStatusErroredPromise = createEventPromise();

  const mqSendSuccessRpToIdpCallbackPromise = createEventPromise();
  const mqSendSuccessRpToAsCallbackPromise = createEventPromise();
  const mqSendSuccessIdpToRpCallbackPromise = createEventPromise();

  let createRequestParams;

  let requestId;
  let initialSalt;

  const requestStatusUpdates = [];
  const idp_requestStatusUpdates = [];
  let lastStatusUpdateBlockHeight;

  let rp_node_id = 'rp1';
  let requester_node_id = 'rp1';
  let idp_node_id = 'idp1';
  let idpIdList;
  let dataRequestList;
  let idpResponseParams = [];
  let requestMessageHash;

  before(async function () {
    this.timeout(10000);

    namespace = 'citizen_id';
    identifier = '1345951597671';

    createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 1,
      namespace,
      identifier,
      idp_id_list: [idp_node_id],
      data_request_list: [],
      request_message: `: ท่านกำลังยืนยันตัวตนและลงนามสัญญาด้วยลายมือชื่ออิเล็กทรอนิกส์ [ธนาคาร B จำกัด (มหาชน)] ที่ท่านเลือก (Ref:477701) สามารถอ่านสัญญาได้ที่
${config.DCONTRACT_BASE_URL}/0fffef01b78f395f3b3551a41b80330038dbfb0b4879c6cb34e93659315877e0
(wrong hash in link)`,
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
      bypass_identity_check: false,
      request_type: REQUEST_TYPE_DCONTRACT,
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
        idp_requestStatusUpdates.push(callbackData);
        if (callbackData.status === 'pending') {
          idp_requestStatusPendingPromise.resolve(callbackData);
        } else if (callbackData.status === 'errored') {
          idp_requestStatusErroredPromise.resolve(callbackData);
        }
      }
    });

    nodeCallbackEventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'message_queue_send_success' &&
        callbackData.request_id === requestId
      ) {
        if (callbackData.node_id === 'rp1') {
          if (callbackData.destination_node_id === 'idp1') {
            mqSendSuccessRpToIdpCallbackPromise.resolve(callbackData);
          } else if (callbackData.destination_node_id === 'as1') {
            mqSendSuccessRpToAsCallbackPromise.resolve(callbackData);
          }
        } else if (callbackData.node_id === 'idp1') {
          if (callbackData.destination_node_id === 'rp1') {
            mqSendSuccessIdpToRpCallbackPromise.resolve(callbackData);
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
    this.timeout(20000);

    [idpIdList, dataRequestList, requestMessageHash] = await Promise.all([
      createIdpIdList({
        createRequestParams,
        callRpApiAtNodeId: rp_node_id,
        mimeType: ['application/pdf'],
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
      requesterNodeId: rp_node_id,
    });
  });

  it('RP should receive message queue send success (To idp1) callback', async function () {
    this.timeout(15000);
    await receiveMessagequeueSendSuccessCallback({
      nodeId: 'rp1',
      requestId,
      mqSendSuccessCallbackPromise: mqSendSuccessRpToIdpCallbackPromise,
      destinationNodeId: 'idp1',
    });
  });

  it('IdP should receive message queue send success (To rp1) callback', async function () {
    this.timeout(15000);
    await receiveMessagequeueSendSuccessCallback({
      nodeId: 'idp1',
      requestId,
      mqSendSuccessCallbackPromise: mqSendSuccessIdpToRpCallbackPromise,
      destinationNodeId: 'rp1',
    });
  });

  it('RP should receive errored request status', async function () {
    this.timeout(15000);

    idpResponseParams.push({
      idp_id: idp_node_id,
      valid_signature: null,
      valid_ial: null,
      error_code: IDP_ERROR_CODE_DOCUMENT_INTEGRITY_FAILED,
    });

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
          error_code: IDP_ERROR_CODE_DOCUMENT_INTEGRITY_FAILED,
        },
      ],
      closed: true,
      timed_out: false,
      mode: 1,
      requester_node_id: requester_node_id,
      status: 'errored',
    });
  });

  after(async function () {
    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
    nodeCallbackEventEmitter.removeAllListeners('callback');
  });
});
