import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { expect } from 'chai';

import * as rpApi from '../../../api/v5/rp';
import * as idpApi from '../../../api/v5/idp';
import {
  rpEventEmitter,
  idp1EventEmitter,
  as1EventEmitter,
  setAsSendDataThroughCallback,
} from '../../../callback_server';
import * as db from '../../../db';
import {
  createEventPromise,
  generateReferenceId,
  hash,
  createResponseSignature,
} from '../../../utils';
import {
  createIdpIdList,
  createDataRequestList,
  createRequestMessageHash,
} from '../_fragments/fragments_utils';
import * as config from '../../../config';
import { eventEmitter as nodeCallbackEventEmitter } from '../../../callback_server/node';
import {
  verifyResponseSignature,
  getAndVerifyRequestMessagePaddedHashTest,
} from '../_fragments/request_flow_fragments/idp';
import {
  receivePendingRequestStatusTest,
  receiveConfirmedRequestStatusTest,
  receiveMessagequeueSendSuccessCallback,
} from '../_fragments/common';

describe('Too large AS data size, response through callback, 1 IdP, 1 AS, mode 3', function () {
  let namespace;
  let identifier;

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
  const errorCallbackPromise = createEventPromise(); // AS
  const sendDataResultPromise = createEventPromise(); // AS
  const requestStatusSignedDataPromise = createEventPromise(); // RP
  const requestStatusCompletedPromise = createEventPromise(); // RP
  const requestClosedPromise = createEventPromise(); // RP

  const mqSendSuccessRpToIdpCallbackPromise = createEventPromise();
  const mqSendSuccessRpToAsCallbackPromise = createEventPromise();
  const mqSendSuccessIdpToRpCallbackPromise = createEventPromise();
  const mqSendSuccessAsToRpCallbackPromise = createEventPromise();

  let createRequestParams;
  // const data = crypto.randomBytes(2499995).toString('hex'); // 4999990 bytes in hex string
  const data = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'test_data', 'too_large_data_1.txt'),
    'utf8'
  ) + crypto.randomBytes(2630000).toString('hex'); // more than 20,971,520 + 5,242,880 bytes (25MB)

  let requestId;
  let initialSalt;
  let requestMessageHash;
  let identityForResponse;
  let responseAccessorId;
  let requestMessagePaddedHash;

  const requestStatusUpdates = [];

  let rp_node_id = 'rp1';
  let requester_node_id = 'rp1';
  let idp_node_id = 'idp1';
  let as_node_id = 'as1';
  let idpIdList;
  let dataRequestList;
  let idpResponseParams = [];
  let lastStatusUpdateBlockHeight;

  before(function () {
    const identity = db.idp1Identities.find((identity) => identity.mode === 3);

    if (!identity) {
      throw new Error('No created identity to use');
    }

    namespace = identity.namespace;
    identifier = identity.identifier;

    createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 3,
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
      request_message: 'Test request message (data request) (mode 3)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
      bypass_identity_check: false,
    };

    setAsSendDataThroughCallback(true);

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
      }
    });

    idp1EventEmitter.on('accessor_encrypt_callback', function (callbackData) {
      if (callbackData.request_id === requestId) {
        accessorEncryptPromise.resolve(callbackData);
      }
    });

    as1EventEmitter.on('callback', function (callbackData, sendData) {
      if (
        callbackData.type === 'data_request' &&
        callbackData.request_id === requestId
      ) {
        dataRequestReceivedPromise.resolve(callbackData);
        sendData({
          data,
        });
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.reference_id === asReferenceId
      ) {
        sendDataResultPromise.resolve(callbackData);
      } else if (callbackData.type === 'error') {
        errorCallbackPromise.resolve(callbackData);
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
    this.timeout(20000);

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
    ]); // create idp_id_list, as_id_list, request_message_hash for test

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
  });

  //   it('RP should verify request_params_hash successfully', async function() {
  //   this.timeout(15000);
  //   await verifyRequestParamsHash({
  //     callApiAtNodeId: 'rp1',
  //     createRequestParams,
  //     requestId,
  //     initialSalt,
  //   });
  // });

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
    this.timeout(25000);

    await receiveConfirmedRequestStatusTest({
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
      request_id: requestId,
      mode: createRequestParams.mode,
      namespace,
      identifier,
      service_id: createRequestParams.data_request_list[0].service_id,
      request_params: createRequestParams.data_request_list[0].request_params,
      max_ial: 2.3,
      max_aal: 3,
      requester_node_id: 'rp1',
    });
    expect(dataRequest.response_signature_list).to.have.lengthOf(1);
    expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is.not
      .empty;
  });

  it('AS should get error callback', async function () {
    this.timeout(20000);
    const error = await errorCallbackPromise.promise;
    expect(error).to.have.property('error');
    expect(error.error).to.deep.include({
      code: 20036,
    });
  });

  after(function () {
    setAsSendDataThroughCallback(false);
    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
    as1EventEmitter.removeAllListeners('callback');
    nodeCallbackEventEmitter.removeAllListeners('callback');
  });
});
