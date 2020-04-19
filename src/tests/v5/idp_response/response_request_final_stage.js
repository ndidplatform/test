import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import * as rpApi from '../../../api/v5/rp';
import * as idpApi from '../../../api/v5/idp';
import * as asApi from '../../../api/v5/as';
import {
  rpEventEmitter,
  idp1EventEmitter,
  idp2EventEmitter,
  as1EventEmitter,
} from '../../../callback_server';
import * as db from '../../../db';
import {
  createEventPromise,
  generateReferenceId,
  wait,
  createResponseSignature,
} from '../../../utils';
import * as config from '../../../config';
import { idp2Available } from '../..';
import { getAndVerifyRequestMessagePaddedHashTest } from '../_fragments/request_flow_fragments/idp';

describe('IdP response request already confirmed test', function () {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId(); //1st IDP
  const idp2ReferenceId = generateReferenceId(); //2nd IDP

  const idp1IncomingRequestPromise = createEventPromise(); // 1st IDP
  const idp1ResponseResultPromise = createEventPromise(); // 1st IDP

  const idp2IncomingRequestPromise = createEventPromise(); // 2nd IDP
  const idp2ResponseResultPromise = createEventPromise(); // 2nd IDP

  let createRequestParams;
  let idp1RequestMessagePaddedHash;

  let requestId;
  let requestMessageHash;
  let identityForResponse;
  let responseAccessorId;
  let requestMessagePaddedHash;

  before(async function () {
    this.timeout(30000);

    if (!idp2Available) {
      this.test.parent.pending = true;
      this.skip();
    }

    let identity = db.idp1Identities.filter(
      (identity) =>
        identity.namespace === 'citizen_id' &&
        identity.mode === 3 &&
        !identity.revokeIdentityAssociation &&
        identity.willCreateOnIdP2,
    );

    let identityOnIdp2 = db.idp2Identities.filter(
      (identityIdP2) =>
        identityIdP2.namespace === identity[0].namespace &&
        identityIdP2.identifier === identity[0].identifier &&
        identityIdP2.mode === identity[0].mode,
    );

    if (identity.length === 0 || identityOnIdp2.length === 0) {
      //throw new Error('No created identity to use');
      this.test.parent.pending = true;
      this.skip();
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
        'Test request message (IdP response request already confirmed test) (mode 3)',
      min_ial: 2.3,
      min_aal: 3,
      min_idp: 1,
      request_timeout: 86400,
      bypass_identity_check: false,
    };

    idp1EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId
      ) {
        idp1IncomingRequestPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.request_id === requestId
      ) {
        idp1ResponseResultPromise.resolve(callbackData);
      }
    });

    idp2EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId
      ) {
        idp2IncomingRequestPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.request_id === requestId
      ) {
        idp2ResponseResultPromise.resolve(callbackData);
      }
    });

    const responseRp = await rpApi.createRequest('rp1', createRequestParams);
    const responseBodyRp = await responseRp.json();
    requestId = responseBodyRp.request_id;
    const incomingRequest = await idp1IncomingRequestPromise.promise;
    requestMessageHash = incomingRequest.request_message_hash;
    await idp2IncomingRequestPromise.promise;
  });

  it('IdP should get request_message_padded_hash successfully', async function () {
    this.timeout(30000);
    identityForResponse = db.idp2Identities.find(
      (identity) =>
        identity.namespace === namespace && identity.identifier === identifier,
    );

    responseAccessorId = identityForResponse.accessors[0].accessorId;
    let accessorPublicKey = identityForResponse.accessors[0].accessorPublicKey;

    const testResult = await getAndVerifyRequestMessagePaddedHashTest({
      callApiAtNodeId: 'idp2',
      idpNodeId: 'idp2',
      requestId,
      incomingRequestPromise: idp2IncomingRequestPromise,
      accessorPublicKey,
      accessorId: responseAccessorId,
    });
    requestMessagePaddedHash = testResult.verifyRequestMessagePaddedHash;

    const identity = db.idp1Identities.find(
      (identity) =>
        identity.namespace === namespace && identity.identifier === identifier,
    );

    let idp1AccessorPublicKey = identity.accessors[0].accessorPublicKey;
    let idp1ResponseAccessorId = identity.accessors[0].accessorId;

    const idp1TestResult = await getAndVerifyRequestMessagePaddedHashTest({
      callApiAtNodeId: 'idp1',
      idpNodeId: 'idp1',
      requestId,
      incomingRequestPromise: idp1IncomingRequestPromise,
      accessorPublicKey: idp1AccessorPublicKey,
      accessorId: idp1ResponseAccessorId,
    });
    idp1RequestMessagePaddedHash =
      idp1TestResult.verifyRequestMessagePaddedHash;
  });

  it('IdP (idp2) should create response (accept) successfully', async function () {
    this.timeout(20000);

    let accessorPrivateKey =
      identityForResponse.accessors[0].accessorPrivateKey;

    const signature = createResponseSignature(
      accessorPrivateKey,
      requestMessagePaddedHash,
    );

    const idp2Response = await idpApi.createResponse('idp2', {
      reference_id: idp2ReferenceId,
      callback_url: config.IDP2_CALLBACK_URL,
      request_id: requestId,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      accessor_id: responseAccessorId,
      signature,
    });

    expect(idp2Response.status).to.equal(202);

    const idp2ResponseResult = await idp2ResponseResultPromise.promise;
    expect(idp2ResponseResult).to.deep.include({
      reference_id: idp2ReferenceId,
      request_id: requestId,
      success: true,
    });
  });

  it('IdP (idp1) should get an error callback response when making a response with request that already confirmed by idp2', async function () {
    this.timeout(20000);
    const identity = db.idp1Identities.find(
      (identity) =>
        identity.namespace === namespace && identity.identifier === identifier,
    );

    let accessorPrivateKey = identity.accessors[0].accessorPrivateKey;

    const signature = createResponseSignature(
      accessorPrivateKey,
      idp1RequestMessagePaddedHash,
    );

    const response = await idpApi.createResponse('idp1', {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      accessor_id: identity.accessors[0].accessorId,
      signature,
    });

    if (response.status === 400) {
      const responseBody = await response.json();
      expect(responseBody.error.code).to.equal(20081);
    } else {
      expect(response.status).to.equal(202);

      const responseResult = await idp1ResponseResultPromise.promise;
      expect(responseResult).to.deep.include({
        reference_id: idpReferenceId,
        request_id: requestId,
        success: false,
        error: {
          code: 25004,
          message: 'Request is already completed',
        },
      });
    }
  });

  after(async function () {
    this.timeout(10000);
    await rpApi.closeRequest('rp1', {
      reference_id: uuidv4(),
      callback_url: config.RP_CALLBACK_URL,
      request_id: requestId,
    });
    idp1EventEmitter.removeAllListeners('callback');
    idp2EventEmitter.removeAllListeners('callback');
    await wait(3000);
  });
});

describe('IdP response request already closed test', function () {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId(); //1st IDP
  const idp2ReferenceId = generateReferenceId(); //2nd IDP
  const asReferenceId = generateReferenceId(); // AS

  const requestClosedPromise = createEventPromise(); //RP
  const idp1IncomingRequestPromise = createEventPromise(); // 1st IDP
  const idp1ResponseResultPromise = createEventPromise(); // 1st IDP
  const idp2IncomingRequestPromise = createEventPromise(); // 2nd IDP
  const idp2ResponseResultPromise = createEventPromise(); // 2nd IDP
  const dataRequestReceivedPromise = createEventPromise(); // AS
  const sendDataResultPromise = createEventPromise(); // AS
  let createRequestParams;
  let idp1RequestMessagePaddedHash;

  let requestId;
  let requestMessageHash;
  let identityForResponse;
  let responseAccessorId;
  let requestMessagePaddedHash;

  before(async function () {
    this.timeout(30000);

    if (!idp2Available) {
      this.test.parent.pending = true;
      this.skip();
    }

    let identity = db.idp1Identities.filter(
      (identity) =>
        identity.namespace === 'citizen_id' &&
        identity.mode === 3 &&
        !identity.revokeIdentityAssociation &&
        identity.willCreateOnIdP2,
    );

    let identityOnIdp2 = db.idp2Identities.filter(
      (identityIdP2) =>
        identityIdP2.namespace === identity[0].namespace &&
        identityIdP2.identifier === identity[0].identifier &&
        identityIdP2.mode === identity[0].mode,
    );

    if (identity.length === 0 || identityOnIdp2.length === 0) {
      //throw new Error('No created identity to use');
      this.test.parent.pending = true;
      this.skip();
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
        'Test request message (IdP response request already closed test) (mode 3)',
      min_ial: 2.3,
      min_aal: 3,
      min_idp: 1,
      request_timeout: 86400,
      bypass_identity_check: false,
    };

    rpEventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === requestId
      ) {
        if (callbackData.status === 'completed') {
          if (callbackData.closed) {
            requestClosedPromise.resolve(callbackData);
          }
        }
      }
    });

    idp1EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId
      ) {
        idp1IncomingRequestPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.request_id === requestId
      ) {
        idp1ResponseResultPromise.resolve(callbackData);
      }
    });

    idp2EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId
      ) {
        idp2IncomingRequestPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.request_id === requestId
      ) {
        idp2ResponseResultPromise.resolve(callbackData);
      }
    });

    as1EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'data_request' &&
        callbackData.request_id === requestId
      ) {
        dataRequestReceivedPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.reference_id === asReferenceId
      ) {
        sendDataResultPromise.resolve(callbackData);
      }
    });

    const responseRp = await rpApi.createRequest('rp1', createRequestParams);
    const responseBodyRp = await responseRp.json();
    requestId = responseBodyRp.request_id;
    const incomingRequest = await idp1IncomingRequestPromise.promise;
    requestMessageHash = incomingRequest.request_message_hash;
    await idp2IncomingRequestPromise.promise;
  });

  it('IdP should get request_message_padded_hash successfully', async function () {
    this.timeout(15000);
    identityForResponse = db.idp2Identities.find(
      (identity) =>
        identity.namespace === namespace && identity.identifier === identifier,
    );

    responseAccessorId = identityForResponse.accessors[0].accessorId;
    let accessorPublicKey = identityForResponse.accessors[0].accessorPublicKey;

    const testResult = await getAndVerifyRequestMessagePaddedHashTest({
      callApiAtNodeId: 'idp2',
      idpNodeId: 'idp2',
      requestId,
      incomingRequestPromise: idp2IncomingRequestPromise,
      accessorPublicKey,
      accessorId: responseAccessorId,
    });
    requestMessagePaddedHash = testResult.verifyRequestMessagePaddedHash;

    const identity = db.idp1Identities.find(
      (identity) =>
        identity.namespace === namespace && identity.identifier === identifier,
    );

    let idp1AccessorPublicKey = identity.accessors[0].accessorPublicKey;
    let idp1ResponseAccessorId = identity.accessors[0].accessorId;

    const idp1TestResult = await getAndVerifyRequestMessagePaddedHashTest({
      callApiAtNodeId: 'idp1',
      idpNodeId: 'idp1',
      requestId,
      incomingRequestPromise: idp1IncomingRequestPromise,
      accessorPublicKey: idp1AccessorPublicKey,
      accessorId: idp1ResponseAccessorId,
    });
    idp1RequestMessagePaddedHash =
      idp1TestResult.verifyRequestMessagePaddedHash;
  });

  it('IdP (idp2) should create response (accept) successfully', async function () {
    this.timeout(20000);

    let accessorPrivateKey =
      identityForResponse.accessors[0].accessorPrivateKey;

    const signature = createResponseSignature(
      accessorPrivateKey,
      requestMessagePaddedHash,
    );

    const idp2Response = await idpApi.createResponse('idp2', {
      reference_id: idp2ReferenceId,
      callback_url: config.IDP2_CALLBACK_URL,
      request_id: requestId,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      accessor_id: responseAccessorId,
      signature,
    });

    expect(idp2Response.status).to.equal(202);

    const idp2ResponseResult = await idp2ResponseResultPromise.promise;
    expect(idp2ResponseResult).to.deep.include({
      reference_id: idp2ReferenceId,
      request_id: requestId,
      success: true,
    });
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

  it('AS should send data successfully', async function () {
    this.timeout(20000);
    const response = await asApi.sendData('as1', {
      requestId,
      serviceId: createRequestParams.data_request_list[0].service_id,
      reference_id: asReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      data: 'IdP response request already closed test',
    });
    expect(response.status).to.equal(202);

    const sendDataResult = await sendDataResultPromise.promise;
    expect(sendDataResult).to.deep.include({
      reference_id: asReferenceId,
      success: true,
    });
  });

  it('IdP (idp1) should get an error callback response when making a response with request that already closed', async function () {
    this.timeout(20000);
    const identity = db.idp1Identities.find(
      (identity) =>
        identity.namespace === namespace && identity.identifier === identifier,
    );

    const accessorPrivateKey = identity.accessors[0].accessorPrivateKey;

    const signature = createResponseSignature(
      accessorPrivateKey,
      idp1RequestMessagePaddedHash,
    );

    const response = await idpApi.createResponse('idp1', {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      accessor_id: identity.accessors[0].accessorId,
      signature,
    });

    if (response.status === 400) {
      const responseBody = await response.json();
      expect(responseBody.error.code).to.equal(20081);
    }
    else{
      expect(response.status).to.equal(202);

      const responseResult = await idp1ResponseResultPromise.promise;
      expect(responseResult).to.deep.include({
        reference_id: idpReferenceId,
        request_id: requestId,
        success: false,
        error: {
          code: 25004,
          message: 'Request is already completed',
        },
      });
    }
  });

  after(async function () {
    this.timeout(10000);
    await rpApi.closeRequest('rp1', {
      reference_id: uuidv4(),
      callback_url: config.RP_CALLBACK_URL,
      request_id: requestId,
    });
    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
    idp2EventEmitter.removeAllListeners('callback');
    as1EventEmitter.removeAllListeners('callback');
    await wait(3000);
  });
});

describe('IdP response request already timed out test', function () {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId(); //1st IDP

  const requestTimeoutPromise = createEventPromise(); //RP
  const idp1IncomingRequestPromise = createEventPromise(); // 1st IDP
  const idp1ResponseResultPromise = createEventPromise(); // 1st IDP

  let createRequestParams;

  let requestId;
  let requestMessageHash;
  let identityForResponse;
  let responseAccessorId;
  let requestMessagePaddedHash;

  before(async function () {
    this.timeout(30000);

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
        'Test request message (IdP response request already timed out test) (mode 3)',
      min_ial: 2.3,
      min_aal: 3,
      min_idp: 1,
      request_timeout: 3,
      bypass_identity_check: false,
    };

    rpEventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === requestId
      ) {
        if (callbackData.status === 'pending') {
          if (callbackData.timed_out) {
            requestTimeoutPromise.resolve(callbackData);
          }
        }
      }
    });

    idp1EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId
      ) {
        idp1IncomingRequestPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.request_id === requestId
      ) {
        idp1ResponseResultPromise.resolve(callbackData);
      }
    });

    const responseRp = await rpApi.createRequest('rp1', createRequestParams);
    const responseBodyRp = await responseRp.json();
    requestId = responseBodyRp.request_id;
    const incomingRequest = await idp1IncomingRequestPromise.promise;
    requestMessageHash = incomingRequest.request_message_hash;
  });

  it('IdP should get request_message_padded_hash successfully', async function () {
    this.timeout(15000);
    identityForResponse = db.idp1Identities.find(
      (identity) =>
        identity.namespace === namespace && identity.identifier === identifier,
    );

    responseAccessorId = identityForResponse.accessors[0].accessorId;
    let accessorPublicKey = identityForResponse.accessors[0].accessorPublicKey;

    const testResult = await getAndVerifyRequestMessagePaddedHashTest({
      callApiAtNodeId: 'idp1',
      idpNodeId: 'idp1',
      requestId,
      incomingRequestPromise: idp1IncomingRequestPromise,
      accessorPublicKey,
      accessorId: responseAccessorId,
    });
    requestMessagePaddedHash = testResult.verifyRequestMessagePaddedHash;
    await requestTimeoutPromise.promise;
  });

  it('IdP (idp1) should get an error callback response when making a response with request that already timed out', async function () {
    this.timeout(20000);

    let accessorPrivateKey =
      identityForResponse.accessors[0].accessorPrivateKey;

    const signature = createResponseSignature(
      accessorPrivateKey,
      requestMessagePaddedHash,
    );

    const response = await idpApi.createResponse('idp1', {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      accessor_id: responseAccessorId,
      signature,
    });
    const responseBody = await response.json();

    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20026);
  });

  after(async function () {
    idp1EventEmitter.removeAllListeners('callback');
    rpEventEmitter.removeAllListeners('callback');
  });
});
