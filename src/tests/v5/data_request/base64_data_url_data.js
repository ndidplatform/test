import { expect } from 'chai';

import * as rpApi from '../../../api/v5/rp';
import * as idpApi from '../../../api/v5/idp';
import * as asApi from '../../../api/v5/as';
import * as nodeApi from '../../../api/v5/node';
import * as commonApi from '../../../api/v5/common';
import {
  rpEventEmitter,
  idp1EventEmitter,
  as1EventEmitter,
} from '../../../callback_server';
import * as db from '../../../db';
import {
  createEventPromise,
  generateReferenceId,
  hash,
  wait,
  createResponseSignature,
} from '../../../utils';
import {
  createIdpIdList,
  createDataRequestList,
  createRequestMessageHash,
  setDataReceived,
  setDataSigned,
} from '../_fragments/fragments_utils';
import * as config from '../../../config';
import { eventEmitter as nodeCallbackEventEmitter } from '../../../callback_server/node';
import {
  receivePendingRequestStatusTest,
  receiveConfirmedRequestStatusTest,
  receiveMessagequeueSendSuccessCallback,
  receiveCompletedRequestStatusTest,
  receiveRequestClosedStatusTest,
} from '../_fragments/common';
import {
  verifyResponseSignature,
  getAndVerifyRequestMessagePaddedHashTest,
} from '../_fragments/request_flow_fragments/idp';

describe('Base64 encoded data URL request_message and data, 1 IdP, 1 AS, mode 2', function () {
  let namespace;
  let identifier;

  const updateNodeReferenceId_before = generateReferenceId();
  const updateNodeReferenceId_after = generateReferenceId();
  const idp_updateNodeResultPromise_before = createEventPromise();
  const idp_updateNodeResultPromise_after = createEventPromise();

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const asReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise(); // RP
  const requestStatusPendingPromise = createEventPromise(); // RP
  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise(); // IDP
  const accessorEncryptPromise = createEventPromise(); // IDP
  const requestStatusConfirmedPromise = createEventPromise(); // RP
  const dataRequestReceivedPromise = createEventPromise(); // AS
  const sendDataResultPromise = createEventPromise(); // AS
  const requestStatusSignedDataPromise = createEventPromise(); // RP
  const requestStatusCompletedPromise = createEventPromise(); // RP
  const requestClosedPromise = createEventPromise(); // RP

  const idp_requestStatusPendingPromise = createEventPromise();
  const idp_requestStatusConfirmedPromise = createEventPromise();
  const idp_requestStatusSignedDataPromise = createEventPromise();
  const idp_requestStatusCompletedPromise = createEventPromise();
  const idp_requestClosedPromise = createEventPromise();

  const as_requestStatusConfirmedPromise = createEventPromise();
  const as_requestStatusSignedDataPromise = createEventPromise();
  const as_requestStatusCompletedPromise = createEventPromise();
  const as_requestClosedPromise = createEventPromise();

  const mqSendSuccessRpToIdpCallbackPromise = createEventPromise();
  const mqSendSuccessRpToAsCallbackPromise = createEventPromise();
  const mqSendSuccessIdpToRpCallbackPromise = createEventPromise();
  const mqSendSuccessAsToRpCallbackPromise = createEventPromise();

  let createRequestParams;
  const data =
    'data:application/pdf;base64,dGVzdCBiYXNlNjQgZW5jb2RlZCBzdHJpbmc=';
  const correct_request_message =
    'data:application/pdf;base64,dGVzdCBiYXNlNjQgZW5jb2RlZCBzdHJpbmc=';
  const wrong_type_request_message =
    'data:aaaa/bbbb;base64,dGVzdCBiYXNlNjQgZW5jb2RlZCBzdHJpbmc=';

  let requestId;
  let initialSalt;
  let identityForResponse;
  let responseAccessorId;
  let requestMessagePaddedHash;

  const requestStatusUpdates = [];
  const idp_requestStatusUpdates = [];
  const as_requestStatusUpdates = [];
  let lastStatusUpdateBlockHeight;

  let rp_node_id = 'rp1';
  let requester_node_id = 'rp1';
  let idp_node_id = 'idp1';
  let as_node_id = 'as1';
  let idpIdList;
  let dataRequestList;
  let idpResponseParams = [];
  let requestMessageHash;

  before(async function () {
    this.timeout(10000);
    if (db.idp1Identities[0] == null) {
      throw new Error('No created identity to use');
    }

    const identity = db.idp1Identities.find((identity) => {
      return identity.mode === 2;
    });

    //const identity = db.idp1Identities[0]

    namespace = identity.namespace;
    identifier = identity.identifier;

    createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 2,
      namespace,
      identifier,
      idp_id_list: [],
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
      request_message:
        'data:application/pdf;base64, dGVzdCBiYXNlNjQgZW5jb2RlZCBzdHJpbmc= ',
      min_ial: 1.1,
      min_aal: 1,
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
        } else if (callbackData.status === 'confirmed') {
          if (callbackData.data_request_list[0].response_list.length > 0) {
            if (callbackData.data_request_list[0].response_list[0].signed) {
              requestStatusSignedDataPromise.resolve(callbackData);
            }
          } else {
            requestStatusConfirmedPromise.resolve(callbackData);
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
        idp_requestStatusUpdates.push(callbackData);
        if (callbackData.status === 'pending') {
          idp_requestStatusPendingPromise.resolve(callbackData);
        } else if (callbackData.status === 'confirmed') {
          if (callbackData.data_request_list[0].response_list.length > 0) {
            if (callbackData.data_request_list[0].response_list[0].signed) {
              idp_requestStatusSignedDataPromise.resolve(callbackData);
            }
          } else {
            idp_requestStatusConfirmedPromise.resolve(callbackData);
          }
        } else if (callbackData.status === 'completed') {
          if (callbackData.closed) {
            idp_requestClosedPromise.resolve(callbackData);
          } else {
            idp_requestStatusCompletedPromise.resolve(callbackData);
          }
        }
      }

      if (callbackData.reference_id === updateNodeReferenceId_before) {
        idp_updateNodeResultPromise_before.resolve(callbackData);
      }
      if (callbackData.reference_id === updateNodeReferenceId_after) {
        idp_updateNodeResultPromise_after.resolve(callbackData);
      }
    });

    idp1EventEmitter.on('accessor_encrypt_callback', function (callbackData) {
      if (callbackData.request_id === requestId) {
        accessorEncryptPromise.resolve(callbackData);
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
        as_requestStatusUpdates.push(callbackData);
        if (callbackData.status === 'confirmed') {
          if (callbackData.data_request_list[0].response_list.length > 0) {
            if (callbackData.data_request_list[0].response_list[0].signed) {
              as_requestStatusSignedDataPromise.resolve(callbackData);
            }
          } else {
            as_requestStatusConfirmedPromise.resolve(callbackData);
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
        } else if (callbackData.node_id === 'as1') {
          if (callbackData.destination_node_id === 'rp1') {
            mqSendSuccessAsToRpCallbackPromise.resolve(callbackData);
          }
        }
      }
    });

    // Set supported data URL type on IdP
    const response = await nodeApi.updateNode('idp1', {
      reference_id: updateNodeReferenceId_before,
      callback_url: config.IDP1_CALLBACK_URL,
      supported_request_message_data_url_type_list: ['application/pdf'],
    });
    if (response.status !== 202) {
      throw new Error('Unable to update node');
    }
    const updateNodeResult = await idp_updateNodeResultPromise_before.promise;
    if (!updateNodeResult.success) {
      throw new Error('Unable to update node');
    }
    await wait(3000);
  });

  it('RP should create a request with request_message has whitespace unsuccessfully', async function () {
    this.timeout(10000);

    const response = await rpApi.createRequest('rp1', createRequestParams);
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20070);
  });

  it('RP should create a request with wrong type request_message unsuccessfully', async function () {
    this.timeout(10000);

    createRequestParams = {
      ...createRequestParams,
      request_message: wrong_type_request_message,
    };
    const response = await rpApi.createRequest('rp1', createRequestParams);
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20005);
  });

  it('RP should create a request successfully', async function () {
    this.timeout(10000);

    createRequestParams = {
      ...createRequestParams,
      request_message: correct_request_message,
    };

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
    this.timeout(20000);

    [idpIdList, dataRequestList, requestMessageHash] = await Promise.all([
      createIdpIdList({
        createRequestParams,
        callRpApiAtNodeId: rp_node_id,
        mimeType: ['application/pdf']
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

    // const requestStatus = await requestStatusPendingPromise.promise;
    // expect(requestStatus).to.deep.include({
    //   request_id: requestId,
    //   status: 'pending',
    //   mode: createRequestParams.mode,
    //   min_idp: createRequestParams.min_idp,
    //   answered_idp_count: 0,
    //   closed: false,
    //   timed_out: false,
    //   service_list: [
    //     {
    //       service_id: createRequestParams.data_request_list[0].service_id,
    //       min_as: createRequestParams.data_request_list[0].min_as,
    //       signed_data_count: 0,
    //       received_data_count: 0,
    //     },
    //   ],
    //   response_valid_list: [],
    // });
    // expect(requestStatus).to.have.property('block_height');
    // expect(requestStatus.block_height).is.a('string');
    // const splittedBlockHeight = requestStatus.block_height.split(':');
    // expect(splittedBlockHeight).to.have.lengthOf(2);
    // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
    // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    // expect(parseInt(splittedBlockHeight[1])).to.equal(
    //   lastStatusUpdateBlockHeight,
    // );
    // lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
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
    expect(incomingRequest.reference_group_code).to.be.a('string').that.is.not
      .empty;
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

    requestMessageHash = incomingRequest.request_message_hash;
  });

  it('IdP should get request_message_padded_hash successfully', async function () {
    identityForResponse = db.idp1Identities.find(
      (identity) =>
        identity.namespace === namespace && identity.identifier === identifier,
    );

    responseAccessorId = identityForResponse.accessors[0].accessorId;
    let accessorPublicKey = identityForResponse.accessors[0].accessorPublicKey;

    responseAccessorId = identityForResponse.accessors[0].accessorId;

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

  it('IdP should create response (accept) successfully', async function () {
    this.timeout(10000);

    let accessorPrivateKey =
      identityForResponse.accessors[0].accessorPrivateKey;

    const signature = createResponseSignature(
      accessorPrivateKey,
      requestMessagePaddedHash,
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

    const response = await idpApi.createResponse('idp1', idpResponse);
    expect(response.status).to.equal(202);
  });

  // it('IdP should receive accessor encrypt callback with correct data', async function() {
  //   this.timeout(15000);
  //   const identity = db.idp1Identities.find(
  //     identity =>
  //       identity.namespace === namespace && identity.identifier === identifier,
  //   );

  //   let accessorPublicKey = identity.accessors[0].accessorPublicKey;

  //   let testResult = await idpReceiveAccessorEncryptCallbackTest({
  //     callIdpApiAtNodeId: 'idp1',
  //     accessorEncryptPromise,
  //     accessorId: responseAccessorId,
  //     requestId,
  //     idpReferenceId: idpReferenceId,
  //     incomingRequestPromise,
  //     accessorPublicKey,
  //   });
  //   requestMessagePaddedHash = testResult.verifyRequestMessagePaddedHash;
  // });

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

  it('IdP should receive message queue send success (To rp1) callback', async function () {
    this.timeout(15000);
    await receiveMessagequeueSendSuccessCallback({
      nodeId: 'idp1',
      requestId,
      mqSendSuccessCallbackPromise: mqSendSuccessIdpToRpCallbackPromise,
      destinationNodeId: 'rp1',
    });
  });

  it('RP should receive confirmed request status with valid proofs', async function () {
    this.timeout(15000);

    const testResult = await receiveConfirmedRequestStatusTest({
      nodeId: rp_node_id,
      requestStatusConfirmedPromise,
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

    // const requestStatus = await requestStatusConfirmedPromise.promise;
    // expect(requestStatus).to.deep.include({
    //   request_id: requestId,
    //   status: 'confirmed',
    //   mode: createRequestParams.mode,
    //   min_idp: createRequestParams.min_idp,
    //   answered_idp_count: 1,
    //   closed: false,
    //   timed_out: false,
    //   service_list: [
    //     {
    //       service_id: createRequestParams.data_request_list[0].service_id,
    //       min_as: createRequestParams.data_request_list[0].min_as,
    //       signed_data_count: 0,
    //       received_data_count: 0,
    //     },
    //   ],
    //   response_valid_list: [
    //     {
    //       idp_id: 'idp1',
    //       valid_signature: true,
    //       valid_ial: true,
    //     },
    //   ],
    // });
    // expect(requestStatus).to.have.property('block_height');
    // expect(requestStatus.block_height).is.a('string');
    // const splittedBlockHeight = requestStatus.block_height.split(':');
    // expect(splittedBlockHeight).to.have.lengthOf(2);
    // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
    // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    // expect(parseInt(splittedBlockHeight[1])).to.be.above(
    //   lastStatusUpdateBlockHeight,
    // );
    // lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
  });

  it('Should verify IdP response signature successfully', async function () {
    this.timeout(15000);

    const identity = db.idp1Identities.find(
      (identity) =>
        identity.namespace === namespace && identity.identifier === identifier,
    );

    let accessorPrivateKey = identity.accessors[0].accessorPrivateKey;

    await verifyResponseSignature({
      callApiAtNodeId: 'idp1',
      requestId,
      requestMessagePaddedHash,
      accessorPrivateKey,
    });
  });

  // it('IdP should receive confirmed request status without proofs', async function() {
  //   this.timeout(15000);
  //   const requestStatus = await idp_requestStatusConfirmedPromise.promise;
  //   expect(requestStatus).to.deep.include({
  //     request_id: requestId,
  //     status: 'confirmed',
  //     mode: createRequestParams.mode,
  //     min_idp: createRequestParams.min_idp,
  //     answered_idp_count: 1,
  //     closed: false,
  //     timed_out: false,
  //     service_list: [
  //       {
  //         service_id: createRequestParams.data_request_list[0].service_id,
  //         min_as: createRequestParams.data_request_list[0].min_as,
  //         signed_data_count: 0,
  //         received_data_count: 0,
  //       },
  //     ],
  //     response_valid_list: [
  //       {
  //         idp_id: 'idp1',
  //         valid_signature: null,
  //         valid_ial: null,
  //       },
  //     ],
  //   });
  //   expect(requestStatus).to.have.property('block_height');
  //   expect(requestStatus.block_height).is.a('string');
  //   const splittedBlockHeight = requestStatus.block_height.split(':');
  //   expect(splittedBlockHeight).to.have.lengthOf(2);
  //   expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
  //   expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
  //   expect(parseInt(splittedBlockHeight[1])).to.equal(
  //     lastStatusUpdateBlockHeight
  //   );
  // });

  it('RP should receive message queue send success (To as1) callback', async function () {
    this.timeout(15000);
    await receiveMessagequeueSendSuccessCallback({
      nodeId: 'rp1',
      requestId,
      mqSendSuccessCallbackPromise: mqSendSuccessRpToAsCallbackPromise,
      destinationNodeId: 'as1',
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

  // AS may or may not get this request status callback
  // it('AS should receive confirmed request status without proofs', async function() {
  //   this.timeout(15000);
  //   const requestStatus = await as_requestStatusConfirmedPromise.promise;
  //   expect(requestStatus).to.deep.include({
  //     request_id: requestId,
  //     status: 'confirmed',
  //     mode: createRequestParams.mode,
  //     min_idp: createRequestParams.min_idp,
  //     answered_idp_count: 1,
  //     closed: false,
  //     timed_out: false,
  //     service_list: [
  //       {
  //         service_id: createRequestParams.data_request_list[0].service_id,
  //         min_as: createRequestParams.data_request_list[0].min_as,
  //         signed_data_count: 0,
  //         received_data_count: 0,
  //       },
  //     ],
  //     response_valid_list: [
  //       {
  //         idp_id: 'idp1',
  //         valid_signature: null,
  //
  //         valid_ial: null,
  //       },
  //     ],
  //   });
  //   expect(requestStatus).to.have.property('block_height');
  //   expect(requestStatus.block_height).is.a('string');const splittedBlockHeight = requestStatus.block_height.split(':');expect(splittedBlockHeight).to.have.lengthOf(2);expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
  // });

  it('AS should send data successfully', async function () {
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
      type: 'response_result',
      reference_id: asReferenceId,
      success: true,
    });

    dataRequestList = setDataSigned(
      dataRequestList,
      createRequestParams.data_request_list[0].service_id,
      as_node_id,
    );
  });

  it('AS should receive message queue send success (To rp1) callback', async function () {
    this.timeout(15000);
    await receiveMessagequeueSendSuccessCallback({
      nodeId: 'as1',
      requestId,
      mqSendSuccessCallbackPromise: mqSendSuccessAsToRpCallbackPromise,
      destinationNodeId: 'rp1',
    });
  });

  it('RP should receive request status with signed data count = 1', async function () {
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

    // const requestStatus = await requestStatusSignedDataPromise.promise;
    // expect(requestStatus).to.deep.include({
    //   request_id: requestId,
    //   status: 'confirmed',
    //   mode: createRequestParams.mode,
    //   min_idp: createRequestParams.min_idp,
    //   answered_idp_count: 1,
    //   closed: false,
    //   timed_out: false,
    //   service_list: [
    //     {
    //       service_id: createRequestParams.data_request_list[0].service_id,
    //       min_as: createRequestParams.data_request_list[0].min_as,
    //       signed_data_count: 1,
    //       received_data_count: 0,
    //     },
    //   ],
    //   response_valid_list: [
    //     {
    //       idp_id: 'idp1',
    //       valid_signature: true,
    //       valid_ial: true,
    //     },
    //   ],
    // });
    // expect(requestStatus).to.have.property('block_height');
    // expect(requestStatus.block_height).is.a('string');
    // const splittedBlockHeight = requestStatus.block_height.split(':');
    // expect(splittedBlockHeight).to.have.lengthOf(2);
    // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
    // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    // expect(parseInt(splittedBlockHeight[1])).to.be.above(
    //   lastStatusUpdateBlockHeight,
    // );
    // lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
  });

  it('IdP should receive request status with signed data count = 1', async function () {
    this.timeout(15000);

    await receiveConfirmedRequestStatusTest({
      nodeId: idp_node_id,
      requestStatusConfirmedPromise: idp_requestStatusSignedDataPromise,
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

    // const requestStatus = await idp_requestStatusSignedDataPromise.promise;
    // expect(requestStatus).to.deep.include({
    //   request_id: requestId,
    //   status: 'confirmed',
    //   mode: createRequestParams.mode,
    //   min_idp: createRequestParams.min_idp,
    //   answered_idp_count: 1,
    //   closed: false,
    //   timed_out: false,
    //   service_list: [
    //     {
    //       service_id: createRequestParams.data_request_list[0].service_id,
    //       min_as: createRequestParams.data_request_list[0].min_as,
    //       signed_data_count: 1,
    //       received_data_count: 0,
    //     },
    //   ],
    //   response_valid_list: [
    //     {
    //       idp_id: 'idp1',
    //       valid_signature: null,
    //       valid_ial: null,
    //     },
    //   ],
    // });
    // expect(requestStatus).to.have.property('block_height');
    // expect(requestStatus.block_height).is.a('string');
    // const splittedBlockHeight = requestStatus.block_height.split(':');
    // expect(splittedBlockHeight).to.have.lengthOf(2);
    // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
    // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    // expect(parseInt(splittedBlockHeight[1])).to.equal(
    //   lastStatusUpdateBlockHeight,
    // );
  });

  it('AS should receive request status with signed data count = 1', async function () {
    this.timeout(15000);

    await receiveConfirmedRequestStatusTest({
      nodeId: as_node_id,
      requestStatusConfirmedPromise: as_requestStatusSignedDataPromise,
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

    dataRequestList = setDataReceived(
      dataRequestList,
      createRequestParams.data_request_list[0].service_id,
      as_node_id,
    );

    // const requestStatus = await as_requestStatusSignedDataPromise.promise;
    // expect(requestStatus).to.deep.include({
    //   request_id: requestId,
    //   status: 'confirmed',
    //   mode: createRequestParams.mode,
    //   min_idp: createRequestParams.min_idp,
    //   answered_idp_count: 1,
    //   closed: false,
    //   timed_out: false,
    //   service_list: [
    //     {
    //       service_id: createRequestParams.data_request_list[0].service_id,
    //       min_as: createRequestParams.data_request_list[0].min_as,
    //       signed_data_count: 1,
    //       received_data_count: 0,
    //     },
    //   ],
    //   response_valid_list: [
    //     {
    //       idp_id: 'idp1',
    //       valid_signature: null,
    //       valid_ial: null,
    //     },
    //   ],
    // });
    // expect(requestStatus).to.have.property('block_height');
    // expect(requestStatus.block_height).is.a('string');
    // const splittedBlockHeight = requestStatus.block_height.split(':');
    // expect(splittedBlockHeight).to.have.lengthOf(2);
    // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
    // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    // expect(parseInt(splittedBlockHeight[1])).to.equal(
    //   lastStatusUpdateBlockHeight,
    // );
  });

  it('RP should receive completed request status with received data count = 1', async function () {
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

    // const requestStatus = await requestStatusCompletedPromise.promise;
    // expect(requestStatus).to.deep.include({
    //   request_id: requestId,
    //   status: 'completed',
    //   mode: createRequestParams.mode,
    //   min_idp: createRequestParams.min_idp,
    //   answered_idp_count: 1,
    //   closed: false,
    //   timed_out: false,
    //   service_list: [
    //     {
    //       service_id: createRequestParams.data_request_list[0].service_id,
    //       min_as: createRequestParams.data_request_list[0].min_as,
    //       signed_data_count: 1,
    //       received_data_count: 1,
    //     },
    //   ],
    //   response_valid_list: [
    //     {
    //       idp_id: 'idp1',
    //       valid_signature: true,
    //       valid_ial: true,
    //     },
    //   ],
    // });
    // expect(requestStatus).to.have.property('block_height');
    // expect(requestStatus.block_height).is.a('string');
    // const splittedBlockHeight = requestStatus.block_height.split(':');
    // expect(splittedBlockHeight).to.have.lengthOf(2);
    // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
    // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    // expect(parseInt(splittedBlockHeight[1])).to.be.above(
    //   lastStatusUpdateBlockHeight,
    // );
    // lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
  });

  it('IdP should receive completed request status with received data count = 1', async function () {
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

    // const requestStatus = await idp_requestStatusCompletedPromise.promise;
    // expect(requestStatus).to.deep.include({
    //   request_id: requestId,
    //   status: 'completed',
    //   mode: createRequestParams.mode,
    //   min_idp: createRequestParams.min_idp,
    //   answered_idp_count: 1,
    //   closed: false,
    //   timed_out: false,
    //   service_list: [
    //     {
    //       service_id: createRequestParams.data_request_list[0].service_id,
    //       min_as: createRequestParams.data_request_list[0].min_as,
    //       signed_data_count: 1,
    //       received_data_count: 1,
    //     },
    //   ],
    //   response_valid_list: [
    //     {
    //       idp_id: 'idp1',
    //       valid_signature: null,
    //       valid_ial: null,
    //     },
    //   ],
    // });
    // expect(requestStatus).to.have.property('block_height');
    // expect(requestStatus.block_height).is.a('string');
    // const splittedBlockHeight = requestStatus.block_height.split(':');
    // expect(splittedBlockHeight).to.have.lengthOf(2);
    // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
    // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    // expect(parseInt(splittedBlockHeight[1])).to.equal(
    //   lastStatusUpdateBlockHeight,
    // );
  });

  it('AS should receive completed request status with received data count = 1', async function () {
    this.timeout(15000);

    await receiveCompletedRequestStatusTest({
      nodeId: as_node_id,
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

    // const requestStatus = await as_requestStatusCompletedPromise.promise;
    // expect(requestStatus).to.deep.include({
    //   request_id: requestId,
    //   status: 'completed',
    //   mode: createRequestParams.mode,
    //   min_idp: createRequestParams.min_idp,
    //   answered_idp_count: 1,
    //   closed: false,
    //   timed_out: false,
    //   service_list: [
    //     {
    //       service_id: createRequestParams.data_request_list[0].service_id,
    //       min_as: createRequestParams.data_request_list[0].min_as,
    //       signed_data_count: 1,
    //       received_data_count: 1,
    //     },
    //   ],
    //   response_valid_list: [
    //     {
    //       idp_id: 'idp1',
    //       valid_signature: null,
    //       valid_ial: null,
    //     },
    //   ],
    // });
    // expect(requestStatus).to.have.property('block_height');
    // expect(requestStatus.block_height).is.a('string');
    // const splittedBlockHeight = requestStatus.block_height.split(':');
    // expect(splittedBlockHeight).to.have.lengthOf(2);
    // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
    // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    // expect(parseInt(splittedBlockHeight[1])).to.equal(
    //   lastStatusUpdateBlockHeight,
    // );
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
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;

    // const requestStatus = await requestClosedPromise.promise;
    // expect(requestStatus).to.deep.include({
    //   request_id: requestId,
    //   status: 'completed',
    //   mode: createRequestParams.mode,
    //   min_idp: createRequestParams.min_idp,
    //   answered_idp_count: 1,
    //   closed: true,
    //   timed_out: false,
    //   service_list: [
    //     {
    //       service_id: createRequestParams.data_request_list[0].service_id,
    //       min_as: createRequestParams.data_request_list[0].min_as,
    //       signed_data_count: 1,
    //       received_data_count: 1,
    //     },
    //   ],
    //   response_valid_list: [
    //     {
    //       idp_id: 'idp1',
    //       valid_signature: true,
    //       valid_ial: true,
    //     },
    //   ],
    // });
    // expect(requestStatus).to.have.property('block_height');
    // expect(requestStatus.block_height).is.a('string');
    // const splittedBlockHeight = requestStatus.block_height.split(':');
    // expect(splittedBlockHeight).to.have.lengthOf(2);
    // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
    // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    // expect(parseInt(splittedBlockHeight[1])).to.be.above(
    //   lastStatusUpdateBlockHeight,
    // );
    // lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
  });

  it('IdP should receive request closed status', async function () {
    this.timeout(10000);

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

    // const requestStatus = await idp_requestClosedPromise.promise;
    // expect(requestStatus).to.deep.include({
    //   request_id: requestId,
    //   status: 'completed',
    //   mode: createRequestParams.mode,
    //   min_idp: createRequestParams.min_idp,
    //   answered_idp_count: 1,
    //   closed: true,
    //   timed_out: false,
    //   service_list: [
    //     {
    //       service_id: createRequestParams.data_request_list[0].service_id,
    //       min_as: createRequestParams.data_request_list[0].min_as,
    //       signed_data_count: 1,
    //       received_data_count: 1,
    //     },
    //   ],
    //   response_valid_list: [
    //     {
    //       idp_id: 'idp1',
    //       valid_signature: true,
    //       valid_ial: true,
    //     },
    //   ],
    // });
    // expect(requestStatus).to.have.property('block_height');
    // expect(requestStatus.block_height).is.a('string');
    // const splittedBlockHeight = requestStatus.block_height.split(':');
    // expect(splittedBlockHeight).to.have.lengthOf(2);
    // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
    // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    // expect(parseInt(splittedBlockHeight[1])).to.equal(
    //   lastStatusUpdateBlockHeight,
    // );
  });

  it('AS should receive request closed status', async function () {
    this.timeout(10000);

    await receiveRequestClosedStatusTest({
      nodeId: as_node_id,
      requestClosedPromise: as_requestClosedPromise,
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

    // const requestStatus = await as_requestClosedPromise.promise;
    // expect(requestStatus).to.deep.include({
    //   request_id: requestId,
    //   status: 'completed',
    //   mode: createRequestParams.mode,
    //   min_idp: createRequestParams.min_idp,
    //   answered_idp_count: 1,
    //   closed: true,
    //   timed_out: false,
    //   service_list: [
    //     {
    //       service_id: createRequestParams.data_request_list[0].service_id,
    //       min_as: createRequestParams.data_request_list[0].min_as,
    //       signed_data_count: 1,
    //       received_data_count: 1,
    //     },
    //   ],
    //   response_valid_list: [
    //     {
    //       idp_id: 'idp1',
    //       valid_signature: true,
    //       valid_ial: true,
    //     },
    //   ],
    // });
    // expect(requestStatus).to.have.property('block_height');
    // expect(requestStatus.block_height).is.a('string');
    // const splittedBlockHeight = requestStatus.block_height.split(':');
    // expect(splittedBlockHeight).to.have.lengthOf(2);
    // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
    // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    // expect(parseInt(splittedBlockHeight[1])).to.equal(
    //   lastStatusUpdateBlockHeight,
    // );
  });

  it('RP should get the correct data received from AS', async function () {
    const response = await rpApi.getDataFromAS('rp1', {
      requestId,
    });
    const dataArr = await response.json();
    expect(response.status).to.equal(200);

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

  it('RP should receive 5 request status updates', function () {
    expect(requestStatusUpdates).to.have.lengthOf(5);
  });

  it('IdP should receive 4 or 5 request status updates', function () {
    expect(idp_requestStatusUpdates).to.have.length.within(4, 5);
  });

  it('AS should receive 3 or 4 request status updates', function () {
    expect(as_requestStatusUpdates).to.have.length.within(3, 4);
  });

  it('RP should remove data requested from AS successfully', async function () {
    const response = await rpApi.removeDataRequestedFromAS('rp1', {
      request_id: requestId,
    });
    expect(response.status).to.equal(204);
  });

  it('RP should have no saved data requested from AS left after removal', async function () {
    const response = await rpApi.getDataFromAS('rp1', {
      requestId,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.be.an('array').that.is.empty;
  });

  it('RP should have and able to get saved private messages', async function () {
    const response = await commonApi.getPrivateMessages('rp1', {
      request_id: requestId,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.be.an('array').that.is.not.empty;
  });

  it('RP should remove saved private messages successfully', async function () {
    const response = await commonApi.removePrivateMessages('rp1', {
      request_id: requestId,
    });
    expect(response.status).to.equal(204);
  });

  it('RP should have no saved private messages left after removal', async function () {
    const response = await commonApi.getPrivateMessages('rp1', {
      request_id: requestId,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.be.an('array').that.is.empty;
  });

  it('IdP should have and able to get saved private messages', async function () {
    const response = await commonApi.getPrivateMessages('idp1', {
      request_id: requestId,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.be.an('array').that.is.not.empty;
  });

  it('IdP should remove saved private messages successfully', async function () {
    const response = await commonApi.removePrivateMessages('idp1', {
      request_id: requestId,
    });
    expect(response.status).to.equal(204);
  });

  it('IdP should have no saved private messages left after removal', async function () {
    const response = await commonApi.getPrivateMessages('idp1', {
      request_id: requestId,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.be.an('array').that.is.empty;
  });

  it('AS should have and able to get saved private messages', async function () {
    const response = await commonApi.getPrivateMessages('as1', {
      request_id: requestId,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.be.an('array').that.is.not.empty;
  });

  it('AS should remove saved private messages successfully', async function () {
    const response = await commonApi.removePrivateMessages('as1', {
      request_id: requestId,
    });
    expect(response.status).to.equal(204);
  });

  it('AS should have no saved private messages left after removal', async function () {
    const response = await commonApi.getPrivateMessages('as1', {
      request_id: requestId,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.be.an('array').that.is.empty;
  });

  after(async function () {
    // Restore IdP node settings
    const response = await nodeApi.updateNode('idp1', {
      reference_id: updateNodeReferenceId_after,
      callback_url: config.IDP1_CALLBACK_URL,
      supported_request_message_data_url_type_list: [],
    });
    if (response.status !== 202) {
      throw new Error('Unable to update node');
    }
    const updateNodeResult = await idp_updateNodeResultPromise_after.promise;
    if (!updateNodeResult.success) {
      throw new Error('Unable to update node');
    }

    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
    as1EventEmitter.removeAllListeners('callback');
    nodeCallbackEventEmitter.removeAllListeners('callback');
  });
});
