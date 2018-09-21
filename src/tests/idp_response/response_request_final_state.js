import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import * as rpApi from '../../api/v2/rp';
import * as idpApi from '../../api/v2/idp';
import * as asApi from '../../api/v2/as';
import {
  rpEventEmitter,
  idp1EventEmitter,
  idp2EventEmitter,
  as1EventEmitter,
} from '../../callback_server';
import * as db from '../../db';
import {
  createEventPromise,
  generateReferenceId,
  createResponseSignature,
  wait,
} from '../../utils';
import * as config from '../../config';
import { as2Available, idp2Available } from '..';

describe('IdP response request already confirmed test', function() {
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

  let requestId;
  let requestMessageHash;

  before(async function() {
    this.timeout(30000);
    if (db.idp1Identities[0] == null || db.idp2Identities == null) {
      throw new Error('No created identity to use');
    }
    if (!idp2Available) {
      this.test.parent.pending = true;
      this.skip();
    }

    namespace = db.idp1Identities[0].namespace;
    identifier = db.idp1Identities[0].identifier;

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
        {
          service_id: 'customer_info',
          as_id_list: as2Available ? ['as2'] : ['as1'],
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
    };

    idp1EventEmitter.on('callback', function(callbackData) {
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

    idp2EventEmitter.on('callback', function(callbackData) {
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

  it('IdP (idp2) should create response (accept) successfully', async function() {
    this.timeout(20000);
    const idp2Identity = db.idp2Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    const idp2Response = await idpApi.createResponse('idp2', {
      reference_id: idp2ReferenceId,
      callback_url: config.IDP2_CALLBACK_URL,
      request_id: requestId,
      namespace: createRequestParams.namespace,
      identifier: createRequestParams.identifier,
      ial: 2.3,
      aal: 3,
      secret: idp2Identity.accessors[0].secret,
      status: 'accept',
      signature: createResponseSignature(
        idp2Identity.accessors[0].accessorPrivateKey,
        requestMessageHash
      ),
      accessor_id: idp2Identity.accessors[0].accessorId,
    });

    expect(idp2Response.status).to.equal(202);

    const idp2ResponseResult = await idp2ResponseResultPromise.promise;
    expect(idp2ResponseResult).to.deep.include({
      reference_id: idp2ReferenceId,
      request_id: requestId,
      success: true,
    });
  });

  it('IdP (idp1) should get an error callback response when making a response with request that already confirmed by idp2', async function() {
    this.timeout(20000);
    const identity = db.idp1Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    const response = await idpApi.createResponse('idp1', {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      namespace: createRequestParams.namespace,
      identifier: createRequestParams.identifier,
      ial: 2.3,
      aal: 3,
      secret: identity.accessors[0].secret,
      status: 'accept',
      signature: createResponseSignature(
        identity.accessors[0].accessorPrivateKey,
        requestMessageHash
      ),
      accessor_id: identity.accessors[0].accessorId,
    });

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
  });

  after(async function() {
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

describe('IdP response request already closed test', function() {
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

  let requestId;
  let requestMessageHash;

  before(async function() {
    this.timeout(30000);
    if (db.idp1Identities[0] == null || db.idp2Identities == null) {
      throw new Error('No created identity to use');
    }
    if (!idp2Available) {
      this.test.parent.pending = true;
      this.skip();
    }

    namespace = db.idp1Identities[0].namespace;
    identifier = db.idp1Identities[0].identifier;

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
        {
          service_id: 'customer_info',
          as_id_list: as2Available ? ['as2'] : ['as1'],
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
    };

    rpEventEmitter.on('callback', function(callbackData) {
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

    idp1EventEmitter.on('callback', function(callbackData) {
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

    idp2EventEmitter.on('callback', function(callbackData) {
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

    as1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'data_request' &&
        callbackData.request_id === requestId
      ) {
        dataRequestReceivedPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'send_data_result' &&
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

  it('IdP (idp2) should create response (accept) successfully', async function() {
    this.timeout(20000);
    const idp2Identity = db.idp2Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    const idp2Response = await idpApi.createResponse('idp2', {
      reference_id: idp2ReferenceId,
      callback_url: config.IDP2_CALLBACK_URL,
      request_id: requestId,
      namespace: createRequestParams.namespace,
      identifier: createRequestParams.identifier,
      ial: 2.3,
      aal: 3,
      secret: idp2Identity.accessors[0].secret,
      status: 'accept',
      signature: createResponseSignature(
        idp2Identity.accessors[0].accessorPrivateKey,
        requestMessageHash
      ),
      accessor_id: idp2Identity.accessors[0].accessorId,
    });

    expect(idp2Response.status).to.equal(202);

    const idp2ResponseResult = await idp2ResponseResultPromise.promise;
    expect(idp2ResponseResult).to.deep.include({
      reference_id: idp2ReferenceId,
      request_id: requestId,
      success: true,
    });
  });

  it('AS should receive data request', async function() {
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
      requester_node_id:'rp1'
    });
    expect(dataRequest.response_signature_list).to.have.lengthOf(1);
    expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is.not
      .empty;
  });

  it('AS should send data successfully', async function() {
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

  it('IdP (idp1) should get an error callback response when making a response with request that already closed', async function() {
    this.timeout(20000);
    const identity = db.idp1Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    const response = await idpApi.createResponse('idp1', {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      namespace: createRequestParams.namespace,
      identifier: createRequestParams.identifier,
      ial: 2.3,
      aal: 3,
      secret: identity.accessors[0].secret,
      status: 'accept',
      signature: createResponseSignature(
        identity.accessors[0].accessorPrivateKey,
        requestMessageHash
      ),
      accessor_id: identity.accessors[0].accessorId,
    });

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
  });

  after(async function() {
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

describe('IdP response request already timed out test', function() {
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

  before(async function() {
    this.timeout(30000);
    if (db.idp1Identities[0] == null) {
      throw new Error('No created identity to use');
    }

    namespace = db.idp1Identities[0].namespace;
    identifier = db.idp1Identities[0].identifier;

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
        {
          service_id: 'customer_info',
          as_id_list: as2Available ? ['as2'] : ['as1'],
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
    };

    rpEventEmitter.on('callback', function(callbackData) {
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

    idp1EventEmitter.on('callback', function(callbackData) {
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
    await requestTimeoutPromise.promise;
  });

  it('IdP (idp1) should get an error callback response when making a response with request that already timed out', async function() {
    this.timeout(20000);
    const identity = db.idp1Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier
    );
    const response = await idpApi.createResponse('idp1', {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      namespace: createRequestParams.namespace,
      identifier: createRequestParams.identifier,
      ial: 2.3,
      aal: 3,
      secret: identity.accessors[0].secret,
      status: 'accept',
      signature: createResponseSignature(
        identity.accessors[0].accessorPrivateKey,
        requestMessageHash
      ),
      accessor_id: identity.accessors[0].accessorId,
    });
    const responseBody = await response.json();

    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20026);
  });

  after(async function() {
    idp1EventEmitter.removeAllListeners('callback');
    rpEventEmitter.removeAllListeners('callback');
  });
});
