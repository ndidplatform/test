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

export async function rpGotDataFromAsTest({
  callApiAtNodeId,
  createRequestParams,
  requestId,
  asResponseDataArr,
}) {
  const response = await rpApi.getDataFromAS(callApiAtNodeId, {
    requestId,
  });
  const dataArray = await response.json();
  expect(response.status).to.equal(200);

  let dataArrLength = createRequestParams.data_request_list.reduce(
    (sum, dataRequestList) => {
      return sum + dataRequestList.min_as;
    },
    0
  );

  expect(dataArray).to.have.lengthOf(dataArrLength);

  dataArray.forEach(dataArr => {
    let asResponseData = asResponseDataArr.find(
      asResponseData =>
        asResponseData.sourceNodeId === dataArr.source_node_id &&
        asResponseData.serviceId === dataArr.service_id
    );

    expect(dataArr).to.deep.include({
      source_node_id: asResponseData.sourceNodeId,
      service_id: asResponseData.serviceId,
      signature_sign_method: 'RSA-SHA256',
      data: asResponseData.data,
    });
    expect(dataArr.source_signature).to.be.a('string').that.is.not.empty;
    expect(dataArr.data_salt).to.be.a('string').that.is.not.empty;
  });
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
