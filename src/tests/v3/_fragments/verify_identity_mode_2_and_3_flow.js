import { expect } from 'chai';

import { rpCreateRequestTest } from './request_flow_fragments/rp';
import {
  idpReceiveMode2And3IncomingRequestCallbackTest,
  idpCreateResponseTest,
  idpReceiveAccessorEncryptCallbackTest,
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

export function mode2And3FlowTest({
  callRpApiAtNodeId,
  rpEventEmitter,
  getIdentityForRequest,
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
  const accessorEncryptPromises = idpParams.map(() => createEventPromise()); // IdPs
  const requestStatusConfirmedPromises = idpParams.map((_, index) =>
    index === idpParams.length - 1 ? null : createEventPromise()
  ); // RP
  const requestStatusCompletedPromise = createEventPromise(); // RP
  const requestClosedPromise = createEventPromise(); // RP

  // const idp_requestStatusPendingPromises = idpParams.map(() =>
  //   createEventPromise()
  // );
  const idp_requestStatusConfirmedPromises = idpParams.map((_, index) =>
    index === idpParams.length - 1 ? null : createEventPromise()
  );
  const idp_requestStatusCompletedPromises = idpParams.map(() =>
    createEventPromise()
  );
  const idp_requestClosedPromises = idpParams.map(() => createEventPromise());

  let requestId;

  let lastStatusUpdateBlockHeight;

  const requestStatusUpdates = [];
  const idp_requestStatusUpdates = [];

  before(function() {
    const identity = getIdentityForRequest();
    if (!identity) {
      throw new Error('No created identity to use');
    }

    createRequestParams.namespace = identity.namespace;
    createRequestParams.identifier = identity.identifier;

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
        } else if (
          callbackData.type === 'request_status' &&
          callbackData.request_id === requestId
        ) {
          idp_requestStatusUpdates.push(callbackData);
          if (callbackData.status === 'pending') {
            // idp_requestStatusPendingPromises[i].resolve(callbackData);
          } else if (callbackData.status === 'confirmed') {
            idp_requestStatusConfirmedPromises[
              callbackData.answered_idp_count - 1
            ].resolve(callbackData);
          } else if (callbackData.status === 'completed') {
            if (callbackData.closed) {
              idp_requestClosedPromises[i].resolve(callbackData);
            } else {
              idp_requestStatusCompletedPromises[i].resolve(callbackData);
            }
          }
        }
      });

      idpEventEmitter.on('accessor_encrypt_callback', function(callbackData) {
        if (callbackData.request_id === requestId) {
          accessorEncryptPromises[i].resolve(callbackData);
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
    const accessorEncryptPromise = accessorEncryptPromises[i];
    const requestStatusConfirmedPromise = requestStatusConfirmedPromises[i];
    const idp_requestStatusConfirmedPromise =
      idp_requestStatusConfirmedPromises[i];
    const idp_requestStatusCompletedPromise =
      idp_requestStatusCompletedPromises[i];
    let idpResponseParams = idpParams[i].idpResponseParams;
    const getAccessorForResponse = idpParams[i].getAccessorForResponse;
    const idpNodeId = idpNodeIds[i];

    let responseAccessorId;

    it(`IdP (${idpNodeId}) should receive incoming request callback`, async function() {
      this.timeout(15000);
      await idpReceiveMode2And3IncomingRequestCallbackTest({
        createRequestParams,
        requestId,
        incomingRequestPromise,
        requesterNodeId: rpNodeId,
      });
    });

    // IdP may or may not get this request status callback
    // it(`IdP (${idpNodeIds[i]}) should receive pending request status`, async function() {
    //   this.timeout(10000);
    //   const requestStatus = await idp_requestStatusPendingPromise.promise;
    //   expect(requestStatus).to.deep.include({
    //     request_id: requestId,
    //     status: 'pending',
    //     mode: createRequestParams.mode,
    //     min_idp: createRequestParams.min_idp,
    //     answered_idp_count: 0,
    //     closed: false,
    //     timed_out: false,
    //     service_list: [],
    //     response_valid_list: [],
    //   });
    //   expect(requestStatus).to.have.property('block_height');
    //   expect(requestStatus.block_height).is.a('string');const splittedBlockHeight = requestStatus.block_height.split(':');expect(splittedBlockHeight).to.have.lengthOf(2);expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    // });

    it(`IdP (${idpNodeId}) should create response (accept) successfully`, async function() {
      this.timeout(10000);

      responseAccessorId = getAccessorForResponse();

      idpResponseParams = {
        ...idpResponseParams,
        request_id: requestId,
        accessor_id: responseAccessorId,
      };
      await idpCreateResponseTest({
        callApiAtNodeId: callIdpApiAtNodeId,
        idpResponseParams,
      });
    });

    it(`IdP (${idpNodeId}) should receive accessor encrypt callback with correct data`, async function() {
      this.timeout(15000);
      await idpReceiveAccessorEncryptCallbackTest({
        idpNodeId,
        accessorEncryptPromise,
        accessorId: responseAccessorId,
        requestId,
        idpReferenceId: idpResponseParams.reference_id,
      });
    });

    it(`IdP (${idpNodeId}) should receive callback create response result with success = true`, async function() {
      await idpReceiveCreateResponseResultCallbackTest({
        requestId,
        idpReferenceId: idpResponseParams.reference_id,
        responseResultPromise,
      });
    });

    if (i < idpNodeIds.length - 1) {
      it('RP should receive confirmed request status with valid proofs', async function() {
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
              valid_signature: true,
              valid_ial: true,
            })),
          lastStatusUpdateBlockHeight,
        });
        lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
      });

      it(`IdP (${idpNodeId}) should receive confirmed request status without proofs`, async function() {
        this.timeout(15000);
        await receiveConfirmedRequestStatusTest({
          requestStatusConfirmedPromise: idp_requestStatusConfirmedPromise,
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
          testForEqualLastStatusUpdateBlockHeight: true,
        });
      });
    } else {
      it('RP should receive completed request status with valid proofs', async function() {
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
              valid_signature: true,
              valid_ial: true,
            })),
          lastStatusUpdateBlockHeight,
        });
        lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
      });

      it(`IdP (${idpNodeId}) should receive completed request status without proofs`, async function() {
        this.timeout(15000);
        await receiveCompletedRequestStatusTest({
          requestStatusCompletedPromise: idp_requestStatusCompletedPromise,
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
          testForEqualLastStatusUpdateBlockHeight: true,
        });
      });
    }
  }

  it('RP should receive request closed status', async function() {
    this.timeout(10000);
    const testResult =await receiveRequestClosedStatusTest({
      requestClosedPromise,
      requestId,
      createRequestParams,
      serviceList: [],
      responseValidList: idpNodeIds.map((idpNodeId) => ({
        idp_id: idpNodeId,
        valid_signature: true,
        valid_ial: true,
      })),
      lastStatusUpdateBlockHeight,
    });
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
  });

  for (let i = 0; i < idpParams.length; i++) {
    const idp_requestClosedPromise = idp_requestClosedPromises[i];
    it(`IdP (${
      idpNodeIds[i]
    }) should receive request closed status`, async function() {
      this.timeout(10000);
      await receiveRequestClosedStatusTest({
        requestClosedPromise: idp_requestClosedPromise,
        requestId,
        createRequestParams,
        serviceList: [],
        responseValidList: idpNodeIds.map((idpNodeId) => ({
          idp_id: idpNodeId,
          valid_signature: true,
          valid_ial: true,
        })),
        lastStatusUpdateBlockHeight,
        testForEqualLastStatusUpdateBlockHeight: true,
      });
    });
  }

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
      idpEventEmitter.removeAllListeners('accessor_encrypt_callback');
    }
  });
}
