import { expect } from 'chai';

import * as rpApi from '../../../api/v5/rp';
import * as idpApi from '../../../api/v5/idp';
import * as asApi from '../../../api/v5/as';
import {
  rpEventEmitter,
  idp1EventEmitter,
  as1EventEmitter,
  as2EventEmitter,
} from '../../../callback_server';
import * as db from '../../../db';
import {
  createEventPromise,
  generateReferenceId,
  createResponseSignature,
  wait,
} from '../../../utils';
import {
  createIdpIdList,
  createDataRequestList,
  createRequestMessageHash,
  setDataReceived,
  setDataSigned,
} from '../_fragments/fragments_utils';
import {
  receiveCompletedRequestStatusTest,
} from '../_fragments/common';
import * as config from '../../../config';
import { as2Available } from '../..';

describe('AS response data request already closed test', function () {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const rpCloseRequestReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const asReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise(); // RP
  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise(); // IDP
  const dataRequestReceivedPromise = createEventPromise(); // AS
  const closeRequestResultPromise = createEventPromise(); // RP

  let createRequestParams;
  const data = JSON.stringify({
    test: 'test',
    withEscapedChar: 'test|fff||ss\\|NN\\\\|',
    arr: [1, 2, 3],
  });

  let requestId;

  before(async function () {
    this.timeout(50000);

    let identity = db.idp1Identities.filter(
      (identity) =>
        identity.namespace === 'citizen_id' &&
        identity.mode === 3 &&
        !identity.revokeIdentityAssociation,
    );

    if (identity.length === 0) {
      throw new Error('No created identity to use');
    }

    namespace = identity[0].namespace;
    identifier = identity[0].identifier;

    createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 3,
      namespace,
      identifier,
      idp_id_list: [],
      data_request_list: [
        {
          service_id: 'bank_statement',
          as_id_list: ['as1'],
          min_as: 1,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
      ],
      request_message:
        'Test request message (AS response data already closed test) (mode 3)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
      bypass_identity_check: false,
    };

    rpEventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'create_request_result' &&
        callbackData.reference_id === rpReferenceId
      ) {
        createRequestResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'close_request_result' &&
        callbackData.reference_id === rpCloseRequestReferenceId
      ) {
        closeRequestResultPromise.resolve(callbackData);
      }
    });

    idp1EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId
      ) {
        incomingRequestPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.reference_id === idpReferenceId
      ) {
        responseResultPromise.resolve(callbackData);
      }
    });

    as1EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'data_request' &&
        callbackData.request_id === requestId
      ) {
        dataRequestReceivedPromise.resolve(callbackData);
      }
    });

    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    requestId = responseBody.request_id;
    await createRequestResultPromise.promise;
    await incomingRequestPromise.promise;

    const responseGetRequestMessagePaddedHash = await idpApi.getRequestMessagePaddedHash(
      'idp1',
      {
        request_id: requestId,
        accessor_id: identity[0].accessors[0].accessorId,
      },
    );
    const responseBodyGetRequestMessagePaddedHash = await responseGetRequestMessagePaddedHash.json();

    let accessorPrivateKey = identity[0].accessors[0].accessorPrivateKey;

    const signature = createResponseSignature(
      accessorPrivateKey,
      responseBodyGetRequestMessagePaddedHash.request_message_padded_hash,
    );
    //const identity = db.idp1Identities[0];
    await idpApi.createResponse('idp1', {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      accessor_id: identity[0].accessors[0].accessorId,
      signature,
    });
    await responseResultPromise.promise;
  });

  it('AS should receive data request', async function () {
    this.timeout(15000);
    const dataRequest = await dataRequestReceivedPromise.promise;
    expect(dataRequest).to.deep.include({
      request_id: requestId,
      mode: createRequestParams.mode,
      namespace,
      identifier,
      service_id: createRequestParams.data_request_list[0].service_id,
      request_params: createRequestParams.data_request_list[0].request_params,
      max_ial: 2.3,
      max_aal: 3,
      requester_node_id: 'rp1',
    });
    expect(dataRequest.response_signature_list).to.have.lengthOf(1);
    expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is.not
      .empty;
  });

  it('RP should be able to close request successfully', async function () {
    this.timeout(15000);
    const response = await rpApi.closeRequest('rp1', {
      reference_id: rpCloseRequestReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      request_id: requestId,
    });
    expect(response.status).to.equal(202);

    const closeRequestResult = await closeRequestResultPromise.promise;
    expect(closeRequestResult.success).to.equal(true);

    await wait(3000);
  });

  it('AS should get an error response when send data with request that already closed', async function () {
    this.timeout(15000);
    const response = await asApi.sendData('as1', {
      requestId,
      serviceId: createRequestParams.data_request_list[0].service_id,
      reference_id: asReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      data,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20025);

    // const sendDataResult = await sendDataResultPromise.promise;
    // expect(sendDataResult).to.deep.include({
    //   reference_id: asReferenceId,
    //   request_id: requestId,
    //   success: false,
    //   error: { code: 25002, message: 'Request is already closed' },
    // });
  });
});

describe('AS response data request already timed out test', function () {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const asReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise(); // RP
  const requestTimeoutPromise = createEventPromise(); //RP
  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise(); // IDP
  const dataRequestReceivedPromise = createEventPromise(); // AS

  let createRequestParams;
  const data = JSON.stringify({
    test: 'test',
    withEscapedChar: 'test|fff||ss\\|NN\\\\|',
    arr: [1, 2, 3],
  });

  let requestId;

  before(async function () {
    this.timeout(50000);

    let identity = db.idp1Identities.filter(
      (identity) =>
        identity.namespace === 'citizen_id' &&
        identity.mode === 3 &&
        !identity.revokeIdentityAssociation,
    );

    if (identity.length === 0) {
      throw new Error('No created identity to use');
    }

    namespace = identity[0].namespace;
    identifier = identity[0].identifier;

    createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 3,
      namespace,
      identifier,
      idp_id_list: [],
      data_request_list: [
        {
          service_id: 'bank_statement',
          as_id_list: ['as1'],
          min_as: 1,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
      ],
      request_message:
        'Test request message (AS response data already timed out test) (mode 3)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 7,
      bypass_identity_check: false,
    };

    rpEventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'create_request_result' &&
        callbackData.reference_id === rpReferenceId
      ) {
        createRequestResultPromise.resolve(callbackData);
      }
      if (callbackData.status === 'confirmed') {
        if (callbackData.timed_out) {
          requestTimeoutPromise.resolve(callbackData);
        }
      }
    });

    idp1EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId
      ) {
        incomingRequestPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.reference_id === idpReferenceId
      ) {
        responseResultPromise.resolve(callbackData);
      }
    });

    as1EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'data_request' &&
        callbackData.request_id === requestId
      ) {
        dataRequestReceivedPromise.resolve(callbackData);
      }
    });

    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    requestId = responseBody.request_id;
    await createRequestResultPromise.promise;
    await incomingRequestPromise.promise;

    const responseGetRequestMessagePaddedHash = await idpApi.getRequestMessagePaddedHash(
      'idp1',
      {
        request_id: requestId,
        accessor_id: identity[0].accessors[0].accessorId,
      },
    );
    const responseBodyGetRequestMessagePaddedHash = await responseGetRequestMessagePaddedHash.json();

    let accessorPrivateKey = identity[0].accessors[0].accessorPrivateKey;

    const signature = createResponseSignature(
      accessorPrivateKey,
      responseBodyGetRequestMessagePaddedHash.request_message_padded_hash,
    );

    //const identity = db.idp1Identities[0];
    await idpApi.createResponse('idp1', {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      accessor_id: identity[0].accessors[0].accessorId,
      signature,
    });
    let responseResult = await responseResultPromise.promise;
    if (responseResult.success == false) {
      this.test.parent.pending = true;
      this.skip();
    }
    await requestTimeoutPromise.promise;
    await wait(3000);
  });

  it('AS should receive data request', async function () {
    this.timeout(20000);
    const dataRequest = await dataRequestReceivedPromise.promise;
    expect(dataRequest).to.deep.include({
      request_id: requestId,
      mode: createRequestParams.mode,
      namespace,
      identifier,
      service_id: createRequestParams.data_request_list[0].service_id,
      request_params: createRequestParams.data_request_list[0].request_params,
      max_ial: 2.3,
      max_aal: 3,
      requester_node_id: 'rp1',
    });
    expect(dataRequest.response_signature_list).to.have.lengthOf(1);
    expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is.not
      .empty;
  });

  it('AS should get an error callback response when send data with request that already timed out', async function () {
    this.timeout(15000);
    const response = await asApi.sendData('as1', {
      requestId,
      serviceId: createRequestParams.data_request_list[0].service_id,
      reference_id: asReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      data,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20026);

    // const sendDataResult = await sendDataResultPromise.promise;
    // expect(sendDataResult).to.deep.include({
    //   reference_id: asReferenceId,
    //   request_id: requestId,
    //   success: false,
    //   error: { code: 25002, message: 'Request is already closed' },
    // });
  });
});

describe('AS response data request already completed test', function () {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const asReferenceId = generateReferenceId();
  const as2ReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise(); // RP
  const requestTimeoutPromise = createEventPromise(); //RP
  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise(); // IDP
  const as1DataRequestReceivedPromise = createEventPromise(); // AS1
  const as1SendDataResultPromise = createEventPromise(); // AS1
  const as2DataRequestReceivedPromise = createEventPromise(); // AS2
  const requestStatusCompletedPromise = createEventPromise(); // RP

  let createRequestParams;
  const data = JSON.stringify({
    test: 'test',
    withEscapedChar: 'test|fff||ss\\|NN\\\\|',
    arr: [1, 2, 3],
  });

  let requestId;
  let initialSalt;

  let lastStatusUpdateBlockHeight;
  let rp_node_id = 'rp1';
  let requester_node_id = 'rp1';
  let idp_node_id = 'idp1';
  let as_node_id = 'as1';
  let idpIdList;
  let dataRequestList;
  let idpResponseParams = [];
  let requestMessageHash;

  before(async function () {
    this.timeout(50000);

    if (!as2Available) {
      this.test.parent.pending = true;
      this.skip();
    }

    let identity = db.idp1Identities.filter(
      (identity) =>
        identity.namespace === 'citizen_id' &&
        identity.mode === 3 &&
        !identity.revokeIdentityAssociation,
    );

    if (identity.length === 0) {
      throw new Error('No created identity to use');
    }

    namespace = identity[0].namespace;
    identifier = identity[0].identifier;

    createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 3,
      namespace,
      identifier,
      idp_id_list: [],
      data_request_list: [
        {
          service_id: 'bank_statement',
          as_id_list: ['as1', 'as2'],
          min_as: 1,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
      ],
      request_message:
        'Test request message (AS response data already completed test) (mode 3)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
      bypass_identity_check: false,
    };

    rpEventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'create_request_result' &&
        callbackData.reference_id === rpReferenceId
      ) {
        createRequestResultPromise.resolve(callbackData);
      }
      if (callbackData.status === 'confirmed') {
        if (callbackData.timed_out) {
          requestTimeoutPromise.resolve(callbackData);
        }
      } else if (callbackData.status === 'completed') {
        requestStatusCompletedPromise.resolve(callbackData);
      }
    });

    idp1EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId
      ) {
        incomingRequestPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.reference_id === idpReferenceId
      ) {
        responseResultPromise.resolve(callbackData);
      }
    });

    as1EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'data_request' &&
        callbackData.request_id === requestId
      ) {
        as1DataRequestReceivedPromise.resolve(callbackData);
      }
      if (
        callbackData.type === 'send_data_result' &&
        callbackData.reference_id === asReferenceId
      ) {
        as1SendDataResultPromise.resolve(callbackData);
      }
    });

    as2EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'data_request' &&
        callbackData.request_id === requestId
      ) {
        as2DataRequestReceivedPromise.resolve(callbackData);
      }
    });

    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    requestId = responseBody.request_id;
    initialSalt = responseBody.initial_salt;

    [idpIdList, dataRequestList, requestMessageHash] = await Promise.all([
      createIdpIdList({
        createRequestParams,
        callRpApiAtNodeId: rp_node_id,
      }),
      createDataRequestList({
        createRequestParams,
        requestId,
        initialSalt,
        callRpApiAtNodeId: rp_node_id,
      }),
      createRequestMessageHash({
        createRequestParams,
        initialSalt,
      }),
    ]); // create idp_id_list, as_id_list, request_message_hash for test

    let createRequestResult = await createRequestResultPromise.promise;
    const splittedCreationBlockHeight = createRequestResult.creation_block_height.split(
      ':',
    );
    lastStatusUpdateBlockHeight = parseInt(splittedCreationBlockHeight[1]);

    await incomingRequestPromise.promise;

    const responseGetRequestMessagePaddedHash = await idpApi.getRequestMessagePaddedHash(
      'idp1',
      {
        request_id: requestId,
        accessor_id: identity[0].accessors[0].accessorId,
      },
    );
    const responseBodyGetRequestMessagePaddedHash = await responseGetRequestMessagePaddedHash.json();

    let accessorPrivateKey = identity[0].accessors[0].accessorPrivateKey;

    const signature = createResponseSignature(
      accessorPrivateKey,
      responseBodyGetRequestMessagePaddedHash.request_message_padded_hash,
    );

    let idpResponse = {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      accessor_id: identity[0].accessors[0].accessorId,
      signature,
    };

    idpResponseParams.push({
      ...idpResponse,
      idp_id: 'idp1',
      valid_signature: true,
      valid_ial: true,
    });

    //const identity = db.idp1Identities[0];
    await idpApi.createResponse('idp1', idpResponse);
    await responseResultPromise.promise;
  });

  it('AS (as1) should receive data request', async function () {
    this.timeout(15000);
    const dataRequest = await as1DataRequestReceivedPromise.promise;
    expect(dataRequest).to.deep.include({
      request_id: requestId,
      mode: createRequestParams.mode,
      namespace,
      identifier,
      service_id: createRequestParams.data_request_list[0].service_id,
      request_params: createRequestParams.data_request_list[0].request_params,
      max_ial: 2.3,
      max_aal: 3,
      requester_node_id: 'rp1',
    });
    expect(dataRequest.response_signature_list).to.have.lengthOf(1);
    expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is.not
      .empty;
  });

  it('AS (as2) should receive data request', async function () {
    this.timeout(15000);
    const dataRequest = await as2DataRequestReceivedPromise.promise;
    expect(dataRequest).to.deep.include({
      request_id: requestId,
      mode: createRequestParams.mode,
      namespace,
      identifier,
      service_id: createRequestParams.data_request_list[0].service_id,
      request_params: createRequestParams.data_request_list[0].request_params,
      max_ial: 2.3,
      max_aal: 3,
      requester_node_id: 'rp1',
    });
    expect(dataRequest.response_signature_list).to.have.lengthOf(1);
    expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is.not
      .empty;
  });

  it('AS (as1) should send data successfully', async function () {
    this.timeout(15000);
    const response = await asApi.sendData('as1', {
      requestId,
      serviceId: createRequestParams.data_request_list[0].service_id,
      reference_id: asReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      data,
    });

    expect(response.status).to.equal(202);

    const sendDataResult = await as1SendDataResultPromise.promise;
    expect(sendDataResult).to.deep.include({
      reference_id: asReferenceId,
      request_id: requestId,
      success: true,
    });

    dataRequestList = setDataSigned(
      dataRequestList,
      createRequestParams.data_request_list[0].service_id,
      as_node_id,
    );

    dataRequestList = setDataReceived(
      dataRequestList,
      createRequestParams.data_request_list[0].service_id,
      as_node_id,
    );
  });

  it('RP should receive completed request status with received data count = 1', async function () {
    this.timeout(15000);

    const testResult = await receiveCompletedRequestStatusTest({
      nodeId: rp_node_id,
      requestStatusCompletedPromise,
      requestId,
      createRequestParams,
      dataRequestList,
      idpResponse: idpResponseParams,
      requestMessageHash,
      idpIdList,
      lastStatusUpdateBlockHeight,
      requesterNodeId: requester_node_id,
    });

    lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;

    // const requestStatus = await requestStatusCompletedPromise.promise;
    // expect(requestStatus).to.deep.include({
    //   request_id: requestId,
    //   status: 'completed',
    //   mode: createRequestParams.mode,
    //   min_idp: createRequestParams.min_idp,
    //   answered_idp_count: 1,
    //   closed: false,
    //   timed_out: false,
    //   service_list: [
    //     {
    //       service_id: createRequestParams.data_request_list[0].service_id,
    //       min_as: createRequestParams.data_request_list[0].min_as,
    //       signed_data_count: 1,
    //       received_data_count: 1,
    //     },
    //   ],
    //   response_valid_list: [
    //     {
    //       idp_id: 'idp1',
    //       valid_signature: true,
    //       valid_ial: true,
    //     },
    //   ],
    // });
    // expect(requestStatus).to.have.property('block_height');
    // expect(requestStatus.block_height).is.a('string');
    // const splittedBlockHeight = requestStatus.block_height.split(':');
    // expect(splittedBlockHeight).to.have.lengthOf(2);
    // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
    // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    await wait(3000);
  });

  it('AS (as2) should get an error response when send data with request that already completed', async function () {
    this.timeout(15000);
    const response = await asApi.sendData('as2', {
      requestId,
      serviceId: createRequestParams.data_request_list[0].service_id,
      reference_id: as2ReferenceId,
      callback_url: config.AS2_CALLBACK_URL,
      data,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20025);

    // const sendDataResult = await sendDataResultPromise.promise;
    // expect(sendDataResult).to.deep.include({
    //   reference_id: asReferenceId,
    //   request_id: requestId,
    //   success: false,
    //   error: { code: 25025, message: 'Data request is already completed' },
    // });
  });
});
