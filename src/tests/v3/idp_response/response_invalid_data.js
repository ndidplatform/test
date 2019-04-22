import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import * as rpApi from '../../../api/v3/rp';
import * as idpApi from '../../../api/v3/idp';
// import * as commonApi from '../../api/v2/common';
import { rpEventEmitter, idp1EventEmitter } from '../../../callback_server';
import * as db from '../../../db';
import {
  createEventPromise,
  generateReferenceId,
  createResponseSignature,
} from '../../../utils';
import * as config from '../../../config';
import { idp2Available } from '../..';

/* ============================== MOVE TO ./error_response =================================
describe('IdP response invalid ial test', function() {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();

  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise(); // IDP
  const requestStatusConfirmedPromise = createEventPromise(); // RP

  let createRequestParams;

  let requestId;
  let requestMessageHash;

  before(async function() {
    this.timeout(20000);
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
      request_message: 'Test request message (IdP response invalid ial mode 3)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    };

    rpEventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === requestId
      ) {
        if (callbackData.status === 'confirmed') {
          requestStatusConfirmedPromise.resolve(callbackData);
        }
      }
    });

    idp1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId
      ) {
        incomingRequestPromise.resolve(callbackData);
      } else if (callbackData.type === 'response_result') {
        responseResultPromise.resolve(callbackData);
      }
    });

    const responseRp = await rpApi.createRequest('rp1', createRequestParams);
    const responseBodyRp = await responseRp.json();
    requestId = responseBodyRp.request_id;

    const incomingRequest = await incomingRequestPromise.promise;
    requestMessageHash = incomingRequest.request_message_hash;
  });

  it("IdP should create response (accept) with invalid ial (ial less than identity's ial) successfully", async function() {
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
      ial: 1.1,
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

    const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      reference_id: idpReferenceId,
      request_id: requestId,
      success: true,
    });
  });

  it('RP should receive confirmed request status with valid_ial = false', async function() {
    this.timeout(20000);
    const requestStatus = await requestStatusConfirmedPromise.promise;
    expect(requestStatus).to.deep.include({
      request_id: requestId,
      status: 'confirmed',
      mode: createRequestParams.mode,
      min_idp: createRequestParams.min_idp,
      answered_idp_count: 1,
      closed: false,
      timed_out: false,
      service_list: [
        {
          service_id: createRequestParams.data_request_list[0].service_id,
          min_as: createRequestParams.data_request_list[0].min_as,
          signed_data_count: 0,
          received_data_count: 0,
        },
      ],
      response_valid_list: [
        {
          idp_id: 'idp1',
          valid_signature: true,
          valid_proof: true,
          valid_ial: false,
        },
      ],
    });
    expect(requestStatus).to.have.property('block_height');
    expect(requestStatus.block_height).is.a('string');const splittedBlockHeight = requestStatus.block_height.split(':');expect(splittedBlockHeight).to.have.lengthOf(2);expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  after(async function() {
    await rpApi.closeRequest('rp1', {
      reference_id: uuidv4(),
      callback_url: config.RP_CALLBACK_URL,
      request_id: requestId,
    });
    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
  });
});

describe('IdP response invalid secret test', function() {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();

  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise(); // IDP
  const requestStatusConfirmedPromise = createEventPromise(); // RP

  let createRequestParams;

  let requestId;
  let requestMessageHash;

  before(async function() {
    this.timeout(20000);
    if (!idp2Available) {
      this.skip();
    }
    if (db.idp1Identities[0] == null || db.idp2Identities[0] == null) {
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
      request_message:
        'Test request message (IdP response invalid secret mode 3)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    };

    rpEventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === requestId
      ) {
        if (callbackData.status === 'confirmed') {
          requestStatusConfirmedPromise.resolve(callbackData);
        }
      }
    });

    idp1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId
      ) {
        incomingRequestPromise.resolve(callbackData);
      } else if (callbackData.type === 'response_result') {
        responseResultPromise.resolve(callbackData);
      }
    });

    const responseRp = await rpApi.createRequest('rp1', createRequestParams);
    const responseBodyRp = await responseRp.json();
    requestId = responseBodyRp.request_id;

    const incomingRequest = await incomingRequestPromise.promise;
    requestMessageHash = incomingRequest.request_message_hash;
  });

  it('IdP should create response (accept) with invalid secret successfully', async function() {
    this.timeout(20000);
    const identity = db.idp1Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    const identityIdP2 = db.idp2Identities.find(
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
      secret: identityIdP2.accessors[0].secret,
      status: 'accept',
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

  it('RP should receive confirmed request status with valid_proof = false', async function() {
    this.timeout(20000);
    const requestStatus = await requestStatusConfirmedPromise.promise;
    expect(requestStatus).to.deep.include({
      request_id: requestId,
      status: 'confirmed',
      mode: createRequestParams.mode,
      min_idp: createRequestParams.min_idp,
      answered_idp_count: 1,
      closed: false,
      timed_out: false,
      service_list: [
        {
          service_id: createRequestParams.data_request_list[0].service_id,
          min_as: createRequestParams.data_request_list[0].min_as,
          signed_data_count: 0,
          received_data_count: 0,
        },
      ],
      response_valid_list: [
        {
          idp_id: 'idp1',
          valid_signature: true,
          valid_proof: false,
          valid_ial: true,
        },
      ],
    });
    expect(requestStatus).to.have.property('block_height');
    expect(requestStatus.block_height).is.a('string');const splittedBlockHeight = requestStatus.block_height.split(':');expect(splittedBlockHeight).to.have.lengthOf(2);expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  after(async function() {
    await rpApi.closeRequest('rp1', {
      reference_id: uuidv4(),
      callback_url: config.RP_CALLBACK_URL,
      request_id: requestId,
    });
    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
  });
});*/
