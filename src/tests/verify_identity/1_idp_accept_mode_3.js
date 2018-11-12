import { expect } from 'chai';

import * as rpApi from '../../api/v2/rp';
import * as idpApi from '../../api/v2/idp';
import * as commonApi from '../../api/v2/common';
import { rpEventEmitter, idp1EventEmitter } from '../../callback_server';
import * as db from '../../db';
import {
  createEventPromise,
  generateReferenceId,
  hashRequestMessageForConsent,
  createResponseSignature,
} from '../../utils';
import * as config from '../../config';

describe('1 IdP, accept consent, mode 3', function() {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise(); // RP
  const requestStatusPendingPromise = createEventPromise(); // RP
  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise(); // IDP
  const requestStatusCompletedPromise = createEventPromise(); // RP
  const requestClosedPromise = createEventPromise(); // RP

  const idp_requestStatusPendingPromise = createEventPromise();
  const idp_requestStatusCompletedPromise = createEventPromise();
  const idp_requestClosedPromise = createEventPromise();

  let createRequestParams;

  let requestId;
  let requestMessageSalt;
  let requestMessageHash;

  let lastStatusUpdateBlockHeight;

  const requestStatusUpdates = [];
  const idp_requestStatusUpdates = [];

  before(function() {
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
      data_request_list: [],
      request_message:
        'Test request message (mode 3) ทดสอบภาษาไทย should\\|be|able\\\\|to|send\\\\\\|this',
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
      } else if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === requestId
      ) {
        requestStatusUpdates.push(callbackData);
        if (callbackData.status === 'pending') {
          requestStatusPendingPromise.resolve(callbackData);
        } else if (callbackData.status === 'completed') {
          if (callbackData.closed) {
            requestClosedPromise.resolve(callbackData);
          } else {
            requestStatusCompletedPromise.resolve(callbackData);
          }
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
      } else if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === requestId
      ) {
        idp_requestStatusUpdates.push(callbackData);
        if (callbackData.status === 'pending') {
          idp_requestStatusPendingPromise.resolve(callbackData);
        } else if (callbackData.status === 'completed') {
          if (callbackData.closed) {
            idp_requestClosedPromise.resolve(callbackData);
          } else {
            idp_requestStatusCompletedPromise.resolve(callbackData);
          }
        }
      }
    });
  });

  it('RP should create a request successfully', async function() {
    this.timeout(10000);
    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

    requestId = responseBody.request_id;

    const createRequestResult = await createRequestResultPromise.promise;
    expect(createRequestResult.success).to.equal(true);
    expect(createRequestResult.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight = createRequestResult.creation_block_height.split(
      ':'
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    lastStatusUpdateBlockHeight = parseInt(splittedCreationBlockHeight[1]);
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
    expect(requestStatus.block_height).is.a('string');
    const splittedBlockHeight = requestStatus.block_height.split(':');
    expect(splittedBlockHeight).to.have.lengthOf(2);
    expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    expect(parseInt(splittedBlockHeight[1])).to.equal(
      lastStatusUpdateBlockHeight
    );
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
      request_timeout: createRequestParams.request_timeout,
    });
    expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
      .empty;
    expect(incomingRequest.creation_time).to.be.a('number');
    expect(incomingRequest.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
      ':'
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);

    requestMessageSalt = incomingRequest.request_message_salt;
    requestMessageHash = incomingRequest.request_message_hash;
  });

  // IdP may or may not get this request status callback
  // it('IdP should receive pending request status', async function() {
  //   this.timeout(10000);
  //   const requestStatus = await idp_requestStatusPendingPromise.promise;
  //   expect(requestStatus).to.deep.include({
  //     request_id: requestId,
  //     status: 'pending',
  //     mode: createRequestParams.mode,
  //     min_idp: createRequestParams.min_idp,
  //     answered_idp_count: 0,
  //     closed: false,
  //     timed_out: false,
  //     service_list: [],
  //     response_valid_list: [],
  //   });
  //   expect(requestStatus).to.have.property('block_height');
  //   expect(requestStatus.block_height).is.a('string');const splittedBlockHeight = requestStatus.block_height.split(':');expect(splittedBlockHeight).to.have.lengthOf(2);expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
  // });

  it('IdP should create response (accept) successfully', async function() {
    this.timeout(10000);
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

  it('RP should receive completed request status with valid proofs', async function() {
    this.timeout(15000);
    const requestStatus = await requestStatusCompletedPromise.promise;
    expect(requestStatus).to.deep.include({
      request_id: requestId,
      status: 'completed',
      mode: createRequestParams.mode,
      min_idp: createRequestParams.min_idp,
      answered_idp_count: 1,
      closed: false,
      timed_out: false,
      service_list: [],
      response_valid_list: [
        {
          idp_id: 'idp1',
          valid_signature: true,
          valid_proof: true,
          valid_ial: true,
        },
      ],
    });
    expect(requestStatus).to.have.property('block_height');
    expect(requestStatus.block_height).is.a('string');
    const splittedBlockHeight = requestStatus.block_height.split(':');
    expect(splittedBlockHeight).to.have.lengthOf(2);
    expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    expect(parseInt(splittedBlockHeight[1])).to.be.above(
      lastStatusUpdateBlockHeight
    );
    lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
  });

  it('IdP should receive completed request status without proofs', async function() {
    this.timeout(15000);
    const requestStatus = await idp_requestStatusCompletedPromise.promise;
    expect(requestStatus).to.deep.include({
      request_id: requestId,
      status: 'completed',
      mode: createRequestParams.mode,
      min_idp: createRequestParams.min_idp,
      answered_idp_count: 1,
      closed: false,
      timed_out: false,
      service_list: [],
      response_valid_list: [
        {
          idp_id: 'idp1',
          valid_signature: null,
          valid_proof: null,
          valid_ial: null,
        },
      ],
    });
    expect(requestStatus).to.have.property('block_height');
    expect(requestStatus.block_height).is.a('string');
    const splittedBlockHeight = requestStatus.block_height.split(':');
    expect(splittedBlockHeight).to.have.lengthOf(2);
    expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    expect(parseInt(splittedBlockHeight[1])).to.equal(
      lastStatusUpdateBlockHeight
    );
  });

  it('RP should receive request closed status', async function() {
    this.timeout(10000);
    const requestStatus = await requestClosedPromise.promise;
    expect(requestStatus).to.deep.include({
      request_id: requestId,
      status: 'completed',
      mode: createRequestParams.mode,
      min_idp: createRequestParams.min_idp,
      answered_idp_count: 1,
      closed: true,
      timed_out: false,
      service_list: [],
      response_valid_list: [
        {
          idp_id: 'idp1',
          valid_signature: true,
          valid_proof: true,
          valid_ial: true,
        },
      ],
    });
    expect(requestStatus).to.have.property('block_height');
    expect(requestStatus.block_height).is.a('string');
    const splittedBlockHeight = requestStatus.block_height.split(':');
    expect(splittedBlockHeight).to.have.lengthOf(2);
    expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    expect(parseInt(splittedBlockHeight[1])).to.be.above(
      lastStatusUpdateBlockHeight
    );
    lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
  });

  it('IdP should receive request closed status', async function() {
    this.timeout(10000);
    const requestStatus = await idp_requestClosedPromise.promise;
    expect(requestStatus).to.deep.include({
      request_id: requestId,
      status: 'completed',
      mode: createRequestParams.mode,
      min_idp: createRequestParams.min_idp,
      answered_idp_count: 1,
      closed: true,
      timed_out: false,
      service_list: [],
      response_valid_list: [
        {
          idp_id: 'idp1',
          valid_signature: true,
          valid_proof: true,
          valid_ial: true,
        },
      ],
    });
    expect(requestStatus).to.have.property('block_height');
    expect(requestStatus.block_height).is.a('string');
    const splittedBlockHeight = requestStatus.block_height.split(':');
    expect(splittedBlockHeight).to.have.lengthOf(2);
    expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    expect(parseInt(splittedBlockHeight[1])).to.equal(
      lastStatusUpdateBlockHeight
    );
  });

  it('RP should receive 3 request status updates', function() {
    expect(requestStatusUpdates).to.have.lengthOf(3);
  });

  it('IdP should receive 2 or 3 request status updates', function() {
    expect(idp_requestStatusUpdates).to.have.length.within(2, 3);
  });

  it('RP should have and able to get saved private messages', async function() {
    const response = await commonApi.getPrivateMessages('rp1', {
      request_id: requestId,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.be.an('array').that.is.not.empty;
  });

  it('RP should remove saved private messages successfully', async function() {
    const response = await commonApi.removePrivateMessages('rp1', {
      request_id: requestId,
    });
    expect(response.status).to.equal(204);
  });

  it('RP should have no saved private messages left after removal', async function() {
    const response = await commonApi.getPrivateMessages('rp1', {
      request_id: requestId,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.be.an('array').that.is.empty;
  });

  it('IdP should have and able to get saved private messages', async function() {
    const response = await commonApi.getPrivateMessages('idp1', {
      request_id: requestId,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.be.an('array').that.is.not.empty;
  });

  it('IdP should remove saved private messages successfully', async function() {
    const response = await commonApi.removePrivateMessages('idp1', {
      request_id: requestId,
    });
    expect(response.status).to.equal(204);
  });

  it('IdP should have no saved private messages left after removal', async function() {
    const response = await commonApi.getPrivateMessages('idp1', {
      request_id: requestId,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.be.an('array').that.is.empty;
  });

  after(function() {
    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
  });
});

describe('1 IdP, accept consent, mode 3 (without idp_id_list key and data_request_list key)', function() {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise(); // RP
  const requestStatusPendingPromise = createEventPromise(); // RP
  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise(); // IDP
  const requestStatusCompletedPromise = createEventPromise(); // RP
  const requestClosedPromise = createEventPromise(); // RP

  let createRequestParams;

  let requestId;
  let requestMessageSalt;
  let requestMessageHash;

  const requestStatusUpdates = [];

  before(function() {
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
      request_message:
        'Test request message (mode 3) ทดสอบภาษาไทย should\\|be|able\\\\|to|send\\\\\\|this',
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
      } else if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === requestId
      ) {
        requestStatusUpdates.push(callbackData);
        if (callbackData.status === 'pending') {
          requestStatusPendingPromise.resolve(callbackData);
        } else if (callbackData.status === 'completed') {
          if (callbackData.closed) {
            requestClosedPromise.resolve(callbackData);
          } else {
            requestStatusCompletedPromise.resolve(callbackData);
          }
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
  });

  it('RP should create a request successfully', async function() {
    this.timeout(10000);
    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

    requestId = responseBody.request_id;

    const createRequestResult = await createRequestResultPromise.promise;
    expect(createRequestResult.success).to.equal(true);
    expect(createRequestResult.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight = createRequestResult.creation_block_height.split(
      ':'
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
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
    expect(requestStatus.block_height).is.a('string');
    const splittedBlockHeight = requestStatus.block_height.split(':');
    expect(splittedBlockHeight).to.have.lengthOf(2);
    expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
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
      data_request_list: [], //createRequestParams.data_request_list,
      request_timeout: createRequestParams.request_timeout,
    });
    expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
      .empty;
    expect(incomingRequest.creation_time).to.be.a('number');
    expect(incomingRequest.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
      ':'
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);

    requestMessageSalt = incomingRequest.request_message_salt;
    requestMessageHash = incomingRequest.request_message_hash;
  });

  it('IdP should create response (accept) successfully', async function() {
    this.timeout(10000);
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

  it('RP should receive completed request status with valid proofs', async function() {
    this.timeout(15000);
    const requestStatus = await requestStatusCompletedPromise.promise;
    expect(requestStatus).to.deep.include({
      request_id: requestId,
      status: 'completed',
      mode: createRequestParams.mode,
      min_idp: createRequestParams.min_idp,
      answered_idp_count: 1,
      closed: false,
      timed_out: false,
      service_list: [],
      response_valid_list: [
        {
          idp_id: 'idp1',
          valid_signature: true,
          valid_proof: true,
          valid_ial: true,
        },
      ],
    });
    expect(requestStatus).to.have.property('block_height');
    expect(requestStatus.block_height).is.a('string');
    const splittedBlockHeight = requestStatus.block_height.split(':');
    expect(splittedBlockHeight).to.have.lengthOf(2);
    expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('RP should receive request closed status', async function() {
    this.timeout(10000);
    const requestStatus = await requestClosedPromise.promise;
    expect(requestStatus).to.deep.include({
      request_id: requestId,
      status: 'completed',
      mode: createRequestParams.mode,
      min_idp: createRequestParams.min_idp,
      answered_idp_count: 1,
      closed: true,
      timed_out: false,
      service_list: [],
      response_valid_list: [
        {
          idp_id: 'idp1',
          valid_signature: true,
          valid_proof: true,
          valid_ial: true,
        },
      ],
    });
    expect(requestStatus).to.have.property('block_height');
    expect(requestStatus.block_height).is.a('string');
    const splittedBlockHeight = requestStatus.block_height.split(':');
    expect(splittedBlockHeight).to.have.lengthOf(2);
    expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('RP should receive 3 request status updates', function() {
    expect(requestStatusUpdates).to.have.lengthOf(3);
  });

  it('RP should have and able to get saved private messages', async function() {
    const response = await commonApi.getPrivateMessages('rp1', {
      request_id: requestId,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.be.an('array').that.is.not.empty;
  });

  it('RP should remove saved private messages successfully', async function() {
    const response = await commonApi.removePrivateMessages('rp1', {
      request_id: requestId,
    });
    expect(response.status).to.equal(204);
  });

  it('RP should have no saved private messages left after removal', async function() {
    const response = await commonApi.getPrivateMessages('rp1', {
      request_id: requestId,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.be.an('array').that.is.empty;
  });

  it('IdP should have and able to get saved private messages', async function() {
    const response = await commonApi.getPrivateMessages('idp1', {
      request_id: requestId,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.be.an('array').that.is.not.empty;
  });

  it('IdP should remove saved private messages successfully', async function() {
    const response = await commonApi.removePrivateMessages('idp1', {
      request_id: requestId,
    });
    expect(response.status).to.equal(204);
  });

  it('IdP should have no saved private messages left after removal', async function() {
    const response = await commonApi.getPrivateMessages('idp1', {
      request_id: requestId,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.be.an('array').that.is.empty;
  });

  after(function() {
    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
  });
});
