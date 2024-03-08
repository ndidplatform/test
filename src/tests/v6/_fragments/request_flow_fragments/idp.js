import { expect } from 'chai';
import * as idpApi from '../../../../api/v6/idp';
import * as commonApi from '../../../../api/v6/common';
import {
  hash,
  hashRequestMessageForConsent,
  createResponseSignature,
} from '../../../../utils';

export async function idpReceiveMode1IncomingRequestCallbackTest({
  nodeId,
  createRequestParams,
  requestId,
  incomingRequestPromise,
  requesterNodeId,
  initialSalt,
}) {
  const incomingRequest = await incomingRequestPromise.promise;
  let dataRequestListArray = [];
  if (createRequestParams.data_request_list) {
    createRequestParams.data_request_list.forEach((dataRequestList, index) => {
      if (
        !dataRequestList.as_id_list ||
        dataRequestList.as_id_list.length === 0
      ) {
        let { request_params, ...dataRequestWithoutParams } = dataRequestList;
        expect(incomingRequest.data_request_list[index].as_id_list).to.be.an(
          'array'
        ).that.is.not.empty;

        expect(incomingRequest.data_request_list[index].service_id).to.equal(
          dataRequestList.service_id
        );
        expect(incomingRequest.data_request_list[index].min_as).to.equal(
          dataRequestList.min_as
        );
        dataRequestWithoutParams = {
          ...dataRequestWithoutParams,
          as_id_list: incomingRequest.data_request_list[index].as_id_list,
        };
        dataRequestListArray.push(dataRequestWithoutParams);
      } else if (dataRequestList.as_id_list.length > 0) {
        const { request_params, ...dataRequestWithoutParams } = dataRequestList;
        expect(incomingRequest.data_request_list[index]).to.deep.equal(
          dataRequestWithoutParams
        );
        dataRequestListArray.push(dataRequestWithoutParams);
      }
    });
  }

  expect(incomingRequest).to.deep.include({
    node_id: nodeId,
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
    data_request_list: dataRequestListArray,
    // data_request_list: createRequestParams.data_request_list
    //   ? createRequestParams.data_request_list.map(dataRequest => {
    //       const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
    //       return {
    //         ...dataRequestWithoutParams,
    //       };
    //     })
    //   : [],
    request_type: createRequestParams.request_type
      ? createRequestParams.request_type
      : null,
    request_timeout: createRequestParams.request_timeout,
  });
  expect(incomingRequest.initial_salt).to.equal(initialSalt);
  expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
    .empty;
  expect(incomingRequest.creation_time).to.be.a('number');
  expect(incomingRequest.creation_block_height).to.be.a('string');
  const splittedCreationBlockHeight =
    incomingRequest.creation_block_height.split(':');
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

export async function idpReceiveMode2And3IncomingRequestCallbackTest({
  createRequestParams,
  requestId,
  incomingRequestPromise,
  requesterNodeId,
  initialSalt,
}) {
  const incomingRequest = await incomingRequestPromise.promise;
  let dataRequestListArray = [];
  if (createRequestParams.data_request_list) {
    createRequestParams.data_request_list.forEach((dataRequestList, index) => {
      if (
        !dataRequestList.as_id_list ||
        dataRequestList.as_id_list.length === 0
      ) {
        let { request_params, ...dataRequestWithoutParams } = dataRequestList;
        expect(incomingRequest.data_request_list[index].as_id_list).to.be.an(
          'array'
        ).that.is.not.empty;

        expect(incomingRequest.data_request_list[index].service_id).to.equal(
          dataRequestList.service_id
        );
        expect(incomingRequest.data_request_list[index].min_as).to.equal(
          dataRequestList.min_as
        );
        dataRequestWithoutParams = {
          ...dataRequestWithoutParams,
          as_id_list: incomingRequest.data_request_list[index].as_id_list,
        };
        dataRequestListArray.push(dataRequestWithoutParams);
      } else if (dataRequestList.as_id_list.length > 0) {
        const { request_params, ...dataRequestWithoutParams } = dataRequestList;
        expect(incomingRequest.data_request_list[index]).to.deep.equal(
          dataRequestWithoutParams
        );
        dataRequestListArray.push(dataRequestWithoutParams);
      }
    });
  }

  expect(incomingRequest).to.deep.include({
    mode: createRequestParams.mode,
    request_id: requestId,
    request_message: createRequestParams.request_message,
    request_message_hash: hash(
      createRequestParams.request_message + incomingRequest.request_message_salt
    ),
    requester_node_id: requesterNodeId,
    min_ial: createRequestParams.min_ial,
    min_aal: createRequestParams.min_aal,
    data_request_list: dataRequestListArray,
    // data_request_list: createRequestParams.data_request_list
    //   ? createRequestParams.data_request_list.map(dataRequest => {
    //       const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
    //       return {
    //         ...dataRequestWithoutParams,
    //       };
    //     })
    //   : [],
    request_type: createRequestParams.request_type
      ? createRequestParams.request_type
      : null,
    request_timeout: createRequestParams.request_timeout,
  });
  expect(incomingRequest.initial_salt).to.equal(initialSalt);
  expect(incomingRequest.reference_group_code).to.be.a('string').that.is.not
    .empty;
  expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
    .empty;
  expect(incomingRequest.creation_time).to.be.a('number');
  expect(incomingRequest.creation_block_height).to.be.a('string');
  const splittedCreationBlockHeight =
    incomingRequest.creation_block_height.split(':');
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
  idpResponseParams,
}) {
  const response = await idpApi.createResponse(
    callApiAtNodeId,
    idpResponseParams
  );
  expect(response.status).to.equal(202);
}

export async function idpReceiveCreateResponseResultCallbackTest({
  nodeId,
  requestId,
  idpReferenceId,
  responseResultPromise,
}) {
  const responseResult = await responseResultPromise.promise;
  expect(responseResult).to.deep.include({
    node_id: nodeId,
    reference_id: idpReferenceId,
    request_id: requestId,
    success: true,
  });
}

export async function idpReceiveAccessorEncryptCallbackTest({
  callIdpApiAtNodeId,
  idpNodeId,
  accessorEncryptPromise,
  accessorId,
  requestId,
  idpReferenceId,
  incomingRequestPromise,
  accessorPublicKey,
}) {
  if (!callIdpApiAtNodeId.includes('proxy')) {
    idpNodeId = callIdpApiAtNodeId;
  }

  const accessorEncryptParams = await accessorEncryptPromise.promise;
  expect(accessorEncryptParams).to.deep.include({
    node_id: idpNodeId,
    type: 'accessor_encrypt',
    accessor_id: accessorId,
    key_type: 'RSA',
    padding: 'none',
    reference_id: idpReferenceId,
    request_id: requestId,
  });

  const verifyRequestMessagePaddedHash = await createRequestMessagePaddedHash({
    requestId,
    incomingRequestPromise,
    accessorPublicKey,
  });

  expect(accessorEncryptParams.request_message_padded_hash).to.be.a('string')
    .that.is.not.empty;

  expect(accessorEncryptParams.request_message_padded_hash).to.equal(
    verifyRequestMessagePaddedHash
  );

  return {
    verifyRequestMessagePaddedHash,
  };
}

export async function verifyResponseSignature({
  callApiAtNodeId,
  requestId,
  idpNodeId,
  requestMessagePaddedHash,
  accessorPrivateKey,
}) {
  if (!idpNodeId) {
    idpNodeId = callApiAtNodeId;
  }

  let responseRequestDetail = await commonApi.getRequest(callApiAtNodeId, {
    requestId,
  });

  let responseBodyRequestDetail = await responseRequestDetail.json();
  const signatureFromBlockchain = responseBodyRequestDetail.response_list.find(
    (responseList) => responseList.idp_id === idpNodeId
  ).signature;

  let signature = createResponseSignature(
    accessorPrivateKey,
    requestMessagePaddedHash
  );

  expect(signature).to.equal(signatureFromBlockchain);
}

export async function getAndVerifyRequestMessagePaddedHashTest({
  callApiAtNodeId,
  idpNodeId,
  requestId,
  incomingRequestPromise,
  accessorPublicKey,
  accessorId,
}) {
  let queryParams = {
    request_id: requestId,
    accessor_id: accessorId,
  };

  if (callApiAtNodeId !== idpNodeId) {
    queryParams = {
      ...queryParams,
      node_id: idpNodeId,
    };
  }

  const response = await idpApi.getRequestMessagePaddedHash(
    callApiAtNodeId,
    queryParams
  );
  const responseBody = await response.json();
  expect(responseBody.request_message_padded_hash).to.be.a('string').that.is.not
    .empty;

  const verifyRequestMessagePaddedHash = await createRequestMessagePaddedHash({
    requestId,
    incomingRequestPromise,
    accessorPublicKey,
  });

  expect(responseBody.request_message_padded_hash).to.equal(
    verifyRequestMessagePaddedHash
  );

  return {
    verifyRequestMessagePaddedHash,
  };
}

export async function createRequestMessagePaddedHash({
  requestId,
  incomingRequestPromise,
  accessorPublicKey,
}) {
  let incomingRequest = await incomingRequestPromise.promise;
  let initialSalt = incomingRequest.initial_salt;
  let requestMessage = incomingRequest.request_message;

  let verifyRequestMessagePaddedHash = hashRequestMessageForConsent(
    requestMessage,
    initialSalt,
    requestId,
    accessorPublicKey
  );

  return verifyRequestMessagePaddedHash;
}
