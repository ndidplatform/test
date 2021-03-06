import { expect } from 'chai';

import * as commonApi from '../../../api/v5/common';

import { rpCreateRequestTest } from './request_flow_fragments/rp';
import {
  idpReceiveMode2And3IncomingRequestCallbackTest,
  idpCreateResponseTest,
  idpReceiveAccessorEncryptCallbackTest,
  idpReceiveCreateResponseResultCallbackTest,
  verifyResponseSignature,
  getAndVerifyRequestMessagePaddedHashTest,
} from './request_flow_fragments/idp';
import {
  receivePendingRequestStatusTest,
  receiveConfirmedRequestStatusTest,
  receiveRejectedRequestStatusTest,
  receiveCompletedRequestStatusTest,
  receiveComplicatedRequestStatusTest,
  receiveRequestClosedStatusTest,
  receiveMessagequeueSendSuccessCallback,
  hasPrivateMessagesTest,
  removePrivateMessagesTest,
  hasNoPrivateMessagesTest,
} from './common';

import { createEventPromise, wait } from '../../../utils';
import {
  createIdpIdList,
  createRequestMessageHash,
  createDataRequestList,
} from './fragments_utils';
import { eventEmitter as nodeCallbackEventEmitter } from '../../../callback_server/node';

export function mode2And3FlowTest({
  callRpApiAtNodeId,
  filterForNodeId,
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
      idpResponseParams.node_id
        ? idpResponseParams.node_id
        : callIdpApiAtNodeId,
  );

  const createRequestResultPromise = createEventPromise(); // RP
  const requestStatusPendingPromise = createEventPromise(); // RP
  const incomingRequestPromises = idpParams.map(() => createEventPromise()); // IdPs
  const responseResultPromises = idpParams.map(() => createEventPromise()); // IdPs
  const mqSendSuccessIdpToRpCallbackPromises = idpNodeIds.map((nodeId) => {
    return {
      node_id: nodeId,
      mqSendSuccessIdpToRpCallbackPromise: createEventPromise(),
    };
  }); //IdPs
  const accessorEncryptPromises = idpParams.map(() => createEventPromise()); // IdPs
  const responseAcceptCount = idpParams.filter(
    (idpParam) => idpParam.idpResponseParams.status === 'accept',
  ).length;
  const responseRejectCount = idpParams.filter(
    (idpParam) => idpParam.idpResponseParams.status === 'reject',
  ).length;

  const requestStatusConfirmedPromises = idpParams.map((_, index) =>
    index === idpParams.length - 1 ? null : createEventPromise(),
  ); // RP
  const requestStatusRejectedPromises = idpParams.map((_, index) =>
    index === idpParams.length - 1 ? null : createEventPromise(),
  ); // RP

  const requestStatusCompletedPromise = createEventPromise(); // RP
  const requestStatusRejectedPromise = createEventPromise(); // RP
  const requestStatusComplicatedPromise = createEventPromise(); // RP
  const requestClosedPromise = createEventPromise(); // RP

  // const idp_requestStatusPendingPromises = idpParams.map(() =>
  //   createEventPromise()
  // );

  let idp_requestStatusPromises;

  idpNodeIds.forEach((nodeId) => {
    idp_requestStatusPromises = {
      ...idp_requestStatusPromises,
      [nodeId]: idpParams.map(() => createEventPromise()),
    };
  });

  const idp_requestStatusCompletedPromises = idpParams.map(() =>
    createEventPromise(),
  );

  const idp_requestStatusComplicatedPromises = idpParams.map(() =>
    createEventPromise(),
  );

  const idp_requestStatusRejectedPromise = idpParams.map(() =>
    createEventPromise(),
  );

  const idp_requestClosedPromises = idpParams.map(() => createEventPromise());

  let identity;
  let initialSalt;
  let requestId;
  let lastStatusUpdateBlockHeight;
  let idpsReceiveRequestPromises;
  let arrayMqSendSuccessRpToIdpCallback = [];
  let requestMessagePaddedHash;
  const requestStatusUpdates = [];
  const idp_requestStatusUpdates = [];
  let finalRequestStatus;
  let callFunctionReceiveRequestStatusTest;
  let requestStatusPromise;
  let idp_finalRequestStatusPromises;

  let requestMessageHash;
  let idpResponseList = []; // for expect response_list
  let dataRequestList; // for expect every callback request status
  let idpIdList; // for expect every callback request status

  if (responseAcceptCount > 0 && responseRejectCount > 0) {
    finalRequestStatus = 'complicated';
    callFunctionReceiveRequestStatusTest = receiveComplicatedRequestStatusTest;
    requestStatusPromise = requestStatusComplicatedPromise;
    idp_finalRequestStatusPromises = idp_requestStatusComplicatedPromises;
  } else if (responseAcceptCount > 0 && responseRejectCount === 0) {
    finalRequestStatus = 'completed';
    callFunctionReceiveRequestStatusTest = receiveCompletedRequestStatusTest;
    requestStatusPromise = requestStatusCompletedPromise;
    idp_finalRequestStatusPromises = idp_requestStatusCompletedPromises;
  } else if (responseAcceptCount === 0 && responseRejectCount > 0) {
    finalRequestStatus = 'rejected';
    callFunctionReceiveRequestStatusTest = receiveRejectedRequestStatusTest;
    requestStatusPromise = requestStatusRejectedPromise;
    idp_finalRequestStatusPromises = idp_requestStatusRejectedPromise;
  }

  before(async function () {
    this.timeout(25000);
    if (createRequestParams.min_idp != idpParams.length) {
      throw new Error('idpParams not equal to min_idp');
    }

    identity = getIdentityForRequest();
    if (!identity) {
      throw new Error('No created identity to use');
    }
    const responseGetRelevantIdpNodesBySid = await commonApi.getRelevantIdpNodesBySid(
      callRpApiAtNodeId,
      {
        namespace: identity.namespace,
        identifier: identity.identifier,
        mode: createRequestParams.mode,
        min_ial: createRequestParams.min_ial,
      },
    );
    const resposenBodyGetRelevantIdpNodesBySid = await responseGetRelevantIdpNodesBySid.json();
    idpsReceiveRequestPromises = resposenBodyGetRelevantIdpNodesBySid.map(
      ({ node_id }) => {
        return {
          node_id,
          MqSendSuccessRpToIdpCallbackPromise: createEventPromise(),
        };
      },
    );

    createRequestParams.namespace = identity.namespace;
    createRequestParams.identifier = identity.identifier;

    rpEventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'create_request_result' &&
        callbackData.reference_id === createRequestParams.reference_id
      ) {
        createRequestResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === requestId
      ) {
        let answeredIdPCount = callbackData.response_list.length;
        requestStatusUpdates.push(callbackData);
        if (callbackData.status === 'pending') {
          requestStatusPendingPromise.resolve(callbackData);
        } else if (callbackData.status === 'confirmed') {
          requestStatusConfirmedPromises[answeredIdPCount - 1].resolve(
            callbackData,
          );
        } else if (callbackData.status === 'rejected') {
          if (answeredIdPCount === idpParams.length) {
            requestStatusRejectedPromise.resolve(callbackData);
          } else {
            requestStatusRejectedPromises[answeredIdPCount - 1].resolve(
              callbackData,
            );
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
      idpEventEmitter.on('callback', function (callbackData) {
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
          let answeredIdPCount = callbackData.response_list.length;
          idp_requestStatusUpdates.push(callbackData);
          if (callbackData.status === 'pending') {
            // idp_requestStatusPendingPromises[i].resolve(callbackData);
          } else if (callbackData.status === 'confirmed') {
            idp_requestStatusPromises[callbackData.node_id][
              answeredIdPCount - 1
            ].resolve(callbackData);
          } else if (callbackData.status === 'rejected') {
            if (answeredIdPCount === idpParams.length) {
              idp_requestStatusRejectedPromise[i].resolve(callbackData);
            } else {
              idp_requestStatusPromises[callbackData.node_id][
                answeredIdPCount - 1
              ].resolve(callbackData);
            }
          } else if (callbackData.status === 'complicated') {
            idp_requestStatusComplicatedPromises[i].resolve(callbackData);
          } else if (callbackData.status === 'completed') {
            if (callbackData.closed) {
              idp_requestClosedPromises[i].resolve(callbackData);
            } else {
              idp_requestStatusCompletedPromises[i].resolve(callbackData);
            }
          }
        }
      });

      idpEventEmitter.on('accessor_encrypt_callback', function (callbackData) {
        if (callbackData.request_id === requestId) {
          accessorEncryptPromises[i].resolve(callbackData);
        }
      });
    }

    nodeCallbackEventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'message_queue_send_success' &&
        callbackData.request_id === requestId
      ) {
        if (callbackData.node_id.includes('rp')) {
          if (callbackData.destination_node_id.includes('idp')) {
            arrayMqSendSuccessRpToIdpCallback.push(callbackData);
            let idpReceiveRequestPromise = idpsReceiveRequestPromises.find(
              ({ node_id }) => node_id === callbackData.destination_node_id,
            );
            if (idpReceiveRequestPromise) {
              idpReceiveRequestPromise.MqSendSuccessRpToIdpCallbackPromise.resolve(
                callbackData,
              );
            }
          }
          //else if (callbackData.destination_node_id === 'as1') {
          //   mqSendSuccessRpToAsCallbackPromise.resolve(callbackData);
          // }
        } else if (callbackData.node_id.includes('idp')) {
          if (callbackData.destination_node_id.includes('rp')) {
            let idp = mqSendSuccessIdpToRpCallbackPromises.find(
              ({ node_id }) => node_id === callbackData.node_id,
            );
            if (idp) {
              idp.mqSendSuccessIdpToRpCallbackPromise.resolve(callbackData);
            }
          }
        }
        //else if (callbackData.node_id === 'as1') {
        //   if (callbackData.destination_node_id === 'rp1') {
        //     mqSendSuccessAsToRpCallbackPromise.resolve(callbackData);
        //   }
        // }
      }
    });
  });

  it('RP should create a request successfully', async function () {
    this.timeout(10000);
    const testResult = await rpCreateRequestTest({
      callApiAtNodeId: callRpApiAtNodeId,
      createRequestParams,
      setRequestId: (reqId) => requestId = reqId,
      createRequestResultPromise,
    });
    // requestId = testResult.requestId;
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
    initialSalt = testResult.initial_salt;
  });

  it('RP should receive pending request status', async function () {
    this.timeout(30000);

    [idpIdList, dataRequestList, requestMessageHash] = await Promise.all([
      createIdpIdList({
        createRequestParams,
        callRpApiAtNodeId,
        filterForNodeId,
      }),
      createDataRequestList({
        createRequestParams,
        requestId,
        initialSalt,
        callRpApiAtNodeId,
      }),
      createRequestMessageHash({
        createRequestParams,
        initialSalt,
      }),
    ]); // create idp_id_list, as_id_list, request_message_hash for test

    await receivePendingRequestStatusTest({
      nodeId: rpNodeId,
      createRequestParams,
      requestId,
      idpIdList,
      dataRequestList,
      requestMessageHash,
      lastStatusUpdateBlockHeight,
      requestStatusPendingPromise,
      requesterNodeId: rpNodeId,
    });

    await wait(3000); // wait for receive message queue send success callback
  });

  it('RP should receive message queue send success (to IdP) callback', async function () {
    this.timeout(25000);
    // if (
    //   idpsReceiveRequestPromises.length !=
    //   arrayMqSendSuccessRpToIdpCallback.length
    // ) {
    //   throw new Error(
    //     'idps receive request not equal to MQ send success rp to idp callback',
    //   );
    // }

    for (let i = 0; i < idpsReceiveRequestPromises.length; i++) {
      const mqSendSuccessCallbackPromise =
        idpsReceiveRequestPromises[i].MqSendSuccessRpToIdpCallbackPromise;
      const destinationNodeId = idpsReceiveRequestPromises[i].node_id;
      await receiveMessagequeueSendSuccessCallback({
        nodeId: rpNodeId,
        requestId,
        mqSendSuccessCallbackPromise,
        destinationNodeId,
      });
    }
  });

  for (let i = 0; i < idpParams.length; i++) {
    const callIdpApiAtNodeId = idpParams[i].callIdpApiAtNodeId;
    const incomingRequestPromise = incomingRequestPromises[i];
    const responseResultPromise = responseResultPromises[i];
    const accessorEncryptPromise = accessorEncryptPromises[i];
    const requestStatusConfirmedPromise = requestStatusConfirmedPromises[i];
    const requestStatusRejectPromise = requestStatusRejectedPromises[i];
    let { createResponseSignature, ...idpResponseParams } = idpParams[
      i
    ].idpResponseParams;
    const getAccessorForResponse = idpParams[i].getAccessorForResponse;
    const idpNodeId = idpNodeIds[i];
    let responseAccessorId;
    let accessorPublicKey;
    let accessorPrivateKey;

    it(`IdP (${idpNodeId}) should receive incoming request callback`, async function () {
      this.timeout(50000);
      await idpReceiveMode2And3IncomingRequestCallbackTest({
        nodeId: idpNodeId,
        createRequestParams,
        requestId,
        incomingRequestPromise,
        requesterNodeId: rpNodeId,
        initialSalt,
      });
    });

    it(`IdP (${idpNodeId}) should get request_message_padded_hash successfully`, async function () {
      let accessor = getAccessorForResponse({
        namespace: createRequestParams.namespace,
        identifier: createRequestParams.identifier,
      });

      responseAccessorId = accessor.accessorId;
      accessorPublicKey = accessor.accessorPublicKey;
      accessorPrivateKey = accessor.accessorPrivateKey;

      const testResult = await getAndVerifyRequestMessagePaddedHashTest({
        callApiAtNodeId: callIdpApiAtNodeId,
        idpNodeId,
        requestId,
        incomingRequestPromise,
        accessorPublicKey,
        accessorId: responseAccessorId,
      });
      requestMessagePaddedHash = testResult.verifyRequestMessagePaddedHash;
    });

    it(`IdP (${idpNodeId}) should create response (accept) successfully`, async function () {
      this.timeout(10000);
      const signature = createResponseSignature(
        accessorPrivateKey,
        requestMessagePaddedHash,
      );

      idpResponseParams = {
        ...idpResponseParams,
        request_id: requestId,
        accessor_id: responseAccessorId,
        signature,
      };

      idpResponseList.push({
        ...idpResponseParams,
        idp_id: idpNodeId,
        valid_signature: true,
        valid_ial: true,
      }); // for expect response_list

      await idpCreateResponseTest({
        callApiAtNodeId: callIdpApiAtNodeId,
        idpResponseParams,
      });
    });

    if (!createResponseSignature) {
      it(`IdP (${idpNodeId}) should receive accessor encrypt callback with correct data`, async function () {
        this.timeout(25000);
        let testResult = await idpReceiveAccessorEncryptCallbackTest({
          callIdpApiAtNodeId,
          idpNodeId,
          accessorEncryptPromise,
          accessorId: responseAccessorId,
          requestId,
          idpReferenceId: idpResponseParams.reference_id,
          incomingRequestPromise,
          accessorPublicKey,
        });
        requestMessagePaddedHash = testResult.verifyRequestMessagePaddedHash;
      });
    }

    it(`IdP (${idpNodeId}) should receive callback create response result with success = true`, async function () {
      await idpReceiveCreateResponseResultCallbackTest({
        nodeId: idpNodeId,
        requestId,
        idpReferenceId: idpResponseParams.reference_id,
        responseResultPromise,
      });
    });

    it(`IdP (${idpNodeId}) should receive message queue send success (to RP) callback`, async function () {
      this.timeout(25000);
      let mqSendSuccessCallbackPromise = mqSendSuccessIdpToRpCallbackPromises.find(
        ({ node_id }) => node_id === idpNodeId,
      ).mqSendSuccessIdpToRpCallbackPromise;
      if (!mqSendSuccessCallbackPromise) {
        throw new Error(
          `${idpNodeId} not receive MQ send success idp to rp callback`,
        );
      }
      await receiveMessagequeueSendSuccessCallback({
        nodeId: idpNodeId,
        requestId,
        mqSendSuccessCallbackPromise,
        destinationNodeId: rpNodeId,
      });
    });

    if (i < idpNodeIds.length - 1) {
      if (idpResponseParams.status === 'reject') {
        it('RP should receive reject request status', async function () {
          this.timeout(25000);

          const testResult = await receiveRejectedRequestStatusTest({
            nodeId: rpNodeId,
            requestStatusRejectPromise,
            requestId,
            createRequestParams,
            dataRequestList,
            idpResponse: idpResponseList,
            requestMessageHash,
            idpIdList,
            lastStatusUpdateBlockHeight,
            requesterNodeId: rpNodeId,
          });
          lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;

          // const testResult = await receiveRejectedRequestStatusTest({
          //   nodeId: rpNodeId,
          //   requestStatusRejectPromise,
          //   requestId,
          //   createRequestParams,
          //   answeredIdpCount: idpNodeIds.filter(
          //     (idpNodeId, index) => index <= i,
          //   ).length,
          //   serviceList: [],
          //   responseValidList: idpNodeIds
          //     .filter((idpNodeId, index) => index <= i)
          //     .map((idpNodeId) => ({
          //       idp_id: idpNodeId,
          //       valid_signature: true,
          //       valid_ial: true,
          //     })),
          //   lastStatusUpdateBlockHeight,
          // });
        });
      } else {
        it('RP should receive confirmed request status', async function () {
          this.timeout(25000);

          const testResult = await receiveConfirmedRequestStatusTest({
            nodeId: rpNodeId,
            requestStatusConfirmedPromise,
            requestId,
            createRequestParams,
            dataRequestList,
            idpResponse: idpResponseList,
            requestMessageHash,
            idpIdList,
            lastStatusUpdateBlockHeight,
            requesterNodeId: rpNodeId,
          });
          lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;

          // const testResult = await receiveConfirmedRequestStatusTest({
          //   nodeId: rpNodeId,
          //   requestStatusConfirmedPromise,
          //   requestId,
          //   createRequestParams,
          //   answeredIdpCount: idpNodeIds.filter(
          //     (idpNodeId, index) => index <= i,
          //   ).length,
          //   serviceList: [],
          //   responseValidList: idpNodeIds
          //     .filter((idpNodeId, index) => index <= i)
          //     .map((idpNodeId) => ({
          //       idp_id: idpNodeId,
          //       valid_signature: true,
          //       valid_ial: true,
          //     })),
          //   lastStatusUpdateBlockHeight,
          // });
        });
      }
      for (let j = 0; j < idpParams.length; j++) {
        it(`IdP (${idpNodeIds[j]}) should receive ${idpResponseParams.status} request status`, async function () {
          this.timeout(25000);
          const idp_requestStatusPromise =
            idp_requestStatusPromises[idpNodeIds[j]][i];
          let callFunctionReceiveRequestStatusTest =
            idpResponseParams.status === 'accept'
              ? receiveConfirmedRequestStatusTest
              : receiveRejectedRequestStatusTest;

          await callFunctionReceiveRequestStatusTest({
            nodeId: idpNodeIds[j],
            requestStatusPromise: idp_requestStatusPromise,
            requestId,
            createRequestParams,
            dataRequestList,
            idpResponse: idpResponseList,
            requestMessageHash,
            idpIdList,
            lastStatusUpdateBlockHeight,
            testForEqualLastStatusUpdateBlockHeight: true,
            requesterNodeId: rpNodeId,
            isNotRp: true,
          });

          // await callFunctionReceiveRequestStatusTest({
          //   nodeId: idpNodeIds[j],
          //   requestStatusPromise: idp_requestStatusPromise,
          //   requestId,
          //   createRequestParams,
          //   answeredIdpCount: idpNodeIds.filter(
          //     (idpNodeId, index) => index <= i,
          //   ).length,
          //   serviceList: [],
          //   responseValidList: idpNodeIds
          //     .filter((idpNodeId, index) => index <= i)
          //     .map((idpNodeId) => ({
          //       idp_id: idpNodeId,
          //       valid_signature: null,
          //       valid_ial: null,
          //     })),
          //   lastStatusUpdateBlockHeight,
          //   testForEqualLastStatusUpdateBlockHeight: true,
          // });
        });
      }
    } else {
      it(`RP should receive ${finalRequestStatus} request status`, async function () {
        this.timeout(25000);

        const testResult = await callFunctionReceiveRequestStatusTest({
          nodeId: rpNodeId,
          requestStatusPromise,
          requestId,
          createRequestParams,
          dataRequestList,
          idpResponse: idpResponseList,
          requestMessageHash,
          idpIdList,
          lastStatusUpdateBlockHeight,
          requesterNodeId: rpNodeId,
        });
        lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;

        // const testResult = await callFunctionReceiveRequestStatusTest({
        //   nodeId: rpNodeId,
        //   requestStatusPromise,
        //   requestId,
        //   createRequestParams,
        //   serviceList: [],
        //   answeredIdpCount: idpNodeIds.filter((idpNodeId, index) => index <= i)
        //     .length, // for request status rejected
        //   responseValidList: idpNodeIds
        //     .filter((idpNodeId, index) => index <= i)
        //     .map((idpNodeId) => ({
        //       idp_id: idpNodeId,
        //       valid_signature: true,
        //       valid_ial: true,
        //     })),
        //   lastStatusUpdateBlockHeight,
        // });
      });

      for (let j = 0; j < idpParams.length; j++) {
        it(`IdP (${idpNodeIds[j]}) should receive ${finalRequestStatus} request status`, async function () {
          this.timeout(25000);
          let idp_requestStatusPromise = idp_finalRequestStatusPromises[j];
          await callFunctionReceiveRequestStatusTest({
            nodeId: idpNodeIds[j],
            requestStatusPromise: idp_requestStatusPromise,
            requestId,
            createRequestParams,
            dataRequestList,
            idpResponse: idpResponseList,
            requestMessageHash,
            idpIdList,
            lastStatusUpdateBlockHeight,
            testForEqualLastStatusUpdateBlockHeight: true,
            requesterNodeId: rpNodeId,
            isNotRp: true,
          });

          // await callFunctionReceiveRequestStatusTest({
          //   nodeId: idpNodeIds[j],
          //   requestStatusPromise: idp_requestStatusPromise,
          //   requestId,
          //   createRequestParams,
          //   serviceList: [],
          //   answeredIdpCount: idpNodeIds.filter(
          //     (idpNodeId, index) => index <= i,
          //   ).length, // for request status rejected
          //   responseValidList: idpNodeIds
          //     .filter((idpNodeId, index) => index <= i)
          //     .map((idpNodeId) => ({
          //       idp_id: idpNodeId,
          //       valid_signature: null,
          //       valid_ial: null,
          //     })),
          //   lastStatusUpdateBlockHeight,
          //   testForEqualLastStatusUpdateBlockHeight: true,
          // });
        });
      }
    }

    it(`Should verify IdP (${idpNodeId}) response signature successfully`, async function () {
      this.timeout(25000);
      await verifyResponseSignature({
        callApiAtNodeId: callIdpApiAtNodeId,
        requestId,
        idpNodeId,
        requestMessagePaddedHash,
        accessorPrivateKey,
      });
    });
  }
  if (finalRequestStatus === 'completed') {
    it('RP should receive request closed status', async function () {
      this.timeout(10000);

      const testResult = await receiveRequestClosedStatusTest({
        nodeId: rpNodeId,
        requestClosedPromise,
        requestId,
        createRequestParams,
        dataRequestList,
        idpResponse: idpResponseList,
        requestMessageHash,
        idpIdList,
        lastStatusUpdateBlockHeight,
        requesterNodeId: rpNodeId,
      });
      lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;

      // const testResult = await receiveRequestClosedStatusTest({
      //   nodeId: rpNodeId,
      //   requestClosedPromise,
      //   requestId,
      //   createRequestParams,
      //   serviceList: [],
      //   responseValidList: idpNodeIds.map((idpNodeId) => ({
      //     idp_id: idpNodeId,
      //     valid_signature: true,
      //     valid_ial: true,
      //   })),
      //   lastStatusUpdateBlockHeight,
      // });
    });

    for (let i = 0; i < idpParams.length; i++) {
      const idp_requestClosedPromise = idp_requestClosedPromises[i];
      it(`IdP (${idpNodeIds[i]}) should receive request closed status`, async function () {
        this.timeout(10000);

        await receiveRequestClosedStatusTest({
          nodeId: idpNodeIds[i],
          requestClosedPromise: idp_requestClosedPromise,
          requestId,
          createRequestParams,
          dataRequestList,
          idpResponse: idpResponseList,
          requestMessageHash,
          idpIdList,
          lastStatusUpdateBlockHeight,
          testForEqualLastStatusUpdateBlockHeight: true,
          requesterNodeId: rpNodeId,
        });

        // await receiveRequestClosedStatusTest({
        //   nodeId: idpNodeIds[i],
        //   requestClosedPromise: idp_requestClosedPromise,
        //   requestId,
        //   createRequestParams,
        //   serviceList: [],
        //   responseValidList: idpNodeIds.map((idpNodeId) => ({
        //     idp_id: idpNodeId,
        //     valid_signature: true,
        //     valid_ial: true,
        //   })),
        //   lastStatusUpdateBlockHeight,
        //   testForEqualLastStatusUpdateBlockHeight: true,
        // });
      });
    }
  }

  it('RP should receive request status updates', function () {
    let requestStatusCount = idpNodeIds.length;
    if (finalRequestStatus === 'completed') {
      // +2 for pending and closed
      expect(requestStatusUpdates).to.have.lengthOf(requestStatusCount + 2);
    } else {
      // +1 for pending
      expect(requestStatusUpdates).to.have.lengthOf(requestStatusCount + 1);
    }
  });

  it('RP should have and able to get saved private messages', function () {
    return hasPrivateMessagesTest({
      callApiAtNodeId: callRpApiAtNodeId,
      nodeId: rpNodeId !== callRpApiAtNodeId ? rpNodeId : undefined,
      requestId,
    });
  });

  it('RP should remove saved private messages successfully', function () {
    return removePrivateMessagesTest({
      callApiAtNodeId: callRpApiAtNodeId,
      nodeId: rpNodeId !== callRpApiAtNodeId ? rpNodeId : undefined,
      requestId,
    });
  });

  it('RP should have no saved private messages left after removal', function () {
    return hasNoPrivateMessagesTest({
      callApiAtNodeId: callRpApiAtNodeId,
      nodeId: rpNodeId !== callRpApiAtNodeId ? rpNodeId : undefined,
      requestId,
    });
  });

  for (let i = 0; i < idpParams.length; i++) {
    const { callIdpApiAtNodeId } = idpParams[i];
    const idpNodeId = idpNodeIds[i];

    it(`IdP (${idpNodeId}) should have and able to get saved private messages`, function () {
      return hasPrivateMessagesTest({
        callApiAtNodeId: callIdpApiAtNodeId,
        nodeId: idpNodeId !== callIdpApiAtNodeId ? idpNodeId : undefined,
        requestId,
      });
    });

    it(`IdP (${idpNodeId}) should remove saved private messages successfully`, function () {
      return removePrivateMessagesTest({
        callApiAtNodeId: callIdpApiAtNodeId,
        nodeId: idpNodeId !== callIdpApiAtNodeId ? idpNodeId : undefined,
        requestId,
      });
    });

    it(`IdP (${idpNodeId}) should have no saved private messages left after removal`, function () {
      return hasNoPrivateMessagesTest({
        callApiAtNodeId: callIdpApiAtNodeId,
        nodeId: idpNodeId !== callIdpApiAtNodeId ? idpNodeId : undefined,
        requestId,
      });
    });
  }

  after(function () {
    rpEventEmitter.removeAllListeners('callback');
    for (let i = 0; i < idpParams.length; i++) {
      const { idpEventEmitter } = idpParams[i];
      idpEventEmitter.removeAllListeners('callback');
      idpEventEmitter.removeAllListeners('accessor_encrypt_callback');
    }
    nodeCallbackEventEmitter.removeAllListeners('callback');
  });
}
