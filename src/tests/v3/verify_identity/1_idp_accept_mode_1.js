import { expect } from 'chai';

import {
  rpCreateRequestTest,
  rpReceivePendingRequestStatusTest,
  rpReceiveCompletedRequestStatusTest,
  rpReceiveRequestClosedStatusTest,
} from '../_fragments/request_flow_fragments/rp';
import {
  idpReceiveIncomingRequestCallbackTest,
  idpCreateResponseTest,
} from '../_fragments/request_flow_fragments/idp';
import {
  hasPrivateMessagesTest,
  removePrivateMessagesTest,
  hasNoPrivateMessagesTest,
} from '../_fragments/common';

import { rpEventEmitter, idp1EventEmitter } from '../../../callback_server';
import { createEventPromise, generateReferenceId } from '../../../utils';
import * as config from '../../../config';

describe('1 IdP, accept consent, mode 1', function() {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise(); // RP
  const requestStatusPendingPromise = createEventPromise(); // RP
  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise(); // IDP
  const requestStatusCompletedPromise = createEventPromise(); // RP
  const requestClosedPromise = createEventPromise(); // RP

  let createRequestParams;

  let requestId;

  let lastStatusUpdateBlockHeight;

  const requestStatusUpdates = [];

  before(function() {
    namespace = 'citizen_id';
    identifier = '1234567890123';

    createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 1,
      namespace,
      identifier,
      idp_id_list: ['idp1'],
      data_request_list: [],
      request_message:
        'Test request message (mode 1) ทดสอบภาษาไทย should\\|be|able\\\\|to|send\\\\\\|this',
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
      } else if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === requestId
      ) {
        requestStatusUpdates.push(callbackData);
        if (callbackData.status === 'pending') {
          requestStatusPendingPromise.resolve(callbackData);
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
      } else if (callbackData.type === 'response_result') {
        responseResultPromise.resolve(callbackData);
      }
    });
  });

  it('RP should create a request successfully', async function() {
    this.timeout(10000);
    const testResult = await rpCreateRequestTest({
      callApiAtNodeId: 'rp1',
      createRequestParams,
      createRequestResultPromise,
    });
    requestId = testResult.requestId;
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('RP should receive pending request status', async function() {
    this.timeout(10000);
    await rpReceivePendingRequestStatusTest({
      createRequestParams,
      requestId,
      lastStatusUpdateBlockHeight,
      requestStatusPendingPromise,
      serviceList: [],
    });
  });

  it('IdP should receive incoming request callback', async function() {
    this.timeout(15000);
    await idpReceiveIncomingRequestCallbackTest({
      createRequestParams,
      requestId,
      incomingRequestPromise,
      requesterNodeId: 'rp1',
    });
  });

  it('IdP should create response (accept) successfully', async function() {
    this.timeout(10000);
    await idpCreateResponseTest({
      callApiAtNodeId: 'idp1',
      createRequestParams,
      callbackUrl: config.IDP1_CALLBACK_URL,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      requestId,
      idpReferenceId,
      responseResultPromise,
    });
  });

  it('RP should receive completed request status', async function() {
    this.timeout(15000);
    const testResult = await rpReceiveCompletedRequestStatusTest({
      requestStatusCompletedPromise,
      requestId,
      createRequestParams,
      serviceList: [],
      responseValidList: [
        {
          idp_id: 'idp1',
          valid_signature: null,
          valid_ial: null,
        },
      ],
      lastStatusUpdateBlockHeight,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('RP should receive request closed status', async function() {
    this.timeout(10000);
    await rpReceiveRequestClosedStatusTest({
      requestClosedPromise,
      requestId,
      createRequestParams,
      serviceList: [],
      responseValidList: [
        {
          idp_id: 'idp1',
          valid_signature: null,
          valid_ial: null,
        },
      ],
      lastStatusUpdateBlockHeight,
    });
  });

  it('RP should receive 3 request status updates', function() {
    expect(requestStatusUpdates).to.have.lengthOf(3);
  });

  it('RP should have and able to get saved private messages', function() {
    return hasPrivateMessagesTest({ callApiAtNodeId: 'rp1', requestId });
  });

  it('RP should remove saved private messages successfully', function() {
    return removePrivateMessagesTest({ callApiAtNodeId: 'rp1', requestId });
  });

  it('RP should have no saved private messages left after removal', function() {
    return hasNoPrivateMessagesTest({ callApiAtNodeId: 'rp1', requestId });
  });

  it('IdP should have and able to get saved private messages', function() {
    return hasPrivateMessagesTest({ callApiAtNodeId: 'idp1', requestId });
  });

  it('IdP should remove saved private messages successfully', function() {
    return removePrivateMessagesTest({ callApiAtNodeId: 'idp1', requestId });
  });

  it('IdP should have no saved private messages left after removal', function() {
    return hasNoPrivateMessagesTest({ callApiAtNodeId: 'idp1', requestId });
  });

  after(function() {
    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
  });
});

describe('1 IdP, accept consent, mode 1 (with empty string request_message)', function() {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise(); // RP
  const requestStatusPendingPromise = createEventPromise(); // RP
  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise(); // IDP
  const requestStatusCompletedPromise = createEventPromise(); // RP
  const requestClosedPromise = createEventPromise(); // RP

  let createRequestParams;

  let requestId;

  let lastStatusUpdateBlockHeight;

  const requestStatusUpdates = [];

  before(function() {
    namespace = 'citizen_id';
    identifier = '1234567890123';

    createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 1,
      namespace,
      identifier,
      idp_id_list: ['idp1'],
      data_request_list: [],
      request_message: '',
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
      } else if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === requestId
      ) {
        requestStatusUpdates.push(callbackData);
        if (callbackData.status === 'pending') {
          requestStatusPendingPromise.resolve(callbackData);
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
      } else if (callbackData.type === 'response_result') {
        responseResultPromise.resolve(callbackData);
      }
    });
  });

  it('RP should create a request successfully', async function() {
    this.timeout(10000);
    const testResult = await rpCreateRequestTest({
      callApiAtNodeId: 'rp1',
      createRequestParams,
      createRequestResultPromise,
    });
    requestId = testResult.requestId;
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('RP should receive pending request status', async function() {
    this.timeout(10000);
    await rpReceivePendingRequestStatusTest({
      createRequestParams,
      requestId,
      lastStatusUpdateBlockHeight,
      requestStatusPendingPromise,
      serviceList: [],
    });
  });

  it('IdP should receive incoming request callback', async function() {
    this.timeout(15000);
    await idpReceiveIncomingRequestCallbackTest({
      createRequestParams,
      requestId,
      incomingRequestPromise,
      requesterNodeId: 'rp1',
    });
  });

  it('IdP should create response (accept) successfully', async function() {
    this.timeout(10000);
    await idpCreateResponseTest({
      callApiAtNodeId: 'idp1',
      createRequestParams,
      callbackUrl: config.IDP1_CALLBACK_URL,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      requestId,
      idpReferenceId,
      responseResultPromise,
    });
  });

  it('RP should receive completed request status', async function() {
    this.timeout(15000);
    const testResult = await rpReceiveCompletedRequestStatusTest({
      requestStatusCompletedPromise,
      requestId,
      createRequestParams,
      serviceList: [],
      responseValidList: [
        {
          idp_id: 'idp1',
          valid_signature: null,
          valid_ial: null,
        },
      ],
      lastStatusUpdateBlockHeight,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('RP should receive request closed status', async function() {
    this.timeout(10000);
    await rpReceiveRequestClosedStatusTest({
      requestClosedPromise,
      requestId,
      createRequestParams,
      serviceList: [],
      responseValidList: [
        {
          idp_id: 'idp1',
          valid_signature: null,
          valid_ial: null,
        },
      ],
      lastStatusUpdateBlockHeight,
    });
  });

  it('RP should receive 3 request status updates', function() {
    expect(requestStatusUpdates).to.have.lengthOf(3);
  });

  it('RP should have and able to get saved private messages', function() {
    return hasPrivateMessagesTest({ callApiAtNodeId: 'rp1', requestId });
  });

  it('RP should remove saved private messages successfully', function() {
    return removePrivateMessagesTest({ callApiAtNodeId: 'rp1', requestId });
  });

  it('RP should have no saved private messages left after removal', function() {
    return hasNoPrivateMessagesTest({ callApiAtNodeId: 'rp1', requestId });
  });

  it('IdP should have and able to get saved private messages', async function() {
    return hasPrivateMessagesTest({ callApiAtNodeId: 'idp1', requestId });
  });

  it('IdP should remove saved private messages successfully', async function() {
    return removePrivateMessagesTest({ callApiAtNodeId: 'idp1', requestId });
  });

  it('IdP should have no saved private messages left after removal', async function() {
    return hasNoPrivateMessagesTest({ callApiAtNodeId: 'idp1', requestId });
  });

  after(function() {
    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
  });
});
