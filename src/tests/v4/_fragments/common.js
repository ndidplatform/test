import { expect } from 'chai';

import * as commonApi from '../../../api/v4/common';

export async function receivePendingRequestStatusTest({
  nodeId,
  createRequestParams,
  requestId,
  lastStatusUpdateBlockHeight,
  requestStatusPendingPromise,
  // serviceList = [
  //   {
  //     service_id: createRequestParams.data_request_list[0].service_id,
  //     min_as: createRequestParams.data_request_list[0].min_as,
  //     signed_data_count: 0,
  //     received_data_count: 0,
  //   },
  // ],
}) {
  let serviceList = [];
  if (createRequestParams.data_request_list) {
    serviceList = createRequestParams.data_request_list.map(service => {
      return {
        service_id: service.service_id,
        min_as: service.min_as,
        signed_data_count: 0,
        received_data_count: 0,
      };
    });
  }

  const requestStatus = await requestStatusPendingPromise.promise;
  expect(requestStatus).to.deep.include({
    node_id: nodeId,
    request_id: requestId,
    status: 'pending',
    mode: createRequestParams.mode,
    min_idp: createRequestParams.min_idp,
    answered_idp_count: 0,
    closed: false,
    timed_out: false,
    service_list: serviceList,
    response_valid_list: [],
  });
  expect(requestStatus).to.have.property('block_height');
  expect(requestStatus.block_height).is.a('string');
  const splittedBlockHeight = requestStatus.block_height.split(':');
  expect(splittedBlockHeight).to.have.lengthOf(2);
  expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
  expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
  expect(parseInt(splittedBlockHeight[1])).to.equal(
    lastStatusUpdateBlockHeight
  );
}

export async function receiveConfirmedRequestStatusTest({
  nodeId,
  requestStatusConfirmedPromise,
  requestId,
  createRequestParams,
  answeredIdpCount,
  serviceList,
  responseValidList,
  lastStatusUpdateBlockHeight,
  testForEqualLastStatusUpdateBlockHeight,
  requestStatusPromise,
}) {
  if (requestStatusPromise && !requestStatusConfirmedPromise) {
    requestStatusConfirmedPromise = requestStatusPromise;
  }
  const requestStatus = await requestStatusConfirmedPromise.promise;
  expect(requestStatus).to.deep.include({
    node_id: nodeId,
    request_id: requestId,
    status: 'confirmed',
    mode: createRequestParams.mode,
    min_idp: createRequestParams.min_idp,
    answered_idp_count: answeredIdpCount,
    closed: false,
    timed_out: false,
    service_list: serviceList,
    response_valid_list: responseValidList,
  });
  expect(requestStatus).to.have.property('block_height');
  expect(requestStatus.block_height).is.a('string');
  const splittedBlockHeight = requestStatus.block_height.split(':');
  expect(splittedBlockHeight).to.have.lengthOf(2);
  expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
  expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
  if (testForEqualLastStatusUpdateBlockHeight) {
    expect(parseInt(splittedBlockHeight[1])).to.equal(
      lastStatusUpdateBlockHeight
    );
  } else {
    expect(parseInt(splittedBlockHeight[1])).to.be.above(
      lastStatusUpdateBlockHeight
    );
  }
  return {
    lastStatusUpdateBlockHeight: parseInt(splittedBlockHeight[1]),
  };
}

export async function receiveRejectedRequestStatusTest({
  nodeId,
  requestStatusRejectPromise,
  requestId,
  createRequestParams,
  answeredIdpCount,
  serviceList,
  responseValidList,
  lastStatusUpdateBlockHeight,
  testForEqualLastStatusUpdateBlockHeight,
  requestStatusPromise,
}) {
  if (requestStatusPromise && !requestStatusRejectPromise) {
    requestStatusRejectPromise = requestStatusPromise;
  }
  const requestStatus = await requestStatusRejectPromise.promise;
  expect(requestStatus).to.deep.include({
    node_id: nodeId,
    request_id: requestId,
    status: 'rejected',
    mode: createRequestParams.mode,
    min_idp: createRequestParams.min_idp,
    answered_idp_count: answeredIdpCount,
    closed: false,
    timed_out: false,
    service_list: serviceList,
    response_valid_list: responseValidList,
  });
  expect(requestStatus).to.have.property('block_height');
  expect(requestStatus.block_height).is.a('string');
  const splittedBlockHeight = requestStatus.block_height.split(':');
  expect(splittedBlockHeight).to.have.lengthOf(2);
  expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
  expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
  if (testForEqualLastStatusUpdateBlockHeight) {
    expect(parseInt(splittedBlockHeight[1])).to.equal(
      lastStatusUpdateBlockHeight
    );
  } else {
    expect(parseInt(splittedBlockHeight[1])).to.be.above(
      lastStatusUpdateBlockHeight
    );
  }
  return {
    lastStatusUpdateBlockHeight: parseInt(splittedBlockHeight[1]),
  };
}

export async function receiveCompletedRequestStatusTest({
  nodeId,
  requestStatusCompletedPromise,
  requestId,
  createRequestParams,
  serviceList,
  responseValidList,
  lastStatusUpdateBlockHeight,
  testForEqualLastStatusUpdateBlockHeight,
  requestStatusPromise,
}) {
  if (requestStatusPromise && !requestStatusCompletedPromise) {
    requestStatusCompletedPromise = requestStatusPromise;
  }
  const requestStatus = await requestStatusCompletedPromise.promise;
  expect(requestStatus).to.deep.include({
    node_id: nodeId,
    request_id: requestId,
    status: 'completed',
    mode: createRequestParams.mode,
    min_idp: createRequestParams.min_idp,
    answered_idp_count: createRequestParams.min_idp,
    closed: false,
    timed_out: false,
    service_list: serviceList,
    response_valid_list: responseValidList,
  });
  expect(requestStatus).to.have.property('block_height');
  expect(requestStatus.block_height).is.a('string');
  const splittedBlockHeight = requestStatus.block_height.split(':');
  expect(splittedBlockHeight).to.have.lengthOf(2);
  expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
  expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
  if (testForEqualLastStatusUpdateBlockHeight) {
    expect(parseInt(splittedBlockHeight[1])).to.equal(
      lastStatusUpdateBlockHeight
    );
  } else {
    expect(parseInt(splittedBlockHeight[1])).to.be.above(
      lastStatusUpdateBlockHeight
    );
  }
  return {
    lastStatusUpdateBlockHeight: parseInt(splittedBlockHeight[1]),
  };
}

export async function receiveComplicatedRequestStatusTest({
  nodeId,
  requestStatusComplicatedPromise,
  requestId,
  createRequestParams,
  serviceList,
  responseValidList,
  lastStatusUpdateBlockHeight,
  testForEqualLastStatusUpdateBlockHeight,
  requestStatusPromise,
}) {
  if (requestStatusPromise && !requestStatusComplicatedPromise) {
    requestStatusComplicatedPromise = requestStatusPromise;
  }
  const requestStatus = await requestStatusComplicatedPromise.promise;
  expect(requestStatus).to.deep.include({
    node_id: nodeId,
    request_id: requestId,
    status: 'complicated',
    mode: createRequestParams.mode,
    min_idp: createRequestParams.min_idp,
    answered_idp_count: createRequestParams.min_idp,
    closed: false,
    timed_out: false,
    service_list: serviceList,
    response_valid_list: responseValidList,
  });
  expect(requestStatus).to.have.property('block_height');
  expect(requestStatus.block_height).is.a('string');
  const splittedBlockHeight = requestStatus.block_height.split(':');
  expect(splittedBlockHeight).to.have.lengthOf(2);
  expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
  expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
  if (testForEqualLastStatusUpdateBlockHeight) {
    expect(parseInt(splittedBlockHeight[1])).to.equal(
      lastStatusUpdateBlockHeight
    );
  } else {
    expect(parseInt(splittedBlockHeight[1])).to.be.above(
      lastStatusUpdateBlockHeight
    );
  }
  return {
    lastStatusUpdateBlockHeight: parseInt(splittedBlockHeight[1]),
  };
}

export async function receiveRequestClosedStatusTest({
  nodeId,
  requestClosedPromise,
  requestId,
  createRequestParams,
  serviceList,
  responseValidList,
  lastStatusUpdateBlockHeight,
  testForEqualLastStatusUpdateBlockHeight,
}) {
  const requestStatus = await requestClosedPromise.promise;
  expect(requestStatus).to.deep.include({
    node_id: nodeId,
    request_id: requestId,
    status: 'completed',
    mode: createRequestParams.mode,
    min_idp: createRequestParams.min_idp,
    answered_idp_count: createRequestParams.min_idp,
    closed: true,
    timed_out: false,
    service_list: serviceList,
    response_valid_list: responseValidList,
  });
  expect(requestStatus).to.have.property('block_height');
  expect(requestStatus.block_height).is.a('string');
  const splittedBlockHeight = requestStatus.block_height.split(':');
  expect(splittedBlockHeight).to.have.lengthOf(2);
  expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
  expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
  if (testForEqualLastStatusUpdateBlockHeight) {
    expect(parseInt(splittedBlockHeight[1])).to.equal(
      lastStatusUpdateBlockHeight
    );
  } else {
    expect(parseInt(splittedBlockHeight[1])).to.be.above(
      lastStatusUpdateBlockHeight
    );
  }
  return {
    lastStatusUpdateBlockHeight: parseInt(splittedBlockHeight[1]),
  };
}

export async function hasPrivateMessagesTest({
  callApiAtNodeId,
  nodeId,
  requestId,
}) {
  const response = await commonApi.getPrivateMessages(callApiAtNodeId, {
    node_id: nodeId,
    request_id: requestId,
  });
  const responseBody = await response.json();
  expect(response.status).to.equal(200);
  expect(responseBody).to.be.an('array').that.is.not.empty;
}

export async function removePrivateMessagesTest({
  callApiAtNodeId,
  nodeId,
  requestId,
}) {
  const response = await commonApi.removePrivateMessages(callApiAtNodeId, {
    node_id: nodeId,
    request_id: requestId,
  });
  expect(response.status).to.equal(204);
}

export async function hasNoPrivateMessagesTest({
  callApiAtNodeId,
  nodeId,
  requestId,
}) {
  const response = await commonApi.getPrivateMessages(callApiAtNodeId, {
    node_id: nodeId,
    request_id: requestId,
  });
  const responseBody = await response.json();
  expect(response.status).to.equal(200);
  expect(responseBody).to.be.an('array').that.is.empty;
}

export async function receiveMessagequeueSendSuccessCallback({
  nodeId,
  requestId,
  mqSendSuccessCallbackPromise,
  destinationNodeId,
}) {
  const mqSendSuccess = await mqSendSuccessCallbackPromise.promise;

  expect(mqSendSuccess).to.deep.include({
    node_id: nodeId,
    type: 'message_queue_send_success',
    destination_node_id: destinationNodeId,
    request_id: requestId,
  });
  expect(mqSendSuccess.destination_ip).to.be.a('string').that.is.not.empty;
  expect(mqSendSuccess.destination_port).to.be.a('number');
}
