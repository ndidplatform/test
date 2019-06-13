import { expect } from 'chai';

import { rpCreateRequestTest } from './request_flow_fragments/rp';
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
  receiveComplicatedRequestStatusTest,
  receiveRequestClosedStatusTest,
  hasPrivateMessagesTest,
  removePrivateMessagesTest,
  hasNoPrivateMessagesTest,
  receiveMessagequeueSendSuccessCallback,
} from './common';

import { createEventPromise} from '../../../utils';
import { eventEmitter as nodeCallbackEventEmitter } from '../../../callback_server/node';

export function mode1DataRequestFlowTest({
  callRpApiAtNodeId,
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
      idpResponseParams.node_id ? idpResponseParams.node_id : callIdpApiAtNodeId
  );
  const asNodeIds = asParams.map(({ callAsApiAtNodeId, asResponseParams }) =>
    asResponseParams.node_id ? asResponseParams.node_id : callAsApiAtNodeId
  );

  const createRequestResultPromise = createEventPromise(); // RP
  const requestStatusPendingPromise = createEventPromise(); // RP
  const incomingRequestPromises = idpParams.map(() => createEventPromise()); // IdPs
  const responseResultPromises = idpParams.map(() => createEventPromise()); // IdPs
  const mqSendSuccessIdpToRpCallbackPromises = idpNodeIds.map(nodeId => {
    return {
      node_id: nodeId,
      mqSendSuccessIdpToRpCallbackPromise: createEventPromise(),
    };
  }); //IdPs
  const responseAcceptCount = idpParams.filter(
    idpParam => idpParam.idpResponseParams.status === 'accept'
  ).length;
  const responseRejectCount = idpParams.filter(
    idpParam => idpParam.idpResponseParams.status === 'reject'
  ).length;

  const requestStatusConfirmedPromises = idpParams.map(() =>
    createEventPromise()
  ); // RP
  const requestStatusRejectedPromises = idpParams.map(() =>
    createEventPromise()
  ); // RP
  const requestStatusCompletedPromise = createEventPromise(); // RP
  const requestStatusRejectedPromise = createEventPromise(); // RP
  const requestStatusComplicatedPromise = createEventPromise(); // RP

  const mqSendSuccessRpToAsCallbackPromises = asNodeIds.map(nodeId => {
    return {
      node_id: nodeId,
      mqSendSuccessRpToAsCallbackPromise: createEventPromise(),
    };
  });

  const dataRequestReceivedPromises = asParams.reduce(
    (accumulator, asParam) => {
      let nodeId = asParam.asResponseParams[0].node_id
        ? asParams.asResponseParams[0].node_id
        : asParam.callAsApiAtNodeId;
      return {
        ...accumulator,
        [nodeId]: asParam.asResponseParams.map(() => createEventPromise()), // depend on services
      };
    },
    {}
  );

  const sendDataResultPromises = asParams.reduce((accumulator, asParam) => {
    let nodeId = asParam.asResponseParams[0].node_id
      ? asParams.asResponseParams[0].node_id
      : asParam.callAsApiAtNodeId;
    return {
      ...accumulator,
      [nodeId]: asParam.asResponseParams.map(() => createEventPromise()),
    };
  }, {});

  let requestStatusSignedDataPromises = {};
  asParams.map(asParam => {
    asParam.asResponseParams.map(asResponseParam => {
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

  const requestClosedPromise = createEventPromise(); // RP

  let idp_requestStatusPromises = idpNodeIds.reduce((accumulator, nodeId) => {
    return {
      ...accumulator,
      [nodeId]: idpParams.map(() => createEventPromise()),
    };
  }, {});

  // idpNodeIds.forEach(nodeId => {
  //   idp_requestStatusPromises = {
  //     ...idp_requestStatusPromises,
  //     [nodeId]: idpParams.map(() => createEventPromise()),
  //   };
  // });

  const idp_requestStatusCompletedPromises = idpParams.map(() =>
    createEventPromise()
  );

  const idp_requestStatusComplicatedPromises = idpParams.map(() =>
    createEventPromise()
  );

  const idp_requestStatusRejectedPromise = idpParams.map(() =>
    createEventPromise()
  );

  const idp_requestClosedPromises = idpParams.map(() => createEventPromise());

  let idpsReceiveRequestPromises;
  if (createRequestParams.idp_id_list) {
    idpsReceiveRequestPromises = createRequestParams.idp_id_list.map(
      node_id => {
        return {
          node_id,
          MqSendSuccessRpToIdpCallbackPromise: createEventPromise(),
        };
      }
    );
  }

  let requestId;
  let lastStatusUpdateBlockHeight;
  let arrayMqSendSuccessRpToIdpCallback = [];
  const requestStatusUpdates = [];
  const idp_requestStatusUpdates = [];
  let finalRequestStatus;
  let callFunctionReceiveRequestStatusTest;
  let requestStatusPromise;
  let idp_finalRequestStatusPromises;

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
          let callbackSignedData = callbackData.service_list.filter(
            serviceList => serviceList.signed_data_count > 0
          );
          if (callbackSignedData.length > 0) {
            callbackSignedData.map(serviceList => {
              requestStatusSignedDataPromises[serviceList.service_id][
                serviceList.signed_data_count - 1
              ].resolve(callbackData);
            });
          } else {
            requestStatusConfirmedPromises[
              callbackData.answered_idp_count - 1
            ].resolve(callbackData);
          }
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
        } else if (
          callbackData.type === 'request_status' &&
          callbackData.request_id === requestId
        ) {
          idp_requestStatusUpdates.push(callbackData);
          if (callbackData.status === 'pending') {
            // idp_requestStatusPendingPromises[i].resolve(callbackData);
          } else if (callbackData.status === 'confirmed') {
            idp_requestStatusPromises[callbackData.node_id][
              callbackData.answered_idp_count - 1
            ].resolve(callbackData);
          } else if (callbackData.status === 'rejected') {
            if (callbackData.answered_idp_count === idpParams.length) {
              idp_requestStatusRejectedPromise[i].resolve(callbackData);
            } else {
              idp_requestStatusPromises[callbackData.node_id][
                callbackData.answered_idp_count - 1
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
        asEventEmitter.on('callback', function(callbackData) {
          if (
            callbackData.type === 'data_request' &&
            callbackData.request_id === requestId &&
            callbackData.service_id ===
              asParams[i].asResponseParams[j].service_id
          ) {
            dataRequestReceivedPromises[callbackData.node_id][j].resolve(
              callbackData
            );
          } else if (
            callbackData.type === 'send_data_result' &&
            callbackData.request_id === requestId &&
            callbackData.reference_id ===
              asParams[i].asResponseParams[j].reference_id
          ) {
            sendDataResultPromises[callbackData.node_id][j].resolve(
              callbackData
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
      //     callbackData.type === 'send_data_result' &&
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
    nodeCallbackEventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'message_queue_send_success' &&
        callbackData.request_id === requestId
      ) {
        if (callbackData.node_id === 'rp1') {
          if (callbackData.destination_node_id.includes('idp')) {
            arrayMqSendSuccessRpToIdpCallback.push(callbackData);
            let idpReceiveRequestPromise = idpsReceiveRequestPromises.find(
              ({ node_id }) => node_id === callbackData.destination_node_id
            );
            if (idpReceiveRequestPromise) {
              idpReceiveRequestPromise.MqSendSuccessRpToIdpCallbackPromise.resolve(
                callbackData
              );
            }
          } else if (callbackData.destination_node_id.includes('as')) {
            let mqSendSuccessRpToAs = mqSendSuccessRpToAsCallbackPromises.find(
              ({ node_id }) => node_id === callbackData.destination_node_id
            );
            if (mqSendSuccessRpToAs) {
              mqSendSuccessRpToAs.mqSendSuccessRpToAsCallbackPromise.resolve(
                callbackData
              );
            }
          }
        } else if (callbackData.node_id.includes('idp')) {
          if (callbackData.destination_node_id.includes('rp')) {
            let idp = mqSendSuccessIdpToRpCallbackPromises.find(
              ({ node_id }) => node_id === callbackData.node_id
            );
            if (idp) {
              idp.mqSendSuccessIdpToRpCallbackPromise.resolve(callbackData);
            }
          }
        }
        // else if (callbackData.node_id === 'as1') {
        //   if (callbackData.destination_node_id === 'rp1') {
        //     mqSendSuccessAsToRpCallbackPromise.resolve(callbackData);
        //   }
        // }
      }
    });
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

  it('RP should receive message queue send success (to IdP) callback', async function() {
    this.timeout(15000);
    if (
      idpsReceiveRequestPromises.length !=
      arrayMqSendSuccessRpToIdpCallback.length
    ) {
      throw new Error(
        'idps receive request not equal to MQ send success rp to idp callback'
      );
    }

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

    it(`IdP (${idpNodeId}) should receive message queue send success (to RP) callback`, async function() {
      this.timeout(15000);
      let mqSendSuccessCallbackPromise = mqSendSuccessIdpToRpCallbackPromises.find(
        ({ node_id }) => node_id === idpNodeId
      ).mqSendSuccessIdpToRpCallbackPromise;
      if (!mqSendSuccessCallbackPromise) {
        throw new Error(
          `${idpNodeId} not receive MQ send success idp to rp callback`
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
      it('RP should receive reject request status', async function() {
        this.timeout(15000);
        const testResult = await receiveRejectedRequestStatusTest({
          nodeId: rpNodeId,
          requestStatusRejectPromise,
          requestId,
          createRequestParams,
          answeredIdpCount: idpNodeIds.filter((idpNodeId, index) => index <= i)
            .length,
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
          answeredIdpCount: idpNodeIds.filter((idpNodeId, index) => index <= i)
            .length,
          serviceList: createRequestParams.data_request_list.map(
            serviceList => ({
              service_id: serviceList.service_id,
              min_as: serviceList.min_as,
              signed_data_count: 0,
              received_data_count: 0,
            })
          ),
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
    for (let j = 0; j < idpParams.length; j++) {
      it(`IdP (${idpNodeIds[j]}) should receive ${
        idpResponseParams.status
      } request status`, async function() {
        this.timeout(15000);
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
          answeredIdpCount: idpNodeIds.filter((idpNodeId, index) => index <= i)
            .length,
          serviceList: createRequestParams.data_request_list.map(
            serviceList => ({
              service_id: serviceList.service_id,
              min_as: serviceList.min_as,
              signed_data_count: 0,
              received_data_count: 0,
            })
          ),
          responseValidList: idpNodeIds
            .filter((idpNodeId, index) => index <= i)
            .map(idpNodeId => ({
              idp_id: idpNodeId,
              valid_signature: null,
              valid_ial: null,
            })),
          lastStatusUpdateBlockHeight,
          testForEqualLastStatusUpdateBlockHeight: true,
        });
      });
    }
    // }
  }

  for (let i = 0; i < asParams.length; i++) {
    let asNodeId = asNodeIds[i];
    it(`RP should receive message queue send success (To ${asNodeId}) callback`, async function() {
      this.timeout(15000);
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
        service => service.service_id === serviceId
      ).request_params;

      it(`${asNodeId} should receive data request ${serviceId}`, async function() {
        this.timeout(15000);
        let dataRequestReceivedPromise =
          dataRequestReceivedPromises[asNodeId][j];
        await asReceiveDataRequestTest({
          dataRequestReceivedPromise,
          requestId,
          createRequestParams,
          serviceId,
          requestParams,
        });
      });

      it(`${asNodeId} should send data ${serviceId} successfully`, async function() {
        this.timeout(15000);
        let sendDataResultPromise = sendDataResultPromises[asNodeId][j];
        await asSendDataTest({
          callApiAtNodeId,
          requestId,
          serviceId,
          asReferenceId,
          callbackUrl,
          data,
          sendDataResultPromise,
        });
      });

      it(`RP should receive request status with service ${serviceId} signed data count = ${i +
        1}`, async function() {
        this.timeout(15000);
        let requestStatusSignedDataPromise =
          requestStatusSignedDataPromises[serviceId][i];
        const testResult = await receiveConfirmedRequestStatusTest({
          nodeId: rpNodeId,
          requestStatusConfirmedPromise: requestStatusSignedDataPromise,
          requestId,
          createRequestParams,
          answeredIdpCount: idpNodeIds.length,
          serviceList: createRequestParams.data_request_list.map(
            dataRequestList => ({
              service_id: dataRequestList.service_id,
              min_as: dataRequestList.min_as,
              signed_data_count:
                dataRequestList.service_id === serviceId ? i + 1 : j+i,
              received_data_count:
                dataRequestList.service_id === serviceId ? i : j+i,
            })
          ),
          responseValidList: idpNodeIds.map(nodeId => ({
            idp_id: nodeId,
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
        serviceList: createRequestParams.data_request_list.map(
          dataRequestList => ({
            service_id: dataRequestList.service_id,
            min_as: dataRequestList.min_as,
            signed_data_count: dataRequestList.min_as,
            received_data_count: dataRequestList.min_as,
          })
        ),
        responseValidList: idpNodeIds.map(idpNodeId => ({
          idp_id: idpNodeId,
          valid_signature: null,
          valid_ial: null,
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
          nodeId: idpNodeIds[i],
          requestClosedPromise: idp_requestClosedPromise,
          requestId,
          createRequestParams,
          serviceList: createRequestParams.data_request_list.map(
            dataRequestList => ({
              service_id: dataRequestList.service_id,
              min_as: dataRequestList.min_as,
              signed_data_count: dataRequestList.min_as,
              received_data_count: dataRequestList.min_as,
            })
          ),
          responseValidList: idpNodeIds.map(idpNodeId => ({
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
