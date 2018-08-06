import { expect } from 'chai';

import * as rpApi from '../../api/v2/rp';
import * as idpApi from '../../api/v2/idp';
// import * as commonApi from '../../api/v2/common';
import { idp1EventEmitter } from '../../callback_server';
import * as db from '../../db';
import {
  createEventPromise,
  generateReferenceId,
  createResponseSignature,
} from '../../utils';
import * as config from '../../config';

describe('IdP response errors', function() {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();

  const incomingRequestPromise = createEventPromise(); // IDP

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
    };

    idp1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId
      ) {
        incomingRequestPromise.resolve(callbackData);
      }
    });

    const responseRp = await rpApi.createRequest('rp1', createRequestParams);
    const responseBodyRp = await responseRp.json();
    requestId = responseBodyRp.request_id;

    const incomingRequest = await incomingRequestPromise.promise;
    requestMessageHash = incomingRequest.request_message_hash;
  });

  it('should get an error when making a response with non-existent request ID', async function() {
    const identity = db.idp1Identities.find(
      (identity) =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    const response = await idpApi.createResponse('idp1', {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: 'some-non-existent-request-id',
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
    expect(responseBody.error.code).to.equal(20012);
  });

  it('should get an error when making a response without accessor ID (mode 3)', async function() {
    const identity = db.idp1Identities.find(
      (identity) =>
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
      // accessor_id: identity.accessors[0].accessorId,
    });
    const responseBody = await response.json();

    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20014);
  });

  it('should get an error when making a response without secret (mode 3)', async function() {
    const identity = db.idp1Identities.find(
      (identity) =>
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
      // secret: identity.accessors[0].secret,
      status: 'accept',
      signature: createResponseSignature(
        identity.accessors[0].accessorPrivateKey,
        requestMessageHash
      ),
      accessor_id: identity.accessors[0].accessorId,
    });
    const responseBody = await response.json();

    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20015);
  });

  it('should get an error when making a response with non-existent accessor ID (mode 3)', async function() {
    const identity = db.idp1Identities.find(
      (identity) =>
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
      accessor_id: 'invalid-accessor-id',
    });
    const responseBody = await response.json();

    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20011);
  });

  it('should get an error when making a response with invalid accessor signature (mode 3)', async function() {
    const identity = db.idp1Identities.find(
      (identity) =>
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
      signature: 'some-invalid-signature',
      accessor_id: identity.accessors[0].accessorId,
    });
    const responseBody = await response.json();

    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20028);
  });

  after(function() {
    idp1EventEmitter.removeAllListeners('callback');
  });
});
