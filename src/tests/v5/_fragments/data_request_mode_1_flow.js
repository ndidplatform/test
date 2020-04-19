import {
  rpCreateRequestTest,
  verifyRequestParamsHash,
  rpGotDataFromAsTest,
} from './request_flow_fragments/rp';
import {
  idpReceiveMode1IncomingRequestCallbackTest,
  idpCreateResponseTest,
  idpReceiveCreateResponseResultCallbackTest,
} from './request_flow_fragments/idp';
import {
  asReceiveDataRequestTest,
  asSendDataTest,
} from './request_flow_fragments/as';
import {
  receivePendingRequestStatusTest,
  receiveConfirmedRequestStatusTest,
  receiveRejectedRequestStatusTest,
  receiveCompletedRequestStatusTest,
  receiveRequestClosedStatusTest,
  hasPrivateMessagesTest,
  removePrivateMessagesTest,
  hasNoPrivateMessagesTest,
  receiveMessagequeueSendSuccessCallback,
} from './common';

import { createEventPromise, wait } from '../../../utils';
import {
  createIdpIdList,
  createDataRequestList,
  createRequestMessageHash,
  setDataSigned,
  setDataReceived,
} from './fragments_utils';
import { eventEmitter as nodeCallbackEventEmitter } from '../../../callback_server/node';

export function mode1DataRequestFlowTest({
  callRpApiAtNodeId,
  filterForNodeId,
  rpEventEmitter,
  createRequestParams,
  idpParams,
  asParams,
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
  const asNodeIds = asParams.map(({ callAsApiAtNodeId, asResponseParams }) =>
    asResponseParams[0].node_id
      ? asResponseParams[0].node_id
      : callAsApiAtNodeId,
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
  const responseAcceptCount = idpParams.filter(
    (idpParam) => idpParam.idpResponseParams.status === 'accept',
  ).length;
  const responseRejectCount = idpParams.filter(
    (idpParam) => idpParam.idpResponseParams.status === 'reject',
  ).length;

  const requestStatusConfirmedPromises = idpParams.map(() =>
    createEventPromise(),
  ); // RP
  const requestStatusRejectedPromises = idpParams.map(() =>
    createEventPromise(),
  ); // RP
  const requestStatusCompletedPromise = createEventPromise(); // RP
  const requestStatusRejectedPromise = createEventPromise(); // RP
  const requestStatusComplicatedPromise = createEventPromise(); // RP
  const requestClosedPromise = createEventPromise(); // RP

  const mqSendSuccessRpToAsCallbackPromises = asNodeIds.map((nodeId) => {
    return {
      node_id: nodeId,
      mqSendSuccessRpToAsCallbackPromise: createEventPromise(),
    };
  });

  const dataRequestReceivedPromises = asParams.reduce(
    (accumulator, asParam) => {
      let nodeId = asParam.asResponseParams[0].node_id
        ? asParam.asResponseParams[0].node_id
        : asParam.callAsApiAtNodeId;
      return {
        ...accumulator,
        [nodeId]: asParam.asResponseParams.map(() => createEventPromise()), // depend on services
      };
    },
    {},
  );

  const sendDataResultPromises = asParams.reduce((accumulator, asParam) => {
    let nodeId = asParam.asResponseParams[0].node_id
      ? asParam.asResponseParams[0].node_id
      : asParam.callAsApiAtNodeId;
    return {
      ...accumulator,
      [nodeId]: asParam.asResponseParams.map(() => createEventPromise()),
    };
  }, {});

  const mqSendSuccessAsToRpCallbackPromises = asParams.reduce(
    (accumulator, asParam) => {
      let nodeId = asParam.asResponseParams[0].node_id
        ? asParam.asResponseParams[0].node_id
        : asParam.callAsApiAtNodeId;
      return {
        ...accumulator,
        [nodeId]: asParam.asResponseParams.map(() => createEventPromise()),
      };
    },
    {},
  );

  let requestStatusSignedDataPromises = {};
  asParams.map((asParam) => {
    asParam.asResponseParams.map((asResponseParam) => {
      let serviceId = asResponseParam.service_id;
      if (requestStatusSignedDataPromises[serviceId]) {
        requestStatusSignedDataPromises[serviceId].push(createEventPromise());
      } else {
        let arrayEventPromises = [];
        arrayEventPromises.push(createEventPromise());
        requestStatusSignedDataPromises[serviceId] = arrayEventPromises;
      }
    });
  });

  let idp_requestStatusPromises = idpNodeIds.reduce((accumulator, nodeId) => {
    return {
      ...accumulator,
      [nodeId]: idpParams.map(() => createEventPromise()),
    };
  }, {});

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

  let idpsReceiveRequestPromises;
  if (createRequestParams.idp_id_list) {
    idpsReceiveRequestPromises = createRequestParams.idp_id_list.map(
      (node_id) => {
        return {
          node_id,
          MqSendSuccessRpToIdpCallbackPromise: createEventPromise(),
        };
      },
    );
  }

  let requestId;
  let initialSalt;
  let lastStatusUpdateBlockHeight;
  const requestStatusUpdates = [];
  const idp_requestStatusUpdates = [];
  let finalRequestStatus;

  let requestMessageHash;
  let idpResponseList = []; // for expect response_list
  let dataRequestList; // for expect every callback request status
  let idpIdList; // for expect every callback request status

  if (responseAcceptCount > 0 && responseRejectCount > 0) {
    finalRequestStatus = 'complicated';
  } else if (responseAcceptCount > 0 && responseRejectCount === 0) {
    finalRequestStatus = 'completed';
  } else if (responseAcceptCount === 0 && responseRejectCount > 0) {
    finalRequestStatus = 'rejected';
  }

  before(function () {
    if (createRequestParams.min_idp != idpParams.length) {
      throw new Error('idpParams not equal to min_idp');
    }

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
          let serviceSignedData = callbackData.data_request_list.filter(
            (service) => service.response_list.length > 0,
          );
          if (serviceSignedData.length > 0) {
            serviceSignedData.map((service) => {
              service.response_list.map((asAnswer, index) => {
                requestStatusSignedDataPromises[service.service_id][
                  index
                ].resolve(callbackData);
              });
            });
          } else {
            requestStatusConfirmedPromises[answeredIdPCount - 1].resolve(
              callbackData,
            );
          }
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
            if (callbackData.answered_idp_count === idpParams.length) {
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
    }

    for (let i = 0; i < asParams.length; i++) {
      const { asEventEmitter } = asParams[i];
      for (let j = 0; j < asParams[i].asResponseParams.length; j++) {
        asEventEmitter.on('callback', function (callbackData) {
          if (
            callbackData.type === 'data_request' &&
            callbackData.request_id === requestId &&
            callbackData.service_id ===
              asParams[i].asResponseParams[j].service_id
          ) {
            dataRequestReceivedPromises[callbackData.node_id][j].resolve(
              callbackData,
            );
          } else if (
            callbackData.type === 'response_result' &&
            callbackData.request_id === requestId &&
            callbackData.reference_id ===
              asParams[i].asResponseParams[j].reference_id
          ) {
            sendDataResultPromises[callbackData.node_id][j].resolve(
              callbackData,
            );
          }
        });
      }
      // as1EventEmitter.on('callback', function(callbackData) {
      //   if (
      //     callbackData.type === 'data_request' &&
      //     callbackData.request_id === requestId
      //   ) {
      //     dataRequestReceivedPromise.resolve(callbackData);
      //   } else if (
      //     callbackData.type === 'response_result' &&
      //     callbackData.reference_id === asReferenceId
      //   ) {
      //     sendDataResultPromise.resolve(callbackData);
      //   } else if (
      //     callbackData.type === 'request_status' &&
      //     callbackData.request_id === requestId
      //   ) {
      //     as_requestStatusUpdates.push(callbackData);
      //     if (callbackData.status === 'confirmed') {
      //       if (callbackData.service_list[0].signed_data_count === 1) {
      //         as_requestStatusSignedDataPromise.resolve(callbackData);
      //       } else {
      //         as_requestStatusConfirmedPromise.resolve(callbackData);
      //       }
      //     } else if (callbackData.status === 'completed') {
      //       if (callbackData.closed) {
      //         as_requestClosedPromise.resolve(callbackData);
      //       } else {
      //         as_requestStatusCompletedPromise.resolve(callbackData);
      //       }
      //     }
      //   }
      // });
    }
    let receiveMqSendSuccessAsToRpCallbackCount = {};
    nodeCallbackEventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'message_queue_send_success' &&
        callbackData.request_id === requestId
      ) {
        if (callbackData.node_id.includes('rp')) {
          if (callbackData.destination_node_id.includes('idp')) {
            // arrayMqSendSuccessRpToIdpCallback.push(callbackData);
            let idpReceiveRequestPromise = idpsReceiveRequestPromises.find(
              ({ node_id }) => node_id === callbackData.destination_node_id,
            );
            if (idpReceiveRequestPromise) {
              idpReceiveRequestPromise.MqSendSuccessRpToIdpCallbackPromise.resolve(
                callbackData,
              );
            }
          } else if (callbackData.destination_node_id.includes('as')) {
            let mqSendSuccessRpToAs = mqSendSuccessRpToAsCallbackPromises.find(
              ({ node_id }) => node_id === callbackData.destination_node_id,
            );
            if (mqSendSuccessRpToAs) {
              mqSendSuccessRpToAs.mqSendSuccessRpToAsCallbackPromise.resolve(
                callbackData,
              );
            }
          }
        } else if (callbackData.node_id.includes('idp')) {
          if (callbackData.destination_node_id.includes('rp')) {
            let idp = mqSendSuccessIdpToRpCallbackPromises.find(
              ({ node_id }) => node_id === callbackData.node_id,
            );
            if (idp) {
              idp.mqSendSuccessIdpToRpCallbackPromise.resolve(callbackData);
            }
          }
        } else if (callbackData.node_id.includes('as')) {
          if (callbackData.destination_node_id.includes('rp')) {
            if (
              typeof receiveMqSendSuccessAsToRpCallbackCount[
                callbackData.node_id
              ] === 'number'
            ) {
              receiveMqSendSuccessAsToRpCallbackCount[
                callbackData.node_id
              ] += 1;
            } else {
              receiveMqSendSuccessAsToRpCallbackCount[callbackData.node_id] = 0;
            }
            let index =
              receiveMqSendSuccessAsToRpCallbackCount[callbackData.node_id];
            mqSendSuccessAsToRpCallbackPromises[callbackData.node_id][
              index
            ].resolve(callbackData);
          }
        }
      }
    });
  });

  it('RP should create a request successfully', async function () {
    this.timeout(20000);
    const testResult = await rpCreateRequestTest({
      callApiAtNodeId: callRpApiAtNodeId,
      createRequestParams,
      createRequestResultPromise,
    });
    requestId = testResult.requestId;
    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;
    initialSalt = testResult.initial_salt;
  });

  it('RP should verify request_params_hash successfully', async function () {
    this.timeout(25000);
    await verifyRequestParamsHash({
      callApiAtNodeId: callRpApiAtNodeId,
      createRequestParams,
      requestId,
      initialSalt,
    });
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
    const requestStatusConfirmedPromise = requestStatusConfirmedPromises[i];
    const requestStatusRejectPromise = requestStatusRejectedPromises[i];
    let { createResponseSignature, ...idpResponseParams } = idpParams[
      i
    ].idpResponseParams;
    const idpNodeId = idpNodeIds[i];

    it(`IdP (${idpNodeId}) should receive incoming request callback`, async function () {
      this.timeout(50000);
      await idpReceiveMode1IncomingRequestCallbackTest({
        nodeId: idpNodeId,
        createRequestParams,
        requestId,
        incomingRequestPromise,
        requesterNodeId: rpNodeId,
        initialSalt,
      });
    });

    it(`IdP (${idpNodeId}) should create response (${idpResponseParams.status}) successfully`, async function () {
      this.timeout(20000);

      idpResponseParams = {
        ...idpResponseParams,
        request_id: requestId,
        signature: 'Some signature',
      };

      idpResponseList.push({
        ...idpResponseParams,
        idp_id: idpNodeId,
      }); // for expect response_list

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

    // if (i < idpNodeIds.length - 1) {
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
        //   answeredIdpCount: idpNodeIds.filter((idpNodeId, index) => index <= i)
        //     .length,
        //   serviceList: createRequestParams.data_request_list.map(
        //     (serviceList) => ({
        //       service_id: serviceList.service_id,
        //       min_as: serviceList.min_as,
        //       signed_data_count: 0,
        //       received_data_count: 0,
        //     }),
        //   ),
        //   responseValidList: idpNodeIds
        //     .filter((idpNodeId, index) => index <= i)
        //     .map((idpNodeId) => ({
        //       idp_id: idpNodeId,
        //       valid_signature: null,
        //       valid_ial: null,
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

        //   const testResult = await receiveConfirmedRequestStatusTest({
        //     nodeId: rpNodeId,
        //     requestStatusConfirmedPromise,
        //     requestId,
        //     createRequestParams,
        //     answeredIdpCount: idpNodeIds.filter((idpNodeId, index) => index <= i)
        //       .length,
        //     serviceList: createRequestParams.data_request_list.map(
        //       (serviceList) => ({
        //         service_id: serviceList.service_id,
        //         min_as: serviceList.min_as,
        //         signed_data_count: 0,
        //         received_data_count: 0,
        //       }),
        //     ),
        //     responseValidList: idpNodeIds
        //       .filter((idpNodeId, index) => index <= i)
        //       .map((idpNodeId) => ({
        //         idp_id: idpNodeId,
        //         valid_signature: null,
        //         valid_ial: null,
        //       })),
        //     lastStatusUpdateBlockHeight,
        //   });
      });
    }
    for (let j = 0; j < idpParams.length; j++) {
      it(`IdP (${idpNodeIds[j]}) should receive ${idpResponseParams.status} request status`, async function () {
        this.timeout(25000);
        const idp_requestStatusPromise =
          idp_requestStatusPromises[idpNodeIds[j]][i];
        receiveConfirmedRequestStatusTest;
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
        //   answeredIdpCount: idpNodeIds.filter((idpNodeId, index) => index <= i)
        //     .length,
        //   serviceList: createRequestParams.data_request_list.map(
        //     (serviceList) => ({
        //       service_id: serviceList.service_id,
        //       min_as: serviceList.min_as,
        //       signed_data_count: 0,
        //       received_data_count: 0,
        //     }),
        //   ),
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
    // }
  }

  for (let i = 0; i < asParams.length; i++) {
    let asNodeId = asNodeIds[i];
    it(`RP should receive message queue send success (To ${asNodeId}) callback`, async function () {
      this.timeout(25000);
      const mqSendSuccessCallbackPromise =
        mqSendSuccessRpToAsCallbackPromises[i]
          .mqSendSuccessRpToAsCallbackPromise;
      await receiveMessagequeueSendSuccessCallback({
        nodeId: rpNodeId,
        requestId,
        mqSendSuccessCallbackPromise,
        destinationNodeId: asNodeId,
      });
    });
  }

  for (let i = 0; i < asParams.length; i++) {
    let asNodeId = asNodeIds[i];
    let callApiAtNodeId = asParams[i].callAsApiAtNodeId;
    for (let j = 0; j < asParams[i].asResponseParams.length; j++) {
      let asReferenceId = asParams[i].asResponseParams[j].reference_id;
      let callbackUrl = asParams[i].asResponseParams[j].callback_url;
      let data = asParams[i].asResponseParams[j].data;
      let serviceId = asParams[i].asResponseParams[j].service_id;
      let requestParams = createRequestParams.data_request_list.find(
        (service) => service.service_id === serviceId,
      ).request_params;

      it(`${asNodeId} should receive data request ${serviceId}`, async function () {
        this.timeout(25000);
        let dataRequestReceivedPromise =
          dataRequestReceivedPromises[asNodeId][j];
        await asReceiveDataRequestTest({
          dataRequestReceivedPromise,
          requestId,
          createRequestParams,
          serviceId,
          requestParams,
          requesterNodeId: rpNodeId,
        });
      });

      it(`${asNodeId} should send data ${serviceId} successfully`, async function () {
        this.timeout(25000);
        let sendDataResultPromise = sendDataResultPromises[asNodeId][j];
        await asSendDataTest({
          callApiAtNodeId,
          nodeId: asNodeId,
          requestId,
          serviceId,
          asReferenceId,
          callbackUrl,
          data,
          sendDataResultPromise,
        });

        dataRequestList = setDataSigned(dataRequestList, serviceId, asNodeId);
      });

      it(`AS should receive message queue send success (To ${rpNodeId}) callback`, async function () {
        this.timeout(25000);
        const mqSendSuccessCallbackPromise =
          mqSendSuccessAsToRpCallbackPromises[asNodeId][j];
        await receiveMessagequeueSendSuccessCallback({
          nodeId: asNodeId,
          requestId,
          mqSendSuccessCallbackPromise,
          destinationNodeId: rpNodeId,
        });
      });

      it(`RP should receive request status with service ${serviceId} signed data count = ${
        i + 1
      }`, async function () {
        this.timeout(25000);
        let requestStatusSignedDataPromise =
          requestStatusSignedDataPromises[serviceId][i];

        const testResult = await receiveConfirmedRequestStatusTest({
          nodeId: rpNodeId,
          requestStatusConfirmedPromise: requestStatusSignedDataPromise,
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

        dataRequestList = setDataReceived(dataRequestList, serviceId, asNodeId);

        // const testResult = await receiveConfirmedRequestStatusTest({
        //   nodeId: rpNodeId,
        //   requestStatusConfirmedPromise: requestStatusSignedDataPromise,
        //   requestId,
        //   createRequestParams,
        //   answeredIdpCount: idpNodeIds.length,
        //   serviceList: createRequestParams.data_request_list.map(
        //     (dataRequestList) => ({
        //       service_id: dataRequestList.service_id,
        //       min_as: dataRequestList.min_as,
        //       signed_data_count:
        //         dataRequestList.service_id === serviceId ? i + 1 : j + i,
        //       received_data_count:
        //         dataRequestList.service_id === serviceId ? i : j + i,
        //     }),
        //   ),
        //   responseValidList: idpNodeIds.map((nodeId) => ({
        //     idp_id: nodeId,
        //     valid_signature: null,
        //     valid_ial: null,
        //   })),
        //   lastStatusUpdateBlockHeight,
        // });
      });
    }
  }

  if (finalRequestStatus === 'completed') {
    it('RP should receive request completed status', async function () {
      this.timeout(20000);

      const testResult = await receiveCompletedRequestStatusTest({
        nodeId: rpNodeId,
        requestStatusCompletedPromise,
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

      // const testResult = await receiveCompletedRequestStatusTest({
      //   nodeId: rpNodeId,
      //   requestStatusCompletedPromise,
      //   requestId,
      //   createRequestParams,
      //   serviceList: createRequestParams.data_request_list.map(
      //     (dataRequestList) => ({
      //       service_id: dataRequestList.service_id,
      //       min_as: dataRequestList.min_as,
      //       signed_data_count: dataRequestList.min_as,
      //       received_data_count: dataRequestList.min_as,
      //     }),
      //   ),
      //   responseValidList: idpNodeIds.map((idpNodeId) => ({
      //     idp_id: idpNodeId,
      //     valid_signature: null,
      //     valid_ial: null,
      //   })),
      //   lastStatusUpdateBlockHeight,
      // });
    });

    it('RP should receive request closed status', async function () {
      this.timeout(20000);
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
      //   serviceList: createRequestParams.data_request_list.map(
      //     (dataRequestList) => ({
      //       service_id: dataRequestList.service_id,
      //       min_as: dataRequestList.min_as,
      //       signed_data_count: dataRequestList.min_as,
      //       received_data_count: dataRequestList.min_as,
      //     }),
      //   ),
      //   responseValidList: idpNodeIds.map((idpNodeId) => ({
      //     idp_id: idpNodeId,
      //     valid_signature: null,
      //     valid_ial: null,
      //   })),
      //   lastStatusUpdateBlockHeight,
      // });
    });

    for (let i = 0; i < idpParams.length; i++) {
      const idp_requestClosedPromise = idp_requestClosedPromises[i];
      it(`IdP (${idpNodeIds[i]}) should receive request closed status`, async function () {
        this.timeout(20000);

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

        //   await receiveRequestClosedStatusTest({
        //     nodeId: idpNodeIds[i],
        //     requestClosedPromise: idp_requestClosedPromise,
        //     requestId,
        //     createRequestParams,
        //     serviceList: createRequestParams.data_request_list.map(
        //       (dataRequestList) => ({
        //         service_id: dataRequestList.service_id,
        //         min_as: dataRequestList.min_as,
        //         signed_data_count: dataRequestList.min_as,
        //         received_data_count: dataRequestList.min_as,
        //       }),
        //     ),
        //     responseValidList: idpNodeIds.map((idpNodeId) => ({
        //       idp_id: idpNodeId,
        //       valid_signature: null,
        //       valid_ial: null,
        //     })),
        //     lastStatusUpdateBlockHeight,
        //     testForEqualLastStatusUpdateBlockHeight: true,
        //   });
      });
    }
  }

  it('RP should get the correct data received from AS', async function () {
    this.timeout(20000);
    let asResponseDataArr = [];
    asParams.forEach((asParam) => {
      asParam.asResponseParams.forEach((asResponseParam) => {
        asResponseDataArr.push({
          sourceNodeId: asResponseParam.node_id
            ? asResponseParam.node_id
            : asParam.callAsApiAtNodeId,
          serviceId: asResponseParam.service_id,
          data: asResponseParam.data,
        });
      });
    });
    await rpGotDataFromAsTest({
      callApiAtNodeId: callRpApiAtNodeId,
      createRequestParams,
      requestId,
      asResponseDataArr,
    });
  });

  // it('RP should receive request status updates', async function() {
  //   let requestStatusCount = idpNodeIds.length + createRequestParams.data_request_list
  //   if (finalRequestStatus === 'completed') {
  //     // +2 for pending and closed
  //     expect(requestStatusUpdates).to.have.lengthOf(requestStatusCount + 2);
  //   } else {
  //     // +1 for pending
  //     expect(requestStatusUpdates).to.have.lengthOf(requestStatusCount + 1);
  //   }
  // });

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
    }
    for (let i = 0; i < asParams.length; i++) {
      const { asEventEmitter } = asParams[i];
      asEventEmitter.removeAllListeners('callback');
    }
    nodeCallbackEventEmitter.removeAllListeners('callback');
  });
}
