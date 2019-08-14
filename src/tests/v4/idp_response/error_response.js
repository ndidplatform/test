import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import * as rpApi from '../../../api/v4/rp';
import * as idpApi from '../../../api/v4/idp';
import * as identityApi from '../../../api/v4/identity';
// import * as commonApi from '../../api/v2/common';
import { idp1EventEmitter } from '../../../callback_server';
import * as db from '../../../db';
import * as util from '../../../utils';
import {
  createEventPromise,
  generateReferenceId,
  wait,
  createResponseSignature,
} from '../../../utils';
import * as config from '../../../config';
import { idp2Available, as2Available } from '../..';
import { getAndVerifyRequestMessagePaddedHashTest } from '../_fragments/request_flow_fragments/idp';

describe('IdP response errors tests', function() {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const updateIalReferenceId = generateReferenceId();

  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise();

  let createRequestParams;

  let requestId;
  let requestMessageHash;
  let identityForResponse;
  let responseAccessorId;
  let requestMessagePaddedHash;

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
      request_message: 'Test request message (error data response) (mode 3)',
      min_ial: 2.3,
      min_aal: 3,
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
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.request_id === requestId
      ) {
        responseResultPromise.resolve(callbackData);
      }
    });

    const responseRp = await rpApi.createRequest('rp1', createRequestParams);
    const responseBodyRp = await responseRp.json();
    requestId = responseBodyRp.request_id;

    const incomingRequest = await incomingRequestPromise.promise;
    requestMessageHash = incomingRequest.request_message_hash;
  });

  it('IdP should get request_message_padded_hash successfully', async function() {
    this.timeout(15000);
    identityForResponse = db.idp1Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier,
    );

    responseAccessorId = identityForResponse.accessors[0].accessorId;
    let accessorPublicKey = identityForResponse.accessors[0].accessorPublicKey;

    responseAccessorId = identityForResponse.accessors[0].accessorId;

    const testResult = await getAndVerifyRequestMessagePaddedHashTest({
      callApiAtNodeId: 'idp1',
      idpNodeId: 'idp1',
      requestId,
      incomingRequestPromise,
      accessorPublicKey,
      accessorId: responseAccessorId,
    });
    requestMessagePaddedHash = testResult.verifyRequestMessagePaddedHash;
  });

  it('should get an error when making a response with non-existent request ID', async function() {
    this.timeout(15000);
    let accessorPrivateKey =
      identityForResponse.accessors[0].accessorPrivateKey;

    const signature = createResponseSignature(
      accessorPrivateKey,
      requestMessagePaddedHash,
    );

    const response = await idpApi.createResponse('idp1', {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: 'some-non-existent-request-id',
      ial: 2.3,
      aal: 3,
      status: 'accept',
      accessor_id: responseAccessorId,
      signature,
    });
    const responseBody = await response.json();

    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20012);
  });

  it('should get an error when making a response without accessor ID (mode 3)', async function() {
    this.timeout(15000);
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
      // accessor_id: identity.accessors[0].accessorId,
      signature,
    });
    const responseBody = await response.json();

    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20014);
  });

  it('should get an error when making a response without signature (mode 2)', async function() {
    this.timeout(15000);
    const response = await idpApi.createResponse('idp1', {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      accessor_id: responseAccessorId,
    });
    const responseBody = await response.json();

    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20003);
  });

  it('should get an error when making a response without signature (mode 3)', async function() {
    this.timeout(15000);
    const response = await idpApi.createResponse('idp1', {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      accessor_id: responseAccessorId,
    });
    const responseBody = await response.json();

    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20003);
  });

  it('should get an error when making a response with non-existent accessor ID (mode 3)', async function() {
    this.timeout(15000);
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
      accessor_id: 'non-existent-accessor-id',
      signature,
    });
    const responseBody = await response.json();

    expect(response.status).to.equal(400);
    //expect(responseBody.error.code).to.equal(20011);
    expect(responseBody.error.code).to.equal(20077);
  });

  it('should get an error when making a response with invalid accessor signature (mode 3)', async function() {
    this.timeout(25000);
    let random8Byte = util.randomByte(8);

    const response = await idpApi.createResponse('idp1', {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      accessor_id: responseAccessorId,
      signature: random8Byte.toString(),
    });
    // const responseBody = await response.json();

    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20028);

    // const responseResult = await responseResultPromise.promise;
    // expect(responseResult).to.deep.include({
    //   node_id: 'idp1',
    //   type: 'response_result',
    //   reference_id: idpReferenceId,
    //   request_id: requestId,
    //   success: false,
    // });
    // expect(responseResult.error.code).to.equal(10014);
  });

  it('should get an error when making a response with invalid ial (ial is not in enum) (mode 3)', async function() {
    this.timeout(15000);
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
      ial: 5,
      aal: 1,
      status: 'accept',
      accessor_id: responseAccessorId,
      signature,
    });
    const responseBody = await response.json();

    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20003);
  });

  it('should get an error when making a response with invalid aal (aal is not in enum) (mode 3)', async function() {
    const identity = db.idp1Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier,
    );

    const response = await idpApi.createResponse('idp1', {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      ial: 2.3,
      aal: 5,
      status: 'accept',
      accessor_id: identity.accessors[0].accessorId,
      signature: 'Test signature',
    });
    const responseBody = await response.json();

    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20003);
  });

  it('should get an error when making a response with invalid ial (ial not match identity info) (mode 3)', async function() {
    this.timeout(20000);
    const identity = db.idp1Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier,
    );

    const response = await idpApi.createResponse('idp1', {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      ial: 3,
      aal: 3,
      status: 'accept',
      accessor_id: identity.accessors[0].accessorId,
      signature: 'Test signature',
    });
    expect(response.status).to.equal(400);

    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20060);
  });

  // it('should get an error when making a response with invalid secret', async function() {
  //   this.timeout(20000);

  //   if (!idp2Available || db.idp2Identities.length === 0) {
  //     this.skip();
  //   }
  //   const identity = db.idp1Identities.find(
  //     identity =>
  //       identity.namespace === namespace && identity.identifier === identifier
  //   );
  //   const identityIdP2 = db.idp2Identities.find(
  //     identity =>
  //       identity.namespace === namespace && identity.identifier === identifier
  //   );

  //   const response = await idpApi.createResponse('idp1', {
  //     reference_id: idpReferenceId,
  //     callback_url: config.IDP1_CALLBACK_URL,
  //     request_id: requestId,
  //     namespace: createRequestParams.namespace,
  //     identifier: createRequestParams.identifier,
  //     ial: 2.3,
  //     aal: 3,
  //     secret: identityIdP2.accessors[0].secret,
  //     status: 'accept',
  //     signature: createResponseSignature(
  //       identity.accessors[0].accessorPrivateKey,
  //       requestMessageHash
  //     ),
  //     accessor_id: identity.accessors[0].accessorId,
  //   });
  //   expect(response.status).to.equal(400);

  //   const responseBody = await response.json();
  //   expect(responseBody.error.code).to.equal(20027);
  // });

  it('should get an error when IdP update identity invalid ial (ial is not in enum)', async function() {
    this.timeout(15000);
    const response = await identityApi.updateIdentityIal('idp1', {
      namespace: namespace,
      identifier: identifier,
      reference_id: updateIalReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      ial: 0,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20003);
  });

  after(async function() {
    this.timeout(10000);
    await rpApi.closeRequest('rp1', {
      reference_id: uuidv4(),
      callback_url: config.RP_CALLBACK_URL,
      request_id: requestId,
    });
    idp1EventEmitter.removeAllListeners('callback');
    await wait(3000);
  });
});

describe("IdP making response with ial less than request's min_ial and IdP making a response again test", function() {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId(); //1st IDP

  const incomingRequestPromise = createEventPromise(); // 1st IDP
  const responseResultPromise = createEventPromise(); // 1st IDP

  let createRequestParams;

  let requestId;
  let requestMessageHash;
  let identityForResponse;
  let responseAccessorId;
  let requestMessagePaddedHash;

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
      request_message: 'Test request message (error response) (mode 3)',
      min_ial: 2.3,
      min_aal: 3,
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
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.request_id === requestId
      ) {
        responseResultPromise.resolve(callbackData);
      }
    });

    const responseRp = await rpApi.createRequest('rp1', createRequestParams);
    const responseBodyRp = await responseRp.json();
    requestId = responseBodyRp.request_id;
    const incomingRequest = await incomingRequestPromise.promise;
    requestMessageHash = incomingRequest.request_message_hash;
  });

  it('IdP should get request_message_padded_hash successfully', async function() {
    this.timeout(15000);
    identityForResponse = db.idp1Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier,
    );

    responseAccessorId = identityForResponse.accessors[0].accessorId;
    let accessorPublicKey = identityForResponse.accessors[0].accessorPublicKey;

    responseAccessorId = identityForResponse.accessors[0].accessorId;

    const testResult = await getAndVerifyRequestMessagePaddedHashTest({
      callApiAtNodeId: 'idp1',
      idpNodeId: 'idp1',
      requestId,
      incomingRequestPromise,
      accessorPublicKey,
      accessorId: responseAccessorId,
    });
    requestMessagePaddedHash = testResult.verifyRequestMessagePaddedHash;
  });

  it("should get an error response when making a response with ial less than request's min_ial", async function() {
    this.timeout(10000);

    let accessorPrivateKey =
      identityForResponse.accessors[0].accessorPrivateKey;

    const signature = createResponseSignature(
      accessorPrivateKey,
      requestMessagePaddedHash,
    );

    const responseErrorCalback = await idpApi.createResponse('idp1', {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      ial: 1.1,
      aal: 3,
      status: 'accept',
      accessor_id: responseAccessorId,
      signature,
    });
    const responseBodyErrorCallback = await responseErrorCalback.json();

    expect(responseErrorCalback.status).to.equal(400);
    expect(responseBodyErrorCallback.error.code).to.equal(20055);
  });

  it('After IdP get an error response, IdP should making a response again successfully', async function() {
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

    expect(response.status).to.equal(202);

    const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      reference_id: idpReferenceId,
      request_id: requestId,
      success: true,
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
    await wait(3000);
  });
});

describe("IdP making response with aal less than request's min_aal and IdP making a response again test", function() {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId(); //1st IDP

  const incomingRequestPromise = createEventPromise(); // 1st IDP
  const responseResultPromise = createEventPromise(); // 1st IDP

  let createRequestParams;

  let requestId;
  let requestMessageHash;
  let identityForResponse;
  let responseAccessorId;
  let requestMessagePaddedHash;

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
      request_message: 'Test request message (error response) (mode 3)',
      min_ial: 2.3,
      min_aal: 3,
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
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.request_id === requestId
      ) {
        responseResultPromise.resolve(callbackData);
      }
    });

    const responseRp = await rpApi.createRequest('rp1', createRequestParams);
    const responseBodyRp = await responseRp.json();
    requestId = responseBodyRp.request_id;
    const incomingRequest = await incomingRequestPromise.promise;
    requestMessageHash = incomingRequest.request_message_hash;
  });

  it('IdP should get request_message_padded_hash successfully', async function() {
    identityForResponse = db.idp1Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier,
    );
    responseAccessorId = identityForResponse.accessors[0].accessorId;
    let accessorPublicKey = identityForResponse.accessors[0].accessorPublicKey;

    responseAccessorId = identityForResponse.accessors[0].accessorId;

    const testResult = await getAndVerifyRequestMessagePaddedHashTest({
      callApiAtNodeId: 'idp1',
      idpNodeId: 'idp1',
      requestId,
      incomingRequestPromise,
      accessorPublicKey,
      accessorId: responseAccessorId,
    });
    requestMessagePaddedHash = testResult.verifyRequestMessagePaddedHash;
  });

  it("should get an error response when making a response with aal less than request's min_aal", async function() {
    this.timeout(10000);

    let accessorPrivateKey =
      identityForResponse.accessors[0].accessorPrivateKey;

    const signature = createResponseSignature(
      accessorPrivateKey,
      requestMessagePaddedHash,
    );

    const responseErrorCalback = await idpApi.createResponse('idp1', {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      ial: 2.3,
      aal: 1,
      status: 'accept',
      accessor_id: responseAccessorId,
      signature,
    });
    const responseBodyErrorCallback = await responseErrorCalback.json();

    expect(responseErrorCalback.status).to.equal(400);
    expect(responseBodyErrorCallback.error.code).to.equal(20056);
  });

  it('After IdP get an error response, IdP should making a response again successfully', async function() {
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

    expect(response.status).to.equal(202);

    const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      reference_id: idpReferenceId,
      request_id: requestId,
      success: true,
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
    await wait(3000);
  });
});

describe('IdP2 making response with request does not concern IdP2 (mode 1)', function() {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId(); //1st IDP

  const incomingRequestPromise = createEventPromise(); // 1st IDP
  const responseResultPromise = createEventPromise(); // 1st IDP

  let createRequestParams;

  let requestId;
  let requestMessageHash;

  before(async function() {
    this.timeout(30000);

    if (!idp2Available) {
      this.test.parent.pending = true;
      this.skip();
    }

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

    createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 1,
      namespace,
      identifier,
      idp_id_list: ['idp1'],
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
      request_message: 'Test request message (error response) (mode 1)',
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
        incomingRequestPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.request_id === requestId
      ) {
        responseResultPromise.resolve(callbackData);
      }
    });

    const responseRp = await rpApi.createRequest('rp1', createRequestParams);
    const responseBodyRp = await responseRp.json();
    requestId = responseBodyRp.request_id;
    const incomingRequest = await incomingRequestPromise.promise;
    requestMessageHash = incomingRequest.request_message_hash;
  });

  it('should get an error when IdP2 making response with request does not concern IdP2', async function() {
    this.timeout(10000);
    const identity = db.idp1Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier,
    );

    const response = await idpApi.createResponse('idp2', {
      reference_id: idpReferenceId,
      callback_url: config.IDP2_CALLBACK_URL,
      request_id: requestId,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      accessor_id: identity.accessors[0].accessorId,
      signature: 'Test Signature',
    });
    const responseBodyErrorCallback = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBodyErrorCallback.error.code).to.equal(20038);
  });
  after(async function() {
    this.timeout(10000);
    await rpApi.closeRequest('rp1', {
      reference_id: uuidv4(),
      callback_url: config.RP_CALLBACK_URL,
      request_id: requestId,
    });
    idp1EventEmitter.removeAllListeners('callback');
    await wait(3000);
  });
});

describe('IdP2 making response with request does not concern IdP2 (mode 3)', function() {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId(); //1st IDP

  const incomingRequestPromise = createEventPromise(); // 1st IDP
  const responseResultPromise = createEventPromise(); // 1st IDP

  let createRequestParams;

  let requestId;
  let requestMessageHash;
  let identityForResponse;
  let responseAccessorId;
  let requestMessagePaddedHash;

  before(async function() {
    this.timeout(30000);

    if (!idp2Available) {
      this.test.parent.pending = true;
      this.skip();
    }

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

    createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 3,
      namespace,
      identifier,
      idp_id_list: ['idp1'],
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
      request_message: 'Test request message (error response) (mode 3)',
      min_ial: 2.3,
      min_aal: 3,
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
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.request_id === requestId
      ) {
        responseResultPromise.resolve(callbackData);
      }
    });

    const responseRp = await rpApi.createRequest('rp1', createRequestParams);
    const responseBodyRp = await responseRp.json();
    requestId = responseBodyRp.request_id;
    const incomingRequest = await incomingRequestPromise.promise;
    requestMessageHash = incomingRequest.request_message_hash;
  });

  // it('IdP should get request_message_padded_hash successfully', async function() {
  //   identityForResponse = db.idp2Identities.find(
  //     identity =>
  //       identity.namespace === namespace && identity.identifier === identifier,
  //   );

  //   responseAccessorId = identityForResponse.accessors[0].accessorId;
  //   let accessorPublicKey = identityForResponse.accessors[0].accessorPublicKey;

  //   responseAccessorId = identityForResponse.accessors[0].accessorId;

  //   const testResult = await getAndVerifyRequestMessagePaddedHashTest({
  //     callApiAtNodeId: 'idp2',
  //     idpNodeId: 'idp2',
  //     requestId,
  //     incomingRequestPromise,
  //     accessorPublicKey,
  //     accessorId: responseAccessorId,
  //   });
  //   requestMessagePaddedHash = testResult.verifyRequestMessagePaddedHash;
  // });

  it('should get an error when IdP2 making response with request does not concern IdP2', async function() {
    this.timeout(10000);

    //idp2 cannot get request message padded hash
    //if it response request it should get an error 20038

    const identity = db.idp2Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier,
    );

    const response = await idpApi.createResponse('idp2', {
      reference_id: idpReferenceId,
      callback_url: config.IDP2_CALLBACK_URL,
      request_id: requestId,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      accessor_id: identity.accessors[0].accessorId,
      signature: 'Test signature',
    });
    const responseBodyErrorCallback = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBodyErrorCallback.error.code).to.equal(20038);
  });

  after(async function() {
    this.timeout(10000);
    await rpApi.closeRequest('rp1', {
      reference_id: uuidv4(),
      callback_url: config.RP_CALLBACK_URL,
      request_id: requestId,
    });
    idp1EventEmitter.removeAllListeners('callback');
    await wait(3000);
  });
});
