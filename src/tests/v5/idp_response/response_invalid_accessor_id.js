import { expect } from 'chai';

import * as idpApi from '../../../api/v5/idp';
import { rpEventEmitter, idp1EventEmitter } from '../../../callback_server';
import * as db from '../../../db';
import {
  createEventPromise,
  generateReferenceId,
  createResponseSignature,
} from '../../../utils';
import {
  rpCreateRequestTest,
  verifyRequestParamsHash,
} from '../_fragments/request_flow_fragments/rp';
import { idpReceiveMode2And3IncomingRequestCallbackTest } from '../_fragments/request_flow_fragments/idp';
import {
  receivePendingRequestStatusTest,
  receiveMessagequeueSendSuccessCallback,
} from '../_fragments/common';
import { eventEmitter as nodeCallbackEventEmitter } from '../../../callback_server/node';
import * as config from '../../../config';

describe('IdP making response with accessor does not associate with sid and reference group code (verify signature at rp) test', function() {
  //Verify signature at RP

  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise();
  const requestStatusPendingPromise = createEventPromise();
  const incomingRequestPromise = createEventPromise();
  const responseResultPromise = createEventPromise();
  const requestStatusConfirmedPromise = createEventPromise();
  const requestStatusSignedDataPromise = createEventPromise();
  const requestClosedPromise = createEventPromise();
  const requestStatusCompletedPromise = createEventPromise();

  const mqSendSuccessRpToIdpCallbackPromise = createEventPromise();
  const mqSendSuccessIdpToRpCallbackPromise = createEventPromise();
  const mqSendSuccessRpToAsCallbackPromise = createEventPromise();
  const mqSendSuccessAsToRpCallbackPromise = createEventPromise();

  const idp_requestStatusPendingPromise = createEventPromise();
  const idp_requestStatusConfirmedPromise = createEventPromise();
  const idp_requestStatusSignedDataPromise = createEventPromise();
  const idp_requestStatusCompletedPromise = createEventPromise();
  const idp_requestClosedPromise = createEventPromise();

  let createRequestParams;
  let identityForResponse;

  let requestId;
  let initialSalt;
  let lastStatusUpdateBlockHeight;
  let requestMessagePaddedHash;
  let responseAccessorId;
  let requestStatusUpdates = [];
  let idp_requestStatusUpdates = [];

  before(async function() {
    this.timeout(30000);

    let identity = db.idp1Identities.filter(
      identity =>
        identity.namespace === 'citizen_id' &&
        identity.mode === 3 &&
        !identity.revokeIdentityAssociation,
    );

    if (identity.length === 0) {
      throw new Error('No created identity to use');
    }

    namespace = identity[0].namespace;
    identifier = identity[0].identifier;

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
          as_id_list: [],
          min_as: 1,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
      ],
      request_message: 'Test request message (error response) (mode 3)',
      min_ial: 2.3,
      min_aal: 3,
      min_idp: 1,
      request_timeout: 86400,
      bypass_identity_check: false,
    };

    rpEventEmitter.on('callback', function(callbackData) {
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
          if (callbackData.service_list[0].signed_data_count === 1) {
            requestStatusSignedDataPromise.resolve(callbackData);
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

    idp1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId
      ) {
        incomingRequestPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.request_id === requestId
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
          if (callbackData.service_list[0].signed_data_count === 1) {
            idp_requestStatusSignedDataPromise.resolve(callbackData);
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
    });

    nodeCallbackEventEmitter.on('callback', function(callbackData) {
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

  it('RP should create request successfully', async function() {
    this.timeout(15000);
    let testResult = await rpCreateRequestTest({
      callApiAtNodeId: 'rp1',
      createRequestParams,
      createRequestResultPromise,
    });

    requestId = testResult.requestId;
    initialSalt = testResult.initial_salt;
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('RP should receive pending status successfully', async function() {
    this.timeout(20000);
    await receivePendingRequestStatusTest({
      nodeId: 'rp1',
      createRequestParams,
      requestId,
      lastStatusUpdateBlockHeight,
      requestStatusPendingPromise,
    });
  });

  it('Should verify request params hash successfully', async function() {
    this.timeout(15000);
    await verifyRequestParamsHash({
      callApiAtNodeId: 'rp1',
      createRequestParams,
      requestId,
      initialSalt,
    });
  });

  it('RP should receive message queue send success (To idp1) callback', async function() {
    this.timeout(15000);
    await receiveMessagequeueSendSuccessCallback({
      nodeId: 'rp1',
      requestId,
      mqSendSuccessCallbackPromise: mqSendSuccessRpToIdpCallbackPromise,
      destinationNodeId: 'idp1',
    });
  });

  it('IdP should receive incoming request callback', async function() {
    this.timeout(15000);
    await idpReceiveMode2And3IncomingRequestCallbackTest({
      createRequestParams,
      requestId,
      incomingRequestPromise,
      requesterNodeId: 'rp1',
      initialSalt,
    });
  });

  it('IdP should get request message padded hash with accessor does not associate with sid and reference group code successfully', async function() {
    this.timeout(15000);

    const identity = db.idp1Identities.find(
      identity =>
        identity.namespace === 'citizen_id' &&
        identity.identifier != identifier &&
        !identity.revokeIdentityAssociation &&
        identity.mode === 3,
    );
    identityForResponse = identity;
    responseAccessorId = identity.accessors[0].accessorId;

    const response = await idpApi.getRequestMessagePaddedHash('idp1', {
      request_id: requestId,
      accessor_id: responseAccessorId,
    });
    const responseBody = await response.json();

    requestMessagePaddedHash = responseBody.request_message_padded_hash;
  });

  it('IdP should create response (accept) successfully', async function() {
    this.timeout(10000);
    let privateKeyToSign = identityForResponse.accessors[0].accessorPrivateKey;

    let signature = createResponseSignature(
      privateKeyToSign,
      requestMessagePaddedHash,
    );

    const response = await idpApi.createResponse('idp1', {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      accessor_id: responseAccessorId,
      signature,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20077);
  });
});
