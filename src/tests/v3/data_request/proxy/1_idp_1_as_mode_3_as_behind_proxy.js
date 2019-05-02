import { expect } from 'chai';

import * as rpApi from '../../../../api/v3/rp';
import * as idpApi from '../../../../api/v3/idp';
import * as asApi from '../../../../api/v3/as';
import * as commonApi from '../../../../api/v3/common';
import {
  rpEventEmitter,
  idp1EventEmitter,
  proxy1EventEmitter,
} from '../../../../callback_server';
import * as db from '../../../../db';
import {
  createEventPromise,
  generateReferenceId,
  hash,
} from '../../../../utils';
import * as config from '../../../../config';

describe('1 IdP, 1 AS, mode 3, AS (proxy1_as4) behind proxy', function() {
  const asNodeId = 'proxy1_as4';

  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const asReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise(); // RP
  const requestStatusPendingPromise = createEventPromise(); // RP
  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise(); // IDP
  const accessorEncryptPromise = createEventPromise(); // IDP
  const requestStatusConfirmedPromise = createEventPromise(); // RP
  const dataRequestReceivedPromise = createEventPromise(); // AS
  const sendDataResultPromise = createEventPromise(); // AS
  const requestStatusSignedDataPromise = createEventPromise(); // RP
  const requestStatusCompletedPromise = createEventPromise(); // RP
  const requestClosedPromise = createEventPromise(); // RP

  let createRequestParams;
  const data = JSON.stringify({
    test: 'test',
    withEscapedChar: 'test|fff||ss\\|NN\\\\|',
    arr: [1, 2, 3],
  });

  let requestId;
  let requestMessageSalt;
  let requestMessageHash;
  let responseAccessorId;

  const requestStatusUpdates = [];

  before(function() {
    let identity = db.idp1Identities.find(identity => identity.mode === 3);

    if (!identity) {
      throw new Error('No created identity to use');
    }

    namespace = identity.namespace;
    identifier = identity.identifier;

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
          as_id_list: [asNodeId],
          min_as: 1,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
      ],
      request_message: 'Test request message (data request) (mode 3)',
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
        } else if (callbackData.status === 'confirmed') {
          if (callbackData.service_list[0].signed_data_count === 1) {
            requestStatusSignedDataPromise.resolve(callbackData);
          } else {
            requestStatusConfirmedPromise.resolve(callbackData);
          }
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
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.reference_id === idpReferenceId
      ) {
        responseResultPromise.resolve(callbackData);
      }
    });

    idp1EventEmitter.on('accessor_encrypt_callback', function(callbackData) {
      if (callbackData.request_id === requestId) {
        accessorEncryptPromise.resolve(callbackData);
      }
    });

    proxy1EventEmitter.on('callback', function(callbackData) {
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
      service_list: [
        {
          service_id: createRequestParams.data_request_list[0].service_id,
          min_as: createRequestParams.data_request_list[0].min_as,
          signed_data_count: 0,
          received_data_count: 0,
        },
      ],
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

    const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
      dataRequest => {
        const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
        return {
          ...dataRequestWithoutParams,
        };
      }
    );
    expect(incomingRequest).to.deep.include({
      mode: createRequestParams.mode,
      request_id: requestId,
      request_message: createRequestParams.request_message,
      request_message_hash: hash(
        createRequestParams.request_message +
          incomingRequest.request_message_salt
      ),
      requester_node_id: 'rp1',
      min_ial: createRequestParams.min_ial,
      min_aal: createRequestParams.min_aal,
      data_request_list: dataRequestListWithoutParams,
      request_timeout: createRequestParams.request_timeout,
    });
    expect(incomingRequest.reference_group_code).to.be.a('string').that.is.not
      .empty;
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
      identity =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    responseAccessorId = identity.accessors[0].accessorId;

    const response = await idpApi.createResponse('idp1', {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      accessor_id: responseAccessorId,
    });
    expect(response.status).to.equal(202);
  });

  it('IdP should receive accessor encrypt callback with correct data', async function() {
    this.timeout(15000);

    const accessorEncryptParams = await accessorEncryptPromise.promise;
    expect(accessorEncryptParams).to.deep.include({
      node_id: 'idp1',
      type: 'accessor_encrypt',
      accessor_id: responseAccessorId,
      key_type: 'RSA',
      padding: 'none',
      reference_id: idpReferenceId,
      request_id: requestId,
    });

    expect(accessorEncryptParams.request_message_padded_hash).to.be.a('string')
      .that.is.not.empty;
  });

  it('IdP shoud receive callback create response result with success = true', async function() {
    const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      node_id: 'idp1',
      type: 'response_result',
      reference_id: idpReferenceId,
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

  it('AS should receive data request', async function() {
    this.timeout(15000);
    const dataRequest = await dataRequestReceivedPromise.promise;
    expect(dataRequest).to.deep.include({
      node_id: asNodeId,
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

  it('AS should send data successfully', async function() {
    this.timeout(15000);
    const response = await asApi.sendData('proxy1', {
      node_id: asNodeId,
      requestId,
      serviceId: createRequestParams.data_request_list[0].service_id,
      reference_id: asReferenceId,
      callback_url: config.PROXY1_CALLBACK_URL,
      data,
    });
    expect(response.status).to.equal(202);

    const sendDataResult = await sendDataResultPromise.promise;
    expect(sendDataResult).to.deep.include({
      node_id: asNodeId,
      reference_id: asReferenceId,
      success: true,
    });
  });

  it('RP should receive request status with signed data count = 1', async function() {
    this.timeout(15000);
    const requestStatus = await requestStatusSignedDataPromise.promise;
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
          signed_data_count: 1,
          received_data_count: 0,
        },
      ],
      response_valid_list: [
        {
          idp_id: 'idp1',
          valid_signature: true,
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

  it('RP should receive completed request status with received data count = 1', async function() {
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
      service_list: [
        {
          service_id: createRequestParams.data_request_list[0].service_id,
          min_as: createRequestParams.data_request_list[0].min_as,
          signed_data_count: 1,
          received_data_count: 1,
        },
      ],
      response_valid_list: [
        {
          idp_id: 'idp1',
          valid_signature: true,
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
      service_list: [
        {
          service_id: createRequestParams.data_request_list[0].service_id,
          min_as: createRequestParams.data_request_list[0].min_as,
          signed_data_count: 1,
          received_data_count: 1,
        },
      ],
      response_valid_list: [
        {
          idp_id: 'idp1',
          valid_signature: true,
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

  it('RP should get the correct data received from AS', async function() {
    const response = await rpApi.getDataFromAS('rp1', {
      requestId,
    });
    const dataArr = await response.json();
    expect(response.status).to.equal(200);

    expect(dataArr).to.have.lengthOf(1);
    expect(dataArr[0]).to.deep.include({
      source_node_id: asNodeId,
      service_id: createRequestParams.data_request_list[0].service_id,
      signature_sign_method: 'RSA-SHA256',
      data,
    });
    expect(dataArr[0].source_signature).to.be.a('string').that.is.not.empty;
    expect(dataArr[0].data_salt).to.be.a('string').that.is.not.empty;
  });

  it('RP should receive 5 request status updates', function() {
    expect(requestStatusUpdates).to.have.lengthOf(5);
  });

  it('RP should remove data requested from AS successfully', async function() {
    const response = await rpApi.removeDataRequestedFromAS('rp1', {
      request_id: requestId,
    });
    expect(response.status).to.equal(204);
  });

  it('RP should have no saved data requested from AS left after removal', async function() {
    const response = await rpApi.getDataFromAS('rp1', {
      requestId,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.be.an('array').that.is.empty;
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

  it('AS should have and able to get saved private messages', async function() {
    const response = await commonApi.getPrivateMessages('proxy1', {
      request_id: requestId,
      node_id: 'proxy1_as4',
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.be.an('array').that.is.not.empty;
  });

  it('AS should remove saved private messages successfully', async function() {
    const response = await commonApi.removePrivateMessages('proxy1', {
      request_id: requestId,
      node_id: 'proxy1_as4',
    });
    expect(response.status).to.equal(204);
  });

  it('AS should have no saved private messages left after removal', async function() {
    const response = await commonApi.getPrivateMessages('proxy1', {
      request_id: requestId,
      node_id: 'proxy1_as4',
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.be.an('array').that.is.empty;
  });

  after(function() {
    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
    proxy1EventEmitter.removeAllListeners('callback');
  });
});