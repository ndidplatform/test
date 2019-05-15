import { expect } from 'chai';

import { rpCreateRequestTest } from './request_flow_fragments/rp';
import {
  idpReceiveMode1IncomingRequestCallbackTest,
  idpCreateResponseTest,
  idpReceiveCreateResponseResultCallbackTest,
} from './request_flow_fragments/idp';
import {
  receivePendingRequestStatusTest,
  receiveCompletedRequestStatusTest,
  receiveRequestClosedStatusTest,
  hasPrivateMessagesTest,
  removePrivateMessagesTest,
  hasNoPrivateMessagesTest,
  receiveConfirmedRequestStatusTest,
} from './common';

import { createEventPromise } from '../../../utils';

export function mode1FlowTest({
  callRpApiAtNodeId,
  rpEventEmitter,
  createRequestParams,
  idpParams,
}) {
  const rpNodeId = createRequestParams.node_id
    ? createRequestParams.node_id
    : callRpApiAtNodeId;
  const idpNodeIds = idpParams.map(
    ({ callIdpApiAtNodeId, idpResponseParams }) =>
      idpResponseParams.node_id ? idpResponseParams.node_id : callIdpApiAtNodeId
  );

  const createRequestResultPromise = createEventPromise(); // RP
  const requestStatusPendingPromise = createEventPromise(); // RP
  const incomingRequestPromises = idpParams.map(() => createEventPromise()); // IdPs
  const responseResultPromises = idpParams.map(() => createEventPromise()); // IdPs
  const requestStatusConfirmedPromises = idpParams.map((_, index) =>
    index === idpParams.length - 1 ? null : createEventPromise()
  ); // RP
  const requestStatusCompletedPromise = createEventPromise(); // RP
  const requestClosedPromise = createEventPromise(); // RP

  let requestId;

  let lastStatusUpdateBlockHeight;

  const requestStatusUpdates = [];

  before(function() {
    rpEventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'create_request_result' &&
        callbackData.reference_id === createRequestParams.reference_id
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
          requestStatusConfirmedPromises[
            callbackData.answered_idp_count - 1
          ].resolve(callbackData);
        } else if (callbackData.status === 'completed') {
          if (callbackData.closed) {
            requestClosedPromise.resolve(callbackData);
          } else {
            requestStatusCompletedPromise.resolve(callbackData);
          }
        }
      }
    });

    for (let i = 0; i < idpParams.length; i++) {
      const { idpEventEmitter } = idpParams[i];
      idpEventEmitter.on('callback', function(callbackData) {
        if (
          callbackData.type === 'incoming_request' &&
          callbackData.request_id === requestId
        ) {
          incomingRequestPromises[i].resolve(callbackData);
        } else if (callbackData.type === 'response_result') {
          responseResultPromises[i].resolve(callbackData);
        }
      });
    }
  });

  it('RP should create a request successfully', async function() {
    this.timeout(10000);
    const testResult = await rpCreateRequestTest({
      callApiAtNodeId: callRpApiAtNodeId,
      createRequestParams,
      createRequestResultPromise,
    });
    requestId = testResult.requestId;
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('RP should receive pending request status', async function() {
    this.timeout(10000);
    await receivePendingRequestStatusTest({
      createRequestParams,
      requestId,
      lastStatusUpdateBlockHeight,
      requestStatusPendingPromise,
      serviceList: [],
    });
  });

  for (let i = 0; i < idpParams.length; i++) {
    const callIdpApiAtNodeId = idpParams[i].callIdpApiAtNodeId;
    const incomingRequestPromise = incomingRequestPromises[i];
    const responseResultPromise = responseResultPromises[i];
    const requestStatusConfirmedPromise = requestStatusConfirmedPromises[i];
    let idpResponseParams = idpParams[i].idpResponseParams;

    it(`IdP (${
      idpNodeIds[i]
    }) should receive incoming request callback`, async function() {
      this.timeout(15000);
      await idpReceiveMode1IncomingRequestCallbackTest({
        createRequestParams,
        requestId,
        incomingRequestPromise,
        requesterNodeId: rpNodeId,
      });
    });

    it(`IdP (${
      idpNodeIds[i]
    }) should create response (accept) successfully`, async function() {
      this.timeout(10000);
      idpResponseParams = {
        ...idpResponseParams,
        request_id: requestId,
      };
      await idpCreateResponseTest({
        callApiAtNodeId: callIdpApiAtNodeId,
        idpResponseParams,
      });
      await idpReceiveCreateResponseResultCallbackTest({
        requestId,
        idpReferenceId: idpResponseParams.reference_id,
        responseResultPromise,
      });
    });

    if (i < idpNodeIds.length - 1) {
      it('RP should receive confirmed request status', async function() {
        this.timeout(15000);
        const testResult = await receiveConfirmedRequestStatusTest({
          requestStatusConfirmedPromise,
          requestId,
          createRequestParams,
          answeredIdpCount: idpNodeIds.filter((idpNodeId, index) => index <= i)
            .length,
          serviceList: [],
          responseValidList: idpNodeIds
            .filter((idpNodeId, index) => index <= i)
            .map((idpNodeId) => ({
              idp_id: idpNodeId,
              valid_signature: null,
              valid_ial: null,
            })),
          lastStatusUpdateBlockHeight,
        });
        lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
      });
    } else {
      it('RP should receive completed request status', async function() {
        this.timeout(15000);
        const testResult = await receiveCompletedRequestStatusTest({
          requestStatusCompletedPromise,
          requestId,
          createRequestParams,
          serviceList: [],
          responseValidList: idpNodeIds
            .filter((idpNodeId, index) => index <= i)
            .map((idpNodeId) => ({
              idp_id: idpNodeId,
              valid_signature: null,
              valid_ial: null,
            })),
          lastStatusUpdateBlockHeight,
        });
        lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
      });
    }
  }

  it('RP should receive request closed status', async function() {
    this.timeout(10000);
    const testResult = await receiveRequestClosedStatusTest({
      requestClosedPromise,
      requestId,
      createRequestParams,
      serviceList: [],
      responseValidList: idpNodeIds.map((idpNodeId) => ({
        idp_id: idpNodeId,
        valid_signature: null,
        valid_ial: null,
      })),
      lastStatusUpdateBlockHeight,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  it('RP should receive 3 request status updates', function() {
    expect(requestStatusUpdates).to.have.lengthOf(3);
  });

  it('RP should have and able to get saved private messages', function() {
    return hasPrivateMessagesTest({
      callApiAtNodeId: callRpApiAtNodeId,
      nodeId: rpNodeId !== callRpApiAtNodeId ? rpNodeId : undefined,
      requestId,
    });
  });

  it('RP should remove saved private messages successfully', function() {
    return removePrivateMessagesTest({
      callApiAtNodeId: callRpApiAtNodeId,
      nodeId: rpNodeId !== callRpApiAtNodeId ? rpNodeId : undefined,
      requestId,
    });
  });

  it('RP should have no saved private messages left after removal', function() {
    return hasNoPrivateMessagesTest({
      callApiAtNodeId: callRpApiAtNodeId,
      nodeId: rpNodeId !== callRpApiAtNodeId ? rpNodeId : undefined,
      requestId,
    });
  });

  for (let i = 0; i < idpParams.length; i++) {
    const { callIdpApiAtNodeId } = idpParams[i];
    const idpNodeId = idpNodeIds[i];

    it(`IdP (${idpNodeId}) should have and able to get saved private messages`, function() {
      return hasPrivateMessagesTest({
        callApiAtNodeId: callIdpApiAtNodeId,
        nodeId: idpNodeId !== callIdpApiAtNodeId ? idpNodeId : undefined,
        requestId,
      });
    });

    it(`IdP (${idpNodeId}) should remove saved private messages successfully`, function() {
      return removePrivateMessagesTest({
        callApiAtNodeId: callIdpApiAtNodeId,
        nodeId: idpNodeId !== callIdpApiAtNodeId ? idpNodeId : undefined,
        requestId,
      });
    });

    it(`IdP (${idpNodeId}) should have no saved private messages left after removal`, function() {
      return hasNoPrivateMessagesTest({
        callApiAtNodeId: callIdpApiAtNodeId,
        nodeId: idpNodeId !== callIdpApiAtNodeId ? idpNodeId : undefined,
        requestId,
      });
    });
  }

  after(function() {
    rpEventEmitter.removeAllListeners('callback');
    for (let i = 0; i < idpParams.length; i++) {
      const { idpEventEmitter } = idpParams[i];
      idpEventEmitter.removeAllListeners('callback');
    }
  });
}
