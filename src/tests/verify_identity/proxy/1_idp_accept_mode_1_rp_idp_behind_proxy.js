import { expect } from 'chai';
import forge from 'node-forge';

import { proxy2Available } from '../..';
import * as rpApi from '../../../api/v2/rp';
import * as idpApi from '../../../api/v2/idp';
// import * as commonApi from '../../api/v2/common';
import {
  proxy1EventEmitter,
  proxy2EventEmitter,
} from '../../../callback_server';
import {
  createEventPromise,
  generateReferenceId,
  hashRequestMessageForConsent,
  createResponseSignature,
} from '../../../utils';
import * as config from '../../../config';

describe('1 IdP, accept consent, mode 1, RP (proxy2_rp5) and IDP (proxy1_idp4) behind proxy', function() {
  const idpNodeId = 'proxy1_idp4';

  let namespace;
  let identifier;

  const keypair = forge.pki.rsa.generateKeyPair(2048);
  const userPrivateKey = forge.pki.privateKeyToPem(keypair.privateKey);

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
    if (!proxy2Available) {
      this.test.parent.pending = true;
      this.skip();
    }

    namespace = 'cid';
    identifier = '1234567890123';

    createRequestParams = {
      node_id: 'proxy2_rp5',
      reference_id: rpReferenceId,
      callback_url: config.PROXY2_CALLBACK_URL,
      mode: 1,
      namespace,
      identifier,
      idp_id_list: [idpNodeId],
      data_request_list: [],
      request_message:
        'Test request message (mode 1) ทดสอบภาษาไทย should\\|be|able\\\\|to|send\\\\\\|this',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    };

    // RP
    proxy2EventEmitter.on('callback', function(callbackData) {
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

    // IdP
    proxy1EventEmitter.on('callback', function(callbackData) {
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
    const response = await rpApi.createRequest('proxy2', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

    requestId = responseBody.request_id;

    const createRequestResult = await createRequestResultPromise.promise;
    expect(createRequestResult).to.deep.include({
      node_id: createRequestParams.node_id,
      success: true,
    });
  });

  it('RP should receive pending request status', async function() {
    this.timeout(10000);
    const requestStatus = await requestStatusPendingPromise.promise;
    expect(requestStatus).to.deep.include({
      node_id: createRequestParams.node_id,
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

  it('IdP should receive incoming request callback', async function() {
    this.timeout(15000);
    const incomingRequest = await incomingRequestPromise.promise;
    expect(incomingRequest).to.deep.include({
      node_id: idpNodeId,
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
      requester_node_id: createRequestParams.node_id,
      min_ial: createRequestParams.min_ial,
      min_aal: createRequestParams.min_aal,
      data_request_list: createRequestParams.data_request_list,
    });
    expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
      .empty;
    expect(incomingRequest.creation_time).to.be.a('number');

    requestMessageSalt = incomingRequest.request_message_salt;
    requestMessageHash = incomingRequest.request_message_hash;
  });

  it('IdP should create response (accept) successfully', async function() {
    this.timeout(10000);
    const response = await idpApi.createResponse('proxy1', {
      node_id: idpNodeId,
      reference_id: idpReferenceId,
      callback_url: config.PROXY1_CALLBACK_URL,
      request_id: requestId,
      namespace: createRequestParams.namespace,
      identifier: createRequestParams.identifier,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      signature: createResponseSignature(userPrivateKey, requestMessageHash),
    });
    expect(response.status).to.equal(202);

    const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      node_id: idpNodeId,
      reference_id: idpReferenceId,
      request_id: requestId,
      success: true,
    });
  });

  it('RP should receive completed request status', async function() {
    this.timeout(15000);
    const requestStatus = await requestStatusCompletedPromise.promise;
    expect(requestStatus).to.deep.include({
      node_id: createRequestParams.node_id,
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
          idp_id: idpNodeId,
          valid_signature: null,
          valid_proof: null,
          valid_ial: null,
        },
      ],
    });
    expect(requestStatus).to.have.property('block_height');
    expect(requestStatus.block_height).is.a('number');
  });

  it('RP should receive request closed status', async function() {
    this.timeout(10000);
    const requestStatus = await requestClosedPromise.promise;
    expect(requestStatus).to.deep.include({
      node_id: createRequestParams.node_id,
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
          idp_id: idpNodeId,
          valid_signature: null,
          valid_proof: null,
          valid_ial: null,
        },
      ],
    });
    expect(requestStatus).to.have.property('block_height');
    expect(requestStatus.block_height).is.a('number');
  });

  it('RP should receive 3 request status updates', function() {
    expect(requestStatusUpdates).to.have.lengthOf(3);
  });

  after(function() {
    proxy1EventEmitter.removeAllListeners('callback');
    proxy2EventEmitter.removeAllListeners('callback');
  });
});