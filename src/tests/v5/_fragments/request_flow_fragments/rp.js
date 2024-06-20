import { expect } from 'chai';

import * as rpApi from '../../../../api/v5/rp';
import * as commonApi from '../../../../api/v5/common';
import * as commonApiV6 from '../../../../api/v6/common';
import * as apiHelpers from '../../../../api/helpers';
import * as util from '../../../../utils';

export async function rpCreateRequestTest({
  callApiAtNodeId,
  createRequestParams,
  setRequestId,
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
  const initial_salt = responseBody.initial_salt;

  setRequestId(requestId);

  const createRequestResult = await createRequestResultPromise.promise;
  expect(createRequestResult.success).to.equal(true);
  expect(createRequestResult.creation_block_height).to.be.a('string');
  const splittedCreationBlockHeight =
    createRequestResult.creation_block_height.split(':');
  expect(splittedCreationBlockHeight).to.have.lengthOf(2);
  expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
  expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  const lastStatusUpdateBlockHeight = parseInt(splittedCreationBlockHeight[1]);

  return {
    requestId,
    lastStatusUpdateBlockHeight,
    initial_salt,
  };
}

export async function verifyRequestParamsHash({
  callApiAtNodeId,
  createRequestParams,
  requestId,
  initialSalt,
}) {
  const response = await commonApi.getRequest(callApiAtNodeId, { requestId });
  const requestDetail = await response.json();
  createRequestParams.data_request_list.forEach((dataRequestList) => {
    const serviceId = dataRequestList.service_id;
    const requestParamsSalt = util.generateRequestParamSalt({
      requestId,
      serviceId,
      initialSalt,
    });
    const requestParams = dataRequestList.request_params
      ? dataRequestList.request_params
      : '';

    const requestParamsHash = util.hash(requestParams + requestParamsSalt);
    const requestParamsHashFromRequestDetail =
      requestDetail.data_request_list.find(
        (request) => request.service_id === serviceId
      );

    expect(requestParamsHashFromRequestDetail.request_params_hash).to.equal(
      requestParamsHash
    );
  });
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

  let dataArrLength = 0;
  await Promise.all(
    createRequestParams.data_request_list.map(async (dataRequestList) => {
      if (
        dataRequestList.min_as === 0 &&
        dataRequestList.as_id_list.length === 0
      ) {
        const response = await commonApi.getASByServiceId(
          callApiAtNodeId,
          dataRequestList.service_id
        );
        const asListByServiceId = await response.json();

        dataArrLength += asListByServiceId.length;
      } else {
        dataArrLength +=
          dataRequestList.min_as > 0
            ? dataRequestList.min_as
            : dataRequestList.as_id_list.length;
      }
    })
  );

  expect(dataArray).to.have.lengthOf(dataArrLength);

  const asResponseDataWithNodeInfoArr = await Promise.all(
    asResponseDataArr.map(async (responseData) => {
      const response = await apiHelpers.getResponseAndBody(
        commonApiV6.getNodeInfo(callApiAtNodeId, {
          node_id: responseData.sourceNodeId,
        })
      );
      const nodeInfo = response.responseBody;

      return {
        ...responseData,
        nodeInfo,
      };
    })
  );

  dataArray.forEach((dataArr) => {
    let asResponseData = asResponseDataWithNodeInfoArr.find(
      (asResponseData) =>
        asResponseData.sourceNodeId === dataArr.source_node_id &&
        asResponseData.serviceId === dataArr.service_id
    );

    expect(dataArr).to.deep.include({
      source_node_id: asResponseData.sourceNodeId,
      service_id: asResponseData.serviceId,
      signature_sign_method:
        asResponseData.nodeInfo.signing_public_key.algorithm,
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
