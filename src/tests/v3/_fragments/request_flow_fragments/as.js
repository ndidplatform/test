import { expect } from 'chai';

import * as asApi from '../../../../api/v3/as';

export async function asReceiveDataRequestTest({
  dataRequestReceivedPromise,
  requestId,
  createRequestParams,
}) {
  const dataRequest = await dataRequestReceivedPromise.promise;
  expect(dataRequest).to.deep.include({
    request_id: requestId,
    mode: createRequestParams.mode,
    namespace: createRequestParams.namespace,
    identifier: createRequestParams.identifier,
    service_id: createRequestParams.data_request_list[0].service_id,
    request_params: createRequestParams.data_request_list[0].request_params,
    max_ial: 2.3,
    max_aal: 3,
    requester_node_id: 'rp1',
    request_timeout: createRequestParams.request_timeout,
  });
  expect(dataRequest.response_signature_list).to.have.lengthOf(1);
  expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is.not
    .empty;
  expect(dataRequest.creation_time).to.be.a('number');
  expect(dataRequest.creation_block_height).to.be.a('string');
  const splittedCreationBlockHeight = dataRequest.creation_block_height.split(
    ':'
  );
  expect(splittedCreationBlockHeight).to.have.lengthOf(2);
  expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
  expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
}

export async function asSendDataTest({
  callApiAtNodeId,
  requestId,
  createRequestParams,
  asReferenceId,
  callbackUrl,
  data,
  sendDataResultPromise,
}) {
  const response = await asApi.sendData(callApiAtNodeId, {
    requestId,
    serviceId: createRequestParams.data_request_list[0].service_id,
    reference_id: asReferenceId,
    callback_url: callbackUrl,
    data,
  });
  expect(response.status).to.equal(202);

  const sendDataResult = await sendDataResultPromise.promise;
  expect(sendDataResult).to.deep.include({
    reference_id: asReferenceId,
    success: true,
  });
}