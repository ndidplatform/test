import { expect } from 'chai';

import * as commonApi from '../../../api/v6/common';
export async function receivePendingRequestStatusTest({
  nodeId,
  createRequestParams,
  requestId,
  idpIdList,
  idpResponse,
  dataRequestList,
  requestMessageHash,
  lastStatusUpdateBlockHeight,
  requestStatusPendingPromise,
  requesterNodeId,
  testForAboveLastStatusUpdateBlockHeight,
  isNotRp,
}) {
  let response_list = [];
  if (idpResponse) {
    response_list = idpResponse.map((idpResponse) => {
      const {
        reference_id,
        callback_url,
        request_id,
        accessor_id,
        node_id,
        ...rest
      } = idpResponse;

      if (isNotRp || createRequestParams.mode === 1) {
        rest.valid_signature = null;
        rest.valid_ial = null;
      }
      return rest;
    });
  }

  const requestStatus = await requestStatusPendingPromise.promise;
  expect(requestStatus).to.deep.include({
    node_id: nodeId,
    type: 'request_status',
    request_id: requestId,
    min_idp: createRequestParams.min_idp,
    min_aal: createRequestParams.min_aal,
    min_ial: createRequestParams.min_ial,
    request_timeout: createRequestParams.request_timeout,
    idp_id_list: idpIdList,
    data_request_list: dataRequestList,
    request_message_hash: requestMessageHash,
    response_list,
    closed: false,
    timed_out: false,
    mode: createRequestParams.mode,
    request_type: createRequestParams.request_type
      ? createRequestParams.request_type
      : null,
    status: 'pending',
    requester_node_id: requesterNodeId,
  });
  expect(requestStatus).to.have.property('block_height');
  expect(requestStatus.block_height).is.a('string');
  const splittedBlockHeight = requestStatus.block_height.split(':');
  expect(splittedBlockHeight).to.have.lengthOf(2);
  expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
  expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
  if (testForAboveLastStatusUpdateBlockHeight) {
    expect(parseInt(splittedBlockHeight[1])).to.be.above(
      lastStatusUpdateBlockHeight
    );
  } else {
    expect(parseInt(splittedBlockHeight[1])).to.equal(
      lastStatusUpdateBlockHeight
    );
  }
}

export async function receiveConfirmedRequestStatusTest({
  nodeId,
  requestStatusConfirmedPromise,
  requestId,
  createRequestParams,
  dataRequestList,
  idpResponse,
  requestMessageHash,
  idpIdList,
  lastStatusUpdateBlockHeight,
  testForEqualLastStatusUpdateBlockHeight,
  requestStatusPromise,
  requesterNodeId,
  isNotRp,
}) {
  if (requestStatusPromise && !requestStatusConfirmedPromise) {
    requestStatusConfirmedPromise = requestStatusPromise;
  }

  let response_list = idpResponse.map((idpResponse) => {
    const {
      reference_id,
      callback_url,
      request_id,
      accessor_id,
      node_id,
      ...rest
    } = idpResponse;

    if (isNotRp || createRequestParams.mode === 1) {
      rest.valid_signature = null;
      rest.valid_ial = null;
    }
    return rest;
  });

  const requestStatus = await requestStatusConfirmedPromise.promise;
  expect(requestStatus).to.deep.include({
    node_id: nodeId,
    type: 'request_status',
    request_id: requestId,
    min_idp: createRequestParams.min_idp,
    min_aal: createRequestParams.min_aal,
    min_ial: createRequestParams.min_ial,
    request_timeout: createRequestParams.request_timeout,
    idp_id_list: idpIdList,
    data_request_list: dataRequestList,
    request_message_hash: requestMessageHash,
    response_list,
    closed: false,
    timed_out: false,
    mode: createRequestParams.mode,
    request_type: createRequestParams.request_type
      ? createRequestParams.request_type
      : null,
    status: 'confirmed',
    requester_node_id: requesterNodeId,
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
  dataRequestList,
  idpResponse,
  requestMessageHash,
  idpIdList,
  lastStatusUpdateBlockHeight,
  testForEqualLastStatusUpdateBlockHeight,
  requestStatusPromise,
  requesterNodeId,
  isNotRp,
}) {
  if (requestStatusPromise && !requestStatusRejectPromise) {
    requestStatusRejectPromise = requestStatusPromise;
  }

  let response_list = idpResponse.map((idpResponse) => {
    const {
      reference_id,
      callback_url,
      request_id,
      accessor_id,
      node_id,
      ...rest
    } = idpResponse;

    if (isNotRp || createRequestParams.mode === 1) {
      rest.valid_signature = null;
      rest.valid_ial = null;
    }
    return rest;
  });

  const requestStatus = await requestStatusRejectPromise.promise;
  expect(requestStatus).to.deep.include({
    node_id: nodeId,
    type: 'request_status',
    request_id: requestId,
    min_idp: createRequestParams.min_idp,
    min_aal: createRequestParams.min_aal,
    min_ial: createRequestParams.min_ial,
    request_timeout: createRequestParams.request_timeout,
    idp_id_list: idpIdList,
    data_request_list: dataRequestList,
    request_message_hash: requestMessageHash,
    response_list,
    closed: false,
    timed_out: false,
    mode: createRequestParams.mode,
    request_type: createRequestParams.request_type
      ? createRequestParams.request_type
      : null,
    status: 'rejected',
    requester_node_id: requesterNodeId,
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

export async function receiveErroredRequestStatusTest({
  nodeId,
  requestStatusErroredPromise,
  requestId,
  createRequestParams,
  dataRequestList,
  idpResponse,
  requestMessageHash,
  idpIdList,
  lastStatusUpdateBlockHeight,
  testForEqualLastStatusUpdateBlockHeight,
  requestStatusPromise,
  requesterNodeId,
  isNotRp,
}) {
  if (requestStatusPromise && !requestStatusErroredPromise) {
    requestStatusErroredPromise = requestStatusPromise;
  }

  let response_list = idpResponse.map((idpResponse) => {
    const {
      reference_id,
      callback_url,
      request_id,
      accessor_id,
      node_id,
      ...rest
    } = idpResponse;

    if (isNotRp || createRequestParams.mode === 1) {
      rest.valid_signature = null;
      rest.valid_ial = null;
    }
    return rest;
  });

  const requestStatus = await requestStatusErroredPromise.promise;
  expect(requestStatus).to.deep.include({
    node_id: nodeId,
    type: 'request_status',
    request_id: requestId,
    min_idp: createRequestParams.min_idp,
    min_aal: createRequestParams.min_aal,
    min_ial: createRequestParams.min_ial,
    request_timeout: createRequestParams.request_timeout,
    idp_id_list: idpIdList,
    data_request_list: dataRequestList,
    request_message_hash: requestMessageHash,
    response_list,
    closed: false,
    timed_out: false,
    mode: createRequestParams.mode,
    request_type: createRequestParams.request_type
      ? createRequestParams.request_type
      : null,
    status: 'errored',
    requester_node_id: requesterNodeId,
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
  dataRequestList,
  idpResponse,
  requestMessageHash,
  idpIdList,
  lastStatusUpdateBlockHeight,
  testForEqualLastStatusUpdateBlockHeight,
  requestStatusPromise,
  requesterNodeId,
  isNotRp,
}) {
  if (requestStatusPromise && !requestStatusCompletedPromise) {
    requestStatusCompletedPromise = requestStatusPromise;
  }

  let response_list = idpResponse.map((idpResponse) => {
    const {
      reference_id,
      callback_url,
      request_id,
      accessor_id,
      node_id,
      ...rest
    } = idpResponse;

    if (isNotRp || createRequestParams.mode === 1) {
      rest.valid_signature = null;
      rest.valid_ial = null;
    }
    return rest;
  });

  const requestStatus = await requestStatusCompletedPromise.promise;
  expect(requestStatus).to.deep.include({
    node_id: nodeId,
    type: 'request_status',
    request_id: requestId,
    min_idp: createRequestParams.min_idp,
    min_aal: createRequestParams.min_aal,
    min_ial: createRequestParams.min_ial,
    request_timeout: createRequestParams.request_timeout,
    idp_id_list: idpIdList,
    data_request_list: dataRequestList,
    request_message_hash: requestMessageHash,
    response_list,
    closed: false,
    timed_out: false,
    mode: createRequestParams.mode,
    request_type: createRequestParams.request_type
      ? createRequestParams.request_type
      : null,
    status: 'completed',
    requester_node_id: requesterNodeId,
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
  dataRequestList,
  idpResponse,
  requestMessageHash,
  idpIdList,
  lastStatusUpdateBlockHeight,
  testForEqualLastStatusUpdateBlockHeight,
  requestStatusPromise,
  requesterNodeId,
  isNotRp,
}) {
  if (requestStatusPromise && !requestStatusComplicatedPromise) {
    requestStatusComplicatedPromise = requestStatusPromise;
  }

  let response_list = idpResponse.map((idpResponse) => {
    const {
      reference_id,
      callback_url,
      request_id,
      accessor_id,
      node_id,
      ...rest
    } = idpResponse;

    if (isNotRp || createRequestParams.mode === 1) {
      rest.valid_signature = null;
      rest.valid_ial = null;
    }
    return rest;
  });

  const requestStatus = await requestStatusComplicatedPromise.promise;
  expect(requestStatus).to.deep.include({
    node_id: nodeId,
    type: 'request_status',
    request_id: requestId,
    min_idp: createRequestParams.min_idp,
    min_aal: createRequestParams.min_aal,
    min_ial: createRequestParams.min_ial,
    request_timeout: createRequestParams.request_timeout,
    idp_id_list: idpIdList,
    data_request_list: dataRequestList,
    request_message_hash: requestMessageHash,
    response_list,
    closed: false,
    timed_out: false,
    mode: createRequestParams.mode,
    request_type: createRequestParams.request_type
      ? createRequestParams.request_type
      : null,
    status: 'complicated',
    requester_node_id: requesterNodeId,
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

export async function receivePartialCompletedRequestStatusTest({
  nodeId,
  requestStatusPartialCompletedPromise,
  requestId,
  createRequestParams,
  dataRequestList,
  idpResponse,
  requestMessageHash,
  idpIdList,
  lastStatusUpdateBlockHeight,
  testForEqualLastStatusUpdateBlockHeight,
  requestStatusPromise,
  requesterNodeId,
  isNotRp,
}) {
  if (requestStatusPromise && !requestStatusPartialCompletedPromise) {
    requestStatusPartialCompletedPromise = requestStatusPromise;
  }

  let response_list = idpResponse.map((idpResponse) => {
    const {
      reference_id,
      callback_url,
      request_id,
      accessor_id,
      node_id,
      ...rest
    } = idpResponse;

    if (isNotRp || createRequestParams.mode === 1) {
      rest.valid_signature = null;
      rest.valid_ial = null;
    }
    return rest;
  });

  const requestStatus = await requestStatusPartialCompletedPromise.promise;
  expect(requestStatus).to.deep.include({
    node_id: nodeId,
    type: 'request_status',
    request_id: requestId,
    min_idp: createRequestParams.min_idp,
    min_aal: createRequestParams.min_aal,
    min_ial: createRequestParams.min_ial,
    request_timeout: createRequestParams.request_timeout,
    idp_id_list: idpIdList,
    data_request_list: dataRequestList,
    request_message_hash: requestMessageHash,
    response_list,
    closed: false,
    timed_out: false,
    mode: createRequestParams.mode,
    request_type: createRequestParams.request_type
      ? createRequestParams.request_type
      : null,
    status: 'partial_completed',
    requester_node_id: requesterNodeId,
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
  dataRequestList,
  idpResponse,
  requestMessageHash,
  idpIdList,
  status,
  lastStatusUpdateBlockHeight,
  testForEqualLastStatusUpdateBlockHeight,
  requesterNodeId,
}) {
  let response_list = idpResponse.map((idpResponse) => {
    const {
      reference_id,
      callback_url,
      request_id,
      accessor_id,
      node_id,
      ...rest
    } = idpResponse;

    if (createRequestParams.mode === 1) {
      rest.valid_signature = null;
      rest.valid_ial = null;
    }
    return rest;
  });

  const requestStatus = await requestClosedPromise.promise;
  expect(requestStatus).to.deep.include({
    node_id: nodeId,
    type: 'request_status',
    request_id: requestId,
    min_idp: createRequestParams.min_idp,
    min_aal: createRequestParams.min_aal,
    min_ial: createRequestParams.min_ial,
    request_timeout: createRequestParams.request_timeout,
    idp_id_list: idpIdList,
    data_request_list: dataRequestList,
    request_message_hash: requestMessageHash,
    response_list,
    closed: true,
    timed_out: false,
    mode: createRequestParams.mode,
    request_type: createRequestParams.request_type
      ? createRequestParams.request_type
      : null,
    status: status ? status : 'completed',
    requester_node_id: requesterNodeId,
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

export async function receiveRequestTimedoutStatusTest({
  nodeId,
  requestStatusPromise,
  requestId,
  createRequestParams,
  dataRequestList,
  idpResponse,
  requestMessageHash,
  idpIdList,
  status,
  lastStatusUpdateBlockHeight,
  testForEqualLastStatusUpdateBlockHeight,
  requesterNodeId,
}) {
  let response_list = idpResponse.map((idpResponse) => {
    const {
      reference_id,
      callback_url,
      request_id,
      accessor_id,
      node_id,
      ...rest
    } = idpResponse;

    if (createRequestParams.mode === 1) {
      rest.valid_signature = null;
      rest.valid_ial = null;
    }
    return rest;
  });

  const requestStatus = await requestStatusPromise.promise;
  expect(requestStatus).to.deep.include({
    node_id: nodeId,
    type: 'request_status',
    request_id: requestId,
    min_idp: createRequestParams.min_idp,
    min_aal: createRequestParams.min_aal,
    min_ial: createRequestParams.min_ial,
    request_timeout: createRequestParams.request_timeout,
    idp_id_list: idpIdList,
    data_request_list: dataRequestList,
    request_message_hash: requestMessageHash,
    response_list,
    closed: false,
    timed_out: true,
    mode: createRequestParams.mode,
    request_type: createRequestParams.request_type
      ? createRequestParams.request_type
      : null,
    status,
    requester_node_id: requesterNodeId,
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
