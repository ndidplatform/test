import { expect } from 'chai';
import { idp2Available } from '..';
import * as rpApi from '../../api/v2/rp';
import * as idpApi from '../../api/v2/idp';

import {
  rpEventEmitter,
  idp1EventEmitter,
  idp2EventEmitter,
} from '../../callback_server';
import * as db from '../../db';
import {
  createEventPromise,
  generateReferenceId,
  hash,
  createSignature,
} from '../../utils';
import * as config from '../../config';

describe('2 IdPs, min_idp = 2, 1 IdP accept consent and 1 IdP reject consent mode 3', function() {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idp1ReferenceId = generateReferenceId();
  const idp2ReferenceId = generateReferenceId();
  const rpCloseRequestReferenceId = generateReferenceId();
  
  const createRequestResultPromise = createEventPromise(); // RP
  const requestStatusPendingPromise = createEventPromise(); // RP
  const idp1IncomingRequestPromise = createEventPromise(); // IdP-1
  const idp1ResponseResultPromise = createEventPromise(); // IdP-1
  const idp2IncomingRequestPromise = createEventPromise(); // IdP-2
  const idp2ResponseResultPromise = createEventPromise(); // IdP-2
  const requestStatusConfirmedPromise = createEventPromise(); // RP
  const requestStatusComplicatedPromise = createEventPromise(); // RP
  const closeRequestResultPromise = createEventPromise(); // RP
  const requestClosedPromise = createEventPromise(); // RP

  let createRequestParams;

  let requestId;
  let requestMessageSalt;

  const requestStatusUpdates = [];

  before(function() {
    if (!idp2Available) {
      this.skip();
    }
    if (db.idp1Identities[0] == null) {
      throw new Error('No created identity to use on IdP-1');
    }
    if (db.idp2Identities[0] == null) {
      throw new Error('No created identity to use on IdP-2');
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
      data_request_list: [],
      request_message: 'Test request message (2 IdPs) (mode 3)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 2,
      request_timeout: 86400,
    };

    rpEventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'create_request_result' &&
        callbackData.reference_id === rpReferenceId
      ) {
        createRequestResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === requestId
      ) {
        requestStatusUpdates.push(callbackData);
        if (callbackData.status === 'pending') {
          requestStatusPendingPromise.resolve(callbackData);
        } else if (callbackData.status === 'confirmed') {
          requestStatusConfirmedPromise.resolve(callbackData);
        } else if (callbackData.status === 'complicated') {
          if (callbackData.closed) {
            requestClosedPromise.resolve(callbackData);
          } else {
            requestStatusComplicatedPromise.resolve(callbackData);
          }
        }
      } else if (
        callbackData.type === 'close_request_result' &&
        callbackData.reference_id === rpCloseRequestReferenceId
      ) {
        closeRequestResultPromise.resolve(callbackData);
      }
    });

    idp1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId
      ) {
        idp1IncomingRequestPromise.resolve(callbackData);
      } else if (callbackData.type === 'response_result') {
        idp1ResponseResultPromise.resolve(callbackData);
      }
    });

    idp2EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId
      ) {
        idp2IncomingRequestPromise.resolve(callbackData);
      } else if (callbackData.type === 'response_result') {
        idp2ResponseResultPromise.resolve(callbackData);
      }
    });
  });

  it('RP should create a request successfully', async function() {
    this.timeout(10000);
    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;

    requestId = responseBody.request_id;

    const createRequestResult = await createRequestResultPromise.promise;
    expect(createRequestResult.success).to.equal(true);
  });

  it('RP should receive pending request status', async function() {
    this.timeout(10000);
    const requestStatus = await requestStatusPendingPromise.promise;
    expect(requestStatus).to.deep.include({
      request_id: requestId,
      status: 'pending',
      mode: createRequestParams.mode,
      min_idp: createRequestParams.min_idp,
      answered_idp_count: 0,
      closed: false,
      timed_out: false,
      service_list: [],
      response_valid_list: [],
    });
    expect(requestStatus).to.have.property('block_height');
    expect(requestStatus.block_height).is.a('number');
  });

  it('IdP-1 should receive incoming request callback', async function() {
    this.timeout(15000);
    const incomingRequest = await idp1IncomingRequestPromise.promise;
    expect(incomingRequest).to.deep.include({
      mode: createRequestParams.mode,
      request_id: requestId,
      namespace: createRequestParams.namespace,
      identifier: createRequestParams.identifier,
      request_message: createRequestParams.request_message,
      request_message_hash: hash(
        createRequestParams.request_message +
          incomingRequest.request_message_salt
      ),
      requester_node_id: 'rp1',
      min_ial: createRequestParams.min_ial,
      min_aal: createRequestParams.min_aal,
      data_request_list: createRequestParams.data_request_list,
    });
    expect(incomingRequest.request_message_hash).to.be.a('string').that.is.not
      .empty;

    requestMessageSalt = incomingRequest.request_message_salt;
  });

  it('IdP-2 should receive incoming request callback', async function() {
    this.timeout(15000);
    const incomingRequest = await idp2IncomingRequestPromise.promise;
    expect(incomingRequest).to.deep.include({
      mode: createRequestParams.mode,
      request_id: requestId,
      namespace: createRequestParams.namespace,
      identifier: createRequestParams.identifier,
      request_message: createRequestParams.request_message,
      request_message_hash: hash(
        createRequestParams.request_message +
          incomingRequest.request_message_salt
      ),
      requester_node_id: 'rp1',
      min_ial: createRequestParams.min_ial,
      min_aal: createRequestParams.min_aal,
      data_request_list: createRequestParams.data_request_list,
    });
    expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
      .empty;

    requestMessageSalt = incomingRequest.request_message_salt;
  });

  it('IdP-1 should create response (accept) successfully', async function() {
    this.timeout(10000);
    const identity = db.idp1Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    const response = await idpApi.createResponse('idp1', {
      reference_id: idp1ReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      namespace: createRequestParams.namespace,
      identifier: createRequestParams.identifier,
      ial: 2.3,
      aal: 3,
      secret: identity.accessors[0].secret,
      status: 'accept',
      signature: createSignature(
        identity.accessors[0].accessorPrivateKey,
        createRequestParams.request_message + requestMessageSalt
      ),
      accessor_id: identity.accessors[0].accessorId,
    });
    expect(response.status).to.equal(202);

    const responseResult = await idp1ResponseResultPromise.promise;
    expect(responseResult).to.deep.include({
      reference_id: idp1ReferenceId,
      request_id: requestId,
      success: true,
    });
  });

  it('RP should receive confirmed request status with valid proofs', async function() {
    this.timeout(15000);
    const requestStatus = await requestStatusConfirmedPromise.promise;
    expect(requestStatus).to.deep.include({
      request_id: requestId,
      status: 'confirmed',
      mode: createRequestParams.mode,
      min_idp: createRequestParams.min_idp,
      answered_idp_count: 1,
      closed: false,
      timed_out: false,
      service_list: [],
      response_valid_list: [
        { idp_id: 'idp1', valid_proof: true, valid_ial: true },
      ],
    });
    expect(requestStatus).to.have.property('block_height');
    expect(requestStatus.block_height).is.a('number');
  });

  it('IdP-2 should create response (reject) successfully', async function() {
    this.timeout(10000);
    const identity = db.idp2Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    const response = await idpApi.createResponse('idp2', {
      reference_id: idp2ReferenceId,
      callback_url: config.IDP2_CALLBACK_URL,
      request_id: requestId,
      namespace: createRequestParams.namespace,
      identifier: createRequestParams.identifier,
      ial: 2.3,
      aal: 3,
      secret: identity.accessors[0].secret,
      status: 'reject',
      signature: createSignature(
        identity.accessors[0].accessorPrivateKey,
        createRequestParams.request_message + requestMessageSalt
      ),
      accessor_id: identity.accessors[0].accessorId,
    });
    expect(response.status).to.equal(202);

    const responseResult = await idp2ResponseResultPromise.promise;
    expect(responseResult).to.deep.include({
      reference_id: idp2ReferenceId,
      request_id: requestId,
      success: true,
    });
  });

  it('RP should receive complicated request status with valid proofs', async function() {
    this.timeout(15000);
    const requestStatus = await requestStatusComplicatedPromise.promise;
    expect(requestStatus).to.deep.include({
      request_id: requestId,
      status: 'complicated',
      mode: createRequestParams.mode,
      min_idp: createRequestParams.min_idp,
      answered_idp_count: 2,
      closed: false,
      timed_out: false,
      service_list: [],
      response_valid_list: [
        { idp_id: 'idp1', valid_proof: true, valid_ial: true },
        { idp_id: 'idp2', valid_proof: true, valid_ial: true },
      ],
    });
    expect(requestStatus).to.have.property('block_height');
    expect(requestStatus.block_height).is.a('number');
  });

  it('RP should be able to close request', async function() {
    this.timeout(10000);
    const response = await rpApi.closeRequest('rp1', {
      reference_id: rpCloseRequestReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      request_id: requestId,
    });
    expect(response.status).to.equal(202);
    const closeRequestResult = await closeRequestResultPromise.promise;
    expect(closeRequestResult.success).to.equal(true);
  });

  it('RP should receive request closed status', async function() {
    this.timeout(10000);
    const requestStatus = await requestClosedPromise.promise;
    expect(requestStatus).to.deep.include({
      request_id: requestId,
      status: 'complicated',
      mode: createRequestParams.mode,
      min_idp: createRequestParams.min_idp,
      answered_idp_count: 2,
      closed: true,
      timed_out: false,
      service_list: [],
      response_valid_list: [
        { idp_id: 'idp1', valid_proof: true, valid_ial: true },
        { idp_id: 'idp2', valid_proof: true, valid_ial: true },
      ],
    });
    expect(requestStatus).to.have.property('block_height');
    expect(requestStatus.block_height).is.a('number');
  });

  it('RP should receive 4 request status updates', function() {
    expect(requestStatusUpdates).to.have.lengthOf(4);
  });

  after(function() {
    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
    idp2EventEmitter.removeAllListeners('callback');
  });
});
