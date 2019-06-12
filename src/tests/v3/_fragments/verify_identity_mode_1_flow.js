import { expect } from 'chai';

import { rpCreateRequestTest } from './request_flow_fragments/rp';
import {
  idpReceiveMode1IncomingRequestCallbackTest,
  idpCreateResponseTest,
  idpReceiveCreateResponseResultCallbackTest,
} from './request_flow_fragments/idp';
import {
  receivePendingRequestStatusTest,
  receiveConfirmedRequestStatusTest,
  receiveRejectedRequestStatusTest,
  receiveCompletedRequestStatusTest,
  receiveComplicatedRequestStatusTest,
  receiveRequestClosedStatusTest,
  hasPrivateMessagesTest,
  removePrivateMessagesTest,
  hasNoPrivateMessagesTest,
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
  const responseAcceptCount = idpParams.filter(
    idpParam => idpParam.idpResponseParams.status === 'accept'
  ).length;
  const responseRejectCount = idpParams.filter(
    idpParam => idpParam.idpResponseParams.status === 'reject'
  ).length;

  const requestStatusConfirmedPromises = idpParams.map((_, index) =>
    index === idpParams.length - 1 ? null : createEventPromise()
  ); // RP
  const requestStatusRejectedPromises = idpParams.map((_, index) =>
    index === idpParams.length - 1 ? null : createEventPromise()
  ); // RP
  const requestStatusCompletedPromise = createEventPromise(); // RP
  const requestStatusRejectedPromise = createEventPromise(); // RP
  const requestStatusComplicatedPromise = createEventPromise(); // RP
  const requestClosedPromise = createEventPromise(); // RP

  let requestId;
  let lastStatusUpdateBlockHeight;
  const requestStatusUpdates = [];
  let finalRequestStatus;
  let callFunctionReceiveRequestStatusTest;
  let requestStatusPromise;

  if (responseAcceptCount > 0 && responseRejectCount > 0) {
    finalRequestStatus = 'complicated';
    callFunctionReceiveRequestStatusTest = receiveComplicatedRequestStatusTest;
    requestStatusPromise = requestStatusComplicatedPromise;
  } else if (responseAcceptCount > 0 && responseRejectCount === 0) {
    finalRequestStatus = 'completed';
    callFunctionReceiveRequestStatusTest = receiveCompletedRequestStatusTest;
    requestStatusPromise = requestStatusCompletedPromise;
  } else if (responseAcceptCount === 0 && responseRejectCount > 0) {
    finalRequestStatus = 'rejected';
    callFunctionReceiveRequestStatusTest = receiveRejectedRequestStatusTest;
    requestStatusPromise = requestStatusRejectedPromise;
  }

  before(function() {

    if (createRequestParams.min_idp != idpParams.length) {
      throw new Error('idpParams not equal to min_idp');
    }
    
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
        } else if (callbackData.status === 'rejected') {
          if (callbackData.answered_idp_count === idpParams.length) {
            requestStatusRejectedPromise.resolve(callbackData);
          } else {
            requestStatusRejectedPromises[
              callbackData.answered_idp_count - 1
            ].resolve(callbackData);
          }
        } else if (callbackData.status === 'complicated') {
          requestStatusComplicatedPromise.resolve(callbackData);
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
      nodeId: rpNodeId,
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
    const requestStatusRejectPromise = requestStatusRejectedPromises[i];
    let idpResponseParams = idpParams[i].idpResponseParams;
    const idpNodeId = idpNodeIds[i];
    it(`IdP (${idpNodeId}) should receive incoming request callback`, async function() {
      this.timeout(15000);
      await idpReceiveMode1IncomingRequestCallbackTest({
        nodeId: idpNodeId,
        createRequestParams,
        requestId,
        incomingRequestPromise,
        requesterNodeId: rpNodeId,
      });
    });

    it(`IdP (${idpNodeId}) should create response (${
      idpResponseParams.status
    }) successfully`, async function() {
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
        nodeId: idpNodeId,
        requestId,
        idpReferenceId: idpResponseParams.reference_id,
        responseResultPromise,
      });
    });

    if (i < idpNodeIds.length - 1) {
      if (idpResponseParams.status === 'reject') {
        it('RP should receive reject request status', async function() {
          this.timeout(15000);
          const testResult = await receiveRejectedRequestStatusTest({
            nodeId: rpNodeId,
            requestStatusRejectPromise,
            requestId,
            createRequestParams,
            answeredIdpCount: idpNodeIds.filter(
              (idpNodeId, index) => index <= i
            ).length,
            serviceList: [],
            responseValidList: idpNodeIds
              .filter((idpNodeId, index) => index <= i)
              .map(idpNodeId => ({
                idp_id: idpNodeId,
                valid_signature: null,
                valid_ial: null,
              })),
            lastStatusUpdateBlockHeight,
          });
          lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
        });
      } else {
        it('RP should receive confirmed request status', async function() {
          this.timeout(15000);
          const testResult = await receiveConfirmedRequestStatusTest({
            nodeId: rpNodeId,
            requestStatusConfirmedPromise,
            requestId,
            createRequestParams,
            answeredIdpCount: idpNodeIds.filter(
              (idpNodeId, index) => index <= i
            ).length,
            serviceList: [],
            responseValidList: idpNodeIds
              .filter((idpNodeId, index) => index <= i)
              .map(idpNodeId => ({
                idp_id: idpNodeId,
                valid_signature: null,
                valid_ial: null,
              })),
            lastStatusUpdateBlockHeight,
          });
          lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
        });
      }
    } else {
      it(`RP should receive ${finalRequestStatus} request status`, async function() {
        this.timeout(15000);
        const testResult = await callFunctionReceiveRequestStatusTest({
          nodeId: rpNodeId,
          requestStatusPromise,
          requestId,
          createRequestParams,
          serviceList: [],
          answeredIdpCount: idpNodeIds.filter((idpNodeId, index) => index <= i)
            .length, // for request status rejected
          responseValidList: idpNodeIds
            .filter((idpNodeId, index) => index <= i)
            .map(idpNodeId => ({
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
  if (finalRequestStatus === 'completed') {
    it('RP should receive request closed status', async function() {
      this.timeout(10000);
      const testResult = await receiveRequestClosedStatusTest({
        nodeId: rpNodeId,
        requestClosedPromise,
        requestId,
        createRequestParams,
        serviceList: [],
        responseValidList: idpNodeIds.map(idpNodeId => ({
          idp_id: idpNodeId,
          valid_signature: null,
          valid_ial: null,
        })),
        lastStatusUpdateBlockHeight,
      });
      lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
    });
  }

  it('RP should receive request status updates', function() {
    let requestStatusCount = idpNodeIds.length;
    if (finalRequestStatus === 'completed') {
      // +2 for pending and closed
      expect(requestStatusUpdates).to.have.lengthOf(requestStatusCount + 2);
    } else {
      // +1 for pending
      expect(requestStatusUpdates).to.have.lengthOf(requestStatusCount + 1);
    }
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
