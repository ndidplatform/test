import { expect } from 'chai';

import * as commonApi from '../../../api/v3/common';

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
