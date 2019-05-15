import { expect } from 'chai';

import * as commonApi from '../../../api/v3/common';

export async function receivePendingRequestStatusTest({
  createRequestParams,
  requestId,
  lastStatusUpdateBlockHeight,
  requestStatusPendingPromise,
  serviceList,
}) {
  const requestStatus = await requestStatusPendingPromise.promise;
  expect(requestStatus).to.deep.include({
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
  requestStatusConfirmedPromise,
  requestId,
  createRequestParams,
  answeredIdpCount,
  serviceList,
  responseValidList,
  lastStatusUpdateBlockHeight,
  testForEqualLastStatusUpdateBlockHeight,
}) {
  const requestStatus = await requestStatusConfirmedPromise.promise;
  expect(requestStatus).to.deep.include({
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

export async function receiveCompletedRequestStatusTest({
  requestStatusCompletedPromise,
  requestId,
  createRequestParams,
  serviceList,
  responseValidList,
  lastStatusUpdateBlockHeight,
  testForEqualLastStatusUpdateBlockHeight,
}) {
  const requestStatus = await requestStatusCompletedPromise.promise;
  expect(requestStatus).to.deep.include({
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

export async function receiveRequestClosedStatusTest({
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
    request_id: requestId,
    status: 'completed',
    mode: createRequestParams.mode,
    min_idp: createRequestParams.min_idp,
    answered_idp_count: 1,
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
