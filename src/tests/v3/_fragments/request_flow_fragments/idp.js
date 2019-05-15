import { expect } from 'chai';

import * as idpApi from '../../../../api/v3/idp';

import { hash } from '../../../../utils';

export async function idpReceiveIncomingRequestCallbackTest({
  createRequestParams,
  requestId,
  incomingRequestPromise,
  requesterNodeId,
}) {
  const incomingRequest = await incomingRequestPromise.promise;
  expect(incomingRequest).to.deep.include({
    mode: createRequestParams.mode,
    request_id: requestId,
    namespace: createRequestParams.namespace,
    identifier: createRequestParams.identifier,
    request_message: createRequestParams.request_message,
    request_message_hash: hash(
      createRequestParams.request_message + incomingRequest.request_message_salt
    ),
    requester_node_id: requesterNodeId,
    min_ial: createRequestParams.min_ial,
    min_aal: createRequestParams.min_aal,
    data_request_list: createRequestParams.data_request_list.map(
      (dataRequest) => {
        const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
        return {
          ...dataRequestWithoutParams,
        };
      }
    ),
    request_timeout: createRequestParams.request_timeout,
  });
  expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
    .empty;
  expect(incomingRequest.creation_time).to.be.a('number');
  expect(incomingRequest.creation_block_height).to.be.a('string');
  const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
    ':'
  );
  expect(splittedCreationBlockHeight).to.have.lengthOf(2);
  expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
  expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);

  const requestMessageSalt = incomingRequest.request_message_salt;
  const requestMessageHash = incomingRequest.request_message_hash;
  return {
    requestMessageSalt,
    requestMessageHash,
  };
}

export async function idpCreateResponseTest({
  callApiAtNodeId,
  idpNodeId,
  createRequestParams,
  callbackUrl,
  ial,
  aal,
  status,
  requestId,
  idpReferenceId,
  responseResultPromise,
}) {
  const response = await idpApi.createResponse(callApiAtNodeId, {
    node_id: idpNodeId,
    reference_id: idpReferenceId,
    callback_url: callbackUrl,
    request_id: requestId,
    namespace: createRequestParams.namespace,
    identifier: createRequestParams.identifier,
    ial,
    aal,
    status,
    //signature: createResponseSignature(userPrivateKey, requestMessageHash),
  });
  expect(response.status).to.equal(202);

  const responseResult = await responseResultPromise.promise;
  expect(responseResult).to.deep.include({
    reference_id: idpReferenceId,
    request_id: requestId,
    success: true,
  });
}
