import { expect } from 'chai';

import * as rpApi from '../../../../api/v3/rp';

export async function rpCreateRequestTest({
  callApiAtNodeId,
  createRequestParams,
  createRequestResultPromise,
}) {
  const response = await rpApi.createRequest(
    callApiAtNodeId,
    createRequestParams
  );
  const responseBody = await response.json();
  expect(response.status).to.equal(202);
  expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
  expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

  const requestId = responseBody.request_id;

  const createRequestResult = await createRequestResultPromise.promise;
  expect(createRequestResult.success).to.equal(true);
  expect(createRequestResult.creation_block_height).to.be.a('string');
  const splittedCreationBlockHeight = createRequestResult.creation_block_height.split(
    ':'
  );
  expect(splittedCreationBlockHeight).to.have.lengthOf(2);
  expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
  expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  const lastStatusUpdateBlockHeight = parseInt(splittedCreationBlockHeight[1]);

  return {
    requestId,
    lastStatusUpdateBlockHeight,
  };
}

export async function rpReceivePendingRequestStatusTest({
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

export async function rpReceiveConfirmedRequestStatusTest({
  requestStatusConfirmedPromise,
  requestId,
  createRequestParams,
  serviceList,
  responseValidList,
  lastStatusUpdateBlockHeight,
}) {
  const requestStatus = await requestStatusConfirmedPromise.promise;
  expect(requestStatus).to.deep.include({
    request_id: requestId,
    status: 'confirmed',
    mode: createRequestParams.mode,
    min_idp: createRequestParams.min_idp,
    answered_idp_count: 1,
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
  expect(parseInt(splittedBlockHeight[1])).to.be.above(
    lastStatusUpdateBlockHeight
  );
  return {
    lastStatusUpdateBlockHeight: parseInt(splittedBlockHeight[1]),
  };
}

export async function rpReceiveCompletedRequestStatusTest({
  requestStatusCompletedPromise,
  requestId,
  createRequestParams,
  serviceList,
  responseValidList,
  lastStatusUpdateBlockHeight,
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
  expect(parseInt(splittedBlockHeight[1])).to.be.above(
    lastStatusUpdateBlockHeight
  );
  return {
    lastStatusUpdateBlockHeight: parseInt(splittedBlockHeight[1]),
  };
}

export async function rpReceiveRequestClosedStatusTest({
  requestClosedPromise,
  requestId,
  createRequestParams,
  serviceList,
  responseValidList,
  lastStatusUpdateBlockHeight,
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
  expect(parseInt(splittedBlockHeight[1])).to.be.above(
    lastStatusUpdateBlockHeight
  );
}

export async function rpGotDataFromAsTest({
  callApiAtNodeId,
  createRequestParams,
  requestId,
  data,
}) {
  const response = await rpApi.getDataFromAS(callApiAtNodeId, {
    requestId,
  });
  const dataArr = await response.json();
  expect(response.status).to.equal(200);

  expect(dataArr).to.have.lengthOf(1);
  expect(dataArr[0]).to.deep.include({
    source_node_id: 'as1',
    service_id: createRequestParams.data_request_list[0].service_id,
    signature_sign_method: 'RSA-SHA256',
    data,
  });
  expect(dataArr[0].source_signature).to.be.a('string').that.is.not.empty;
  expect(dataArr[0].data_salt).to.be.a('string').that.is.not.empty;
}

export async function removeAsDataTest({ callApiAtNodeId, requestId }) {
  const response = await rpApi.removeDataRequestedFromAS(callApiAtNodeId, {
    request_id: requestId,
  });
  expect(response.status).to.equal(204);
}

export async function rpHasNoDataFromAsTest({ callApiAtNodeId, requestId }) {
  const response = await rpApi.getDataFromAS(callApiAtNodeId, {
    requestId,
  });
  const responseBody = await response.json();
  expect(response.status).to.equal(200);
  expect(responseBody).to.be.an('array').that.is.empty;
}
