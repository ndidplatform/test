import { expect } from 'chai';
import forge from 'node-forge';

import * as ndidApi from '../../api/v2/ndid';
import * as rpApi from '../../api/v2/rp';
import * as idpApi from '../../api/v2/idp';
import * as asApi from '../../api/v2/as';
import * as commonApi from '../../api/v2/common';
import * as db from '../../db';
import { ndidAvailable } from '..';
import {
  createEventPromise,
  generateReferenceId,
  hashRequestMessageForConsent,
  wait,
  createResponseSignature,
} from '../../utils';
import {
  as1EventEmitter,
  idp1EventEmitter,
  rpEventEmitter,
} from '../../callback_server';
import * as config from '../../config';

describe('NDID disable namespace test', function() {
  let namespace;
  let identifier;
  const keypair = forge.pki.rsa.generateKeyPair(2048);
  const accessorPrivateKey = forge.pki.privateKeyToPem(keypair.privateKey);
  const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);

  const createIdentityreferenceId = generateReferenceId();
  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const asReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise(); // RP
  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise(); // IDP
  const dataRequestReceivedPromise = createEventPromise(); // AS
  const sendDataResultPromise = createEventPromise(); // AS

  let createRequestParams;
  let requestId;
  let requestMessageHash;

  before(function() {
    if (!ndidAvailable) {
      this.skip();
    }

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
      ],
      request_message: 'Test request message (disabled namespace)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    };

    rpEventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'create_request_result' &&
        callbackData.reference_id === rpReferenceId
      ) {
        createRequestResultPromise.resolve(callbackData);
      }
    });

    idp1EventEmitter.on('callback', function(callbackData) {
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

    as1EventEmitter.on('callback', function(callbackData) {
      if (callbackData.type === 'send_data_result') {
        if (callbackData.reference_id === asReferenceId) {
          sendDataResultPromise.resolve(callbackData);
        }
      } else if (
        callbackData.type === 'data_request' &&
        callbackData.request_id === requestId
      ) {
        dataRequestReceivedPromise.resolve(callbackData);
      }
    });
  });

  it('NDID should disable namespace (cid) successfully', async function() {
    this.timeout(10000);

    const response = await ndidApi.disableNamespace('ndid1', {
      namespace: 'cid',
    });

    expect(response.status).to.equal(204);
    await wait(1000);
  });

  it('Namespace (cid) should be disabled successfully', async function() {
    this.timeout(10000);

    const responseUtilityGetNamespaces = await commonApi.getNamespaces('ndid1');
    const responseBody = await responseUtilityGetNamespaces.json();

    let namespace = responseBody.find(
      namespace => namespace.namespace === 'cid'
    );

    expect(namespace).to.be.an('undefined');
  });

  it('should create identity request unsuccessfully', async function() {
    this.timeout(10000);
    const response = await idpApi.createIdentity('idp1', {
      reference_id: createIdentityreferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      namespace,
      identifier,
      accessor_type: 'RSA',
      accessor_public_key: accessorPublicKey,
      //accessor_id,
      ial: 2.3,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20013);
  });

  it('RP should create a request successfully', async function() {
    this.timeout(10000);
    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();

    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

    requestId = responseBody.request_id;

    const createRequestResult = await createRequestResultPromise.promise;
    expect(createRequestResult.success).to.equal(true);
  });

  it('IdP should receive incoming request callback', async function() {
    this.timeout(15000);
    const incomingRequest = await incomingRequestPromise.promise;
    expect(incomingRequest).to.deep.include({
      mode: createRequestParams.mode,
      request_id: requestId,
      namespace: createRequestParams.namespace,
      identifier: createRequestParams.identifier,
      request_message: createRequestParams.request_message,
      request_message_hash: hashRequestMessageForConsent(
        createRequestParams.request_message,
        incomingRequest.initial_salt,
        requestId
      ),
      requester_node_id: 'rp1',
      min_ial: createRequestParams.min_ial,
      min_aal: createRequestParams.min_aal,
      data_request_list: createRequestParams.data_request_list,
    });
    expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
      .empty;
    expect(incomingRequest.creation_time).to.be.a('number');

    requestMessageHash = incomingRequest.request_message_hash;
  });

  it('IdP should create response (accept) successfully', async function() {
    this.timeout(10000);

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
      status: 'accept',
      secret: identity.accessors[0].secret,
      signature: createResponseSignature(
        identity.accessors[0].accessorPrivateKey,
        requestMessageHash
      ),
      accessor_id: identity.accessors[0].accessorId,
    });
    expect(response.status).to.equal(202);

    const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      reference_id: idpReferenceId,
      request_id: requestId,
      success: true,
    });
  });

  it('AS should receive data request', async function() {
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
    });
    expect(dataRequest.response_signature_list).to.have.lengthOf(1);
    expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is.not
      .empty;
  });

  it('AS should send data successfully', async function() {
    this.timeout(15000);
    const response = await asApi.sendData('as1', {
      requestId,
      serviceId: createRequestParams.data_request_list[0].service_id,
      reference_id: asReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      data: 'Test send data (disable namespace)',
    });
    expect(response.status).to.equal(202);

    const sendDataResult = await sendDataResultPromise.promise;
    expect(sendDataResult).to.deep.include({
      reference_id: asReferenceId,
      success: true,
    });
  });

  after(function() {
    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
    as1EventEmitter.removeAllListeners('callback');
  });
  
});
