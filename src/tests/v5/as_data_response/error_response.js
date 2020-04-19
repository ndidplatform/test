import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import * as rpApi from '../../../api/v5/rp';
import * as idpApi from '../../../api/v5/idp';
import * as ndidApi from '../../../api/v5/ndid';
import * as asApi from '../../../api/v5/as';
import * as commonApi from '../../../api/v5/common';
import { idp1EventEmitter, as1EventEmitter } from '../../../callback_server';
import * as db from '../../../db';
import {
  createEventPromise,
  generateReferenceId,
  hash,
  wait,
  createResponseSignature,
} from '../../../utils';
import * as config from '../../../config';

describe('AS data response errors', function() {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const asReferenceId = generateReferenceId();

  const incomingRequestPromise = createEventPromise(); // IDP
  const dataRequestReceivedPromise = createEventPromise(); // AS
  const sendDataResultPromise = createEventPromise(); // AS

  let createRequestParams;
  const data = JSON.stringify({
    test: 'test',
    withEscapedChar: 'test|fff||ss\\|NN\\\\|',
    arr: [1, 2, 3],
  });

  let requestId;
  let requestMessageSalt;
  let requestMessageHash;

  before(async function() {
    this.timeout(30000);

    let identity = db.idp1Identities.filter(
      identity =>
        identity.namespace === 'citizen_id' &&
        identity.mode === 3 &&
        !identity.revokeIdentityAssociation,
    );

    if (identity.length === 0) {
      throw new Error('No created identity to use');
    }

    namespace = identity[0].namespace;
    identifier = identity[0].identifier;
    //referenceGroupCode = identity[0].referenceGroupCode;

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
          as_id_list: ['as2'],
          min_as: 1,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
      ],
      request_message: 'Test request message (error data response) (mode 3)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
      bypass_identity_check: false,
    };

    idp1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId
      ) {
        incomingRequestPromise.resolve(callbackData);
      }
    });

    as1EventEmitter.on('callback', function(callbackData) {
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

    const incomingRequest = await incomingRequestPromise.promise;
    requestMessageSalt = incomingRequest.request_message_salt;
    requestMessageHash = incomingRequest.request_message_hash;

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
    await dataRequestReceivedPromise.promise;
  });

  it('should get an error when making a data response with non-existent request ID', async function() {
    this.timeout(15000);
    const response = await asApi.sendData('as1', {
      requestId: 'some-non-existent-request-id',
      serviceId: createRequestParams.data_request_list[0].service_id,
      reference_id: asReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      data,
    });
    const responseBody = await response.json();

    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20012);
  });

  it('should get an error when making a data response with non-existent service ID', async function() {
    this.timeout(15000);
    const response = await asApi.sendData('as1', {
      requestId,
      serviceId: 'some-non-existent-service-id',
      reference_id: asReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      data,
    });
    const responseBody = await response.json();

    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20039);
  });

  it('should get an error when making a data response with service ID which does not concern AS-1', async function() {
    this.timeout(15000);
    const response = await asApi.sendData('as1', {
      requestId,
      serviceId: 'customer_info',
      reference_id: asReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      data,
    });
    const responseBody = await response.json();

    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20037);
  });

  after(async function() {
    this.timeout(10000);
    await rpApi.closeRequest('rp1', {
      reference_id: uuidv4(),
      callback_url: config.RP_CALLBACK_URL,
      request_id: requestId,
    });

    idp1EventEmitter.removeAllListeners('callback');
    as1EventEmitter.removeAllListeners('callback');
  });
});

describe('AS data response with error code', function() {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const asReferenceId = generateReferenceId();

  const incomingRequestPromise = createEventPromise(); // IDP
  const dataRequestReceivedPromise = createEventPromise(); // AS
  const sendDataResultPromise = createEventPromise(); // AS

  let createRequestParams;
  const data = JSON.stringify({
    test: 'test',
    withEscapedChar: 'test|fff||ss\\|NN\\\\|',
    arr: [1, 2, 3],
  });

  let requestId;
  let requestMessageSalt;
  let requestMessageHash;

  const error_code = 20001;
  const invalid_error_code = 20002;
  const error_description = "AS Error Description";

  before(async function() {
    this.timeout(30000);

    let identity = db.idp1Identities.filter(
      identity =>
        identity.namespace === 'citizen_id' &&
        identity.mode === 3 &&
        !identity.revokeIdentityAssociation,
    );

    if (identity.length === 0) {
      throw new Error('No created identity to use');
    }

    namespace = identity[0].namespace;
    identifier = identity[0].identifier;
    //referenceGroupCode = identity[0].referenceGroupCode;

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
          as_id_list: ['as2'],
          min_as: 1,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
      ],
      request_message: 'Test request message (error data response) (mode 3)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
      bypass_identity_check: false,
    };

    idp1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId
      ) {
        incomingRequestPromise.resolve(callbackData);
      }
    });

    as1EventEmitter.on('callback', function(callbackData) {
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

    const incomingRequest = await incomingRequestPromise.promise;
    requestMessageSalt = incomingRequest.request_message_salt;
    requestMessageHash = incomingRequest.request_message_hash;

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
    await dataRequestReceivedPromise.promise;

    // register code
    const response = await ndidApi.addErrorCode('ndid1', {
      'type': 'as',
      'error_code': error_code,
      'description': error_description,
    });
    expect(response.status).to.equal(204);

    await wait(2000);
  });

  it('response with non-existent error code', async function() {
    this.timeout(15000);
    const response = await asApi.sendDataError('as1', {
      requestId,
      serviceId: 'bank_statement',
      reference_id: asReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      error_code: invalid_error_code,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20078);
  });

  it('should successfully response with error code', async function() {
    this.timeout(15000);
    const response = await asApi.sendDataError('as1', {
      requestId,
      serviceId: 'bank_statement',
      reference_id: asReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      error_code,
    });

    expect(response.status).to.equal(202);
    await wait(2000);
  });

  it('check AS error response in request status reading', async function() {
    this.timeout(10000);
    const response = await commonApi.getRequest('as1', {
      requestId,
    });
    expect(response.status).to.equal(200);
    const responseBody = await response.json();
    const service = responseBody.data_request_list
      .find(service => service.service_id == 'bank_statement');
    expect(service).to.not.be.undefined;
    expect(service.response_list).to.be.an('array');
    expect(service.response_list).to.have.length(1);
    expect(service.response_list[0].error_code).to.equal(error_code);
  });

  after(async function() {
    this.timeout(10000);
    await rpApi.closeRequest('rp1', {
      reference_id: uuidv4(),
      callback_url: config.RP_CALLBACK_URL,
      request_id: requestId,
    });

    idp1EventEmitter.removeAllListeners('callback');
    as1EventEmitter.removeAllListeners('callback');

    // remove error code
    const response = await ndidApi.removeErrorCode('ndid1', {
      'type': 'as',
      'error_code': error_code,
    });
    expect(response.status).to.equal(204);
  });
});