import { expect } from 'chai';

import * as rpApi from '../../api/v2/rp';
import * as idpApi from '../../api/v2/idp';
import * as asApi from '../../api/v2/as';
import * as commonApi from '../../api/v2/common';
import { idp2Available } from '..';
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
  hashRequestMessageForConsent,
  createResponseSignature,
} from '../../utils';
import * as config from '../../config';

describe('2 IdP (min_idp = 2), 1 AS, mode 3', function() {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const idp2ReferenceId = generateReferenceId();
  const asReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise(); // RP
  const requestStatusPendingPromise = createEventPromise(); // RP
  const idp1IncomingRequestPromise = createEventPromise(); // IDP
  const idp1ResponseResultPromise = createEventPromise(); // IDP
  const idp2IncomingRequestPromise = createEventPromise(); // IDP
  const idp2ResponseResultPromise = createEventPromise(); // IDP
  // const answer1RequestStatusConfirmedPromise = createEventPromise(); // RP
  const answer2RequestStatusConfirmedPromise = createEventPromise(); // RP
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

  //const requestStatusUpdates = [];

  before(function() {
    if (!idp2Available) {
      this.test.parent.pending = true;
      this.skip();
    }
    if (db.idp1Identities[0] == null || db.idp2Identities[0] == null) {
      throw new Error('No created idp1Identity to use');
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
        'Test request message (data request min_idp = 2) (mode 3)',
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
        // requestStatusUpdates.push(callbackData);
        if (callbackData.status === 'pending') {
          requestStatusPendingPromise.resolve(callbackData);
        } else if (callbackData.status === 'confirmed') {
          if (callbackData.service_list[0].signed_data_count === 1) {
            requestStatusSignedDataPromise.resolve(callbackData);
          } else {
            if (callbackData.answered_idp_count === 1) {
              // answer1RequestStatusConfirmedPromise.resolve(callbackData);
            } else if (callbackData.answered_idp_count === 2) {
              answer2RequestStatusConfirmedPromise.resolve(callbackData);
            }
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
        idp1IncomingRequestPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.reference_id === idpReferenceId
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
        callbackData.reference_id === idp2ReferenceId
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
  });

  it('RP should create a request successfully', async function() {
    this.timeout(10000);
    const idp1Response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await idp1Response.json();
    expect(idp1Response.status).to.equal(202);
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

  it('Both IdP (idp1 and idp2) should receive incoming request callback', async function() {
    this.timeout(20000);
    const idp1IncomingRequest = await idp1IncomingRequestPromise.promise;
    const idp2IncomingRequest = await idp2IncomingRequestPromise.promise;

    const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
      (dataRequest) => {
        const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
        return {
          ...dataRequestWithoutParams,
        };
      }
    );

    expect(idp1IncomingRequest).to.deep.include({
      mode: createRequestParams.mode,
      request_id: requestId,
      namespace: createRequestParams.namespace,
      identifier: createRequestParams.identifier,
      request_message: createRequestParams.request_message,
      request_message_hash: hashRequestMessageForConsent(
        createRequestParams.request_message,
        idp1IncomingRequest.initial_salt,
        requestId
      ),
      requester_node_id: 'rp1',
      min_ial: createRequestParams.min_ial,
      min_aal: createRequestParams.min_aal,
      data_request_list: dataRequestListWithoutParams,
      request_timeout: createRequestParams.request_timeout,
    });
    expect(idp1IncomingRequest.request_message_salt).to.be.a('string').that.is
      .not.empty;
    expect(idp1IncomingRequest.creation_time).to.be.a('number');
    expect(idp1IncomingRequest.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight_idp1 = idp1IncomingRequest.creation_block_height.split(
      ':'
    );
    expect(splittedCreationBlockHeight_idp1).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight_idp1[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight_idp1[1]).to.have.lengthOf.at.least(1);

    expect(idp2IncomingRequest).to.deep.include({
      mode: createRequestParams.mode,
      request_id: requestId,
      namespace: createRequestParams.namespace,
      identifier: createRequestParams.identifier,
      request_message: createRequestParams.request_message,
      request_message_hash: hashRequestMessageForConsent(
        createRequestParams.request_message,
        idp2IncomingRequest.initial_salt,
        requestId
      ),
      requester_node_id: 'rp1',
      min_ial: createRequestParams.min_ial,
      min_aal: createRequestParams.min_aal,
      data_request_list: dataRequestListWithoutParams,
      request_timeout: createRequestParams.request_timeout,
    });
    expect(idp2IncomingRequest.request_message_salt).to.be.a('string').that.is
      .not.empty;
    expect(idp2IncomingRequest.creation_time).to.be.a('number');
    expect(idp2IncomingRequest.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight_idp2 = idp2IncomingRequest.creation_block_height.split(
      ':'
    );
    expect(splittedCreationBlockHeight_idp2).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight_idp2[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight_idp2[1]).to.have.lengthOf.at.least(1);

    requestMessageSalt = idp1IncomingRequest.request_message_salt;
    requestMessageHash = idp1IncomingRequest.request_message_hash;
  });

  it('Both IdP (idp1 and idp2) should create idp1Response (accept) successfully', async function() {
    this.timeout(20000);
    const idp1Identity = db.idp1Identities.find(
      (idp1Identity) =>
        idp1Identity.namespace === namespace &&
        idp1Identity.identifier === identifier
    );
    const idp2Identity = db.idp2Identities.find(
      (idp2Identity) =>
        idp2Identity.namespace === namespace &&
        idp2Identity.identifier === identifier
    );

    //idp1 and idp2 create response at the same time (not use await)
    const idp1Response = idpApi.createResponse('idp1', {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      namespace: createRequestParams.namespace,
      identifier: createRequestParams.identifier,
      ial: 2.3,
      aal: 3,
      secret: idp1Identity.accessors[0].secret,
      status: 'accept',
      signature: createResponseSignature(
        idp1Identity.accessors[0].accessorPrivateKey,
        requestMessageHash
      ),
      accessor_id: idp1Identity.accessors[0].accessorId,
    });
    //expect(idp1Response.status).to.equal(202);

    const idp2Response = idpApi.createResponse('idp2', {
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
    //expect(idp2Response.status).to.equal(202);

    const idp1ResponseResult = await idp1ResponseResultPromise.promise;
    expect(idp1ResponseResult).to.deep.include({
      reference_id: idpReferenceId,
      request_id: requestId,
      success: true,
    });

    const idp2ResponseResult = await idp2ResponseResultPromise.promise;
    expect(idp2ResponseResult).to.deep.include({
      reference_id: idp2ReferenceId,
      request_id: requestId,
      success: true,
    });
  });

  // it('RP should receive confirmed (answered_idp_count = 1) request status with valid proofs', async function() {
  //   this.timeout(15000);
  //   const requestStatus = await answer1RequestStatusConfirmedPromise.promise;
  //   expect(requestStatus).to.deep.include({
  //     request_id: requestId,
  //     status: 'confirmed',
  //     mode: createRequestParams.mode,
  //     min_idp: createRequestParams.min_idp,
  //     answered_idp_count: 1,
  //     closed: false,
  //     timed_out: false,
  //     service_list: [
  //       {
  //         service_id: createRequestParams.data_request_list[0].service_id,
  //         min_as: createRequestParams.data_request_list[0].min_as,
  //         signed_data_count: 0,
  //         received_data_count: 0,
  //       },
  //     ],
  //   });
  //   expect(requestStatus.response_valid_list).to.have.lengthOf(1);
  //   expect(requestStatus.response_valid_list[0].valid_signature).to.be.true;
  //   expect(requestStatus.response_valid_list[0].valid_proof).to.be.true;
  //   expect(requestStatus.response_valid_list[0].valid_ial).to.be.true;
  //   expect(requestStatus).to.have.property('block_height');
  //   expect(requestStatus.block_height).is.a('string');const splittedBlockHeight = requestStatus.block_height.split(':');expect(splittedBlockHeight).to.have.lengthOf(2);expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
  // });

  it('RP should receive confirmed (answered_idp_count = 2) request status with valid proofs', async function() {
    this.timeout(15000);
    const requestStatus = await answer2RequestStatusConfirmedPromise.promise;
    expect(requestStatus).to.deep.include({
      request_id: requestId,
      status: 'confirmed',
      mode: createRequestParams.mode,
      min_idp: createRequestParams.min_idp,
      answered_idp_count: 2,
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
    });
    expect(requestStatus.response_valid_list).to.have.lengthOf(2);
    expect(requestStatus.response_valid_list[1].valid_signature).to.be.true;
    expect(requestStatus.response_valid_list[1].valid_proof).to.be.true;
    expect(requestStatus.response_valid_list[1].valid_ial).to.be.true;
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
      request_id: requestId,
      mode: createRequestParams.mode,
      namespace,
      identifier,
      service_id: createRequestParams.data_request_list[0].service_id,
      request_params: createRequestParams.data_request_list[0].request_params,
      max_ial: 2.3,
      max_aal: 3,
      requester_node_id: 'rp1',
      request_timeout: createRequestParams.request_timeout,
    });
    expect(dataRequest.response_signature_list).to.have.lengthOf(2);
    expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is.not
      .empty;
    expect(dataRequest.response_signature_list[1]).to.be.a('string').that.is.not
      .empty;
    expect(dataRequest.creation_time).to.be.a('number');
    expect(dataRequest.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight = dataRequest.creation_block_height.split(
      ':'
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('AS should send data successfully', async function() {
    this.timeout(15000);
    const response = await asApi.sendData('as1', {
      requestId,
      serviceId: createRequestParams.data_request_list[0].service_id,
      reference_id: asReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      data,
    });
    expect(response.status).to.equal(202);

    const sendDataResult = await sendDataResultPromise.promise;
    expect(sendDataResult).to.deep.include({
      node_id: 'as1',
      reference_id: asReferenceId,
      success: true,
      request_id: requestId,
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
      answered_idp_count: 2,
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
    });
    expect(requestStatus.response_valid_list).to.have.lengthOf(2);
    expect(requestStatus.response_valid_list[0].valid_signature).to.be.true;
    expect(requestStatus.response_valid_list[0].valid_proof).to.be.true;
    expect(requestStatus.response_valid_list[0].valid_ial).to.be.true;
    expect(requestStatus.response_valid_list[1].valid_signature).to.be.true;
    expect(requestStatus.response_valid_list[1].valid_proof).to.be.true;
    expect(requestStatus.response_valid_list[1].valid_ial).to.be.true;
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
      answered_idp_count: 2,
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
    });
    expect(requestStatus.response_valid_list).to.have.lengthOf(2);
    expect(requestStatus.response_valid_list[0].valid_signature).to.be.true;
    expect(requestStatus.response_valid_list[0].valid_proof).to.be.true;
    expect(requestStatus.response_valid_list[0].valid_ial).to.be.true;
    expect(requestStatus.response_valid_list[1].valid_signature).to.be.true;
    expect(requestStatus.response_valid_list[1].valid_proof).to.be.true;
    expect(requestStatus.response_valid_list[1].valid_ial).to.be.true;
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
      answered_idp_count: 2,
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
    });
    expect(requestStatus.response_valid_list).to.have.lengthOf(2);
    expect(requestStatus.response_valid_list[0].valid_signature).to.be.true;
    expect(requestStatus.response_valid_list[0].valid_proof).to.be.true;
    expect(requestStatus.response_valid_list[0].valid_ial).to.be.true;
    expect(requestStatus.response_valid_list[1].valid_signature).to.be.true;
    expect(requestStatus.response_valid_list[1].valid_proof).to.be.true;
    expect(requestStatus.response_valid_list[1].valid_ial).to.be.true;
    expect(requestStatus).to.have.property('block_height');
    expect(requestStatus.block_height).is.a('string');
    const splittedBlockHeight = requestStatus.block_height.split(':');
    expect(splittedBlockHeight).to.have.lengthOf(2);
    expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('RP should get the correct data received from AS', async function() {
    const idp1Response = await rpApi.getDataFromAS('rp1', {
      requestId,
    });
    const dataArr = await idp1Response.json();
    expect(idp1Response.status).to.equal(200);

    expect(dataArr).to.have.lengthOf(1);
    expect(dataArr[0]).to.deep.include({
      source_node_id: 'as1',
      service_id: createRequestParams.data_request_list[0].service_id,
      signature_sign_method: 'RSA-SHA256',
      data,
    });
    expect(dataArr[0].source_signature).to.be.a('string').that.is.not.empty;
    expect(dataArr[0].data_salt).to.be.a('string').that.is.not.empty;
  });

  // it('RP should receive 6 request status updates', function() {
  //   expect(requestStatusUpdates).to.have.lengthOf(6);
  // });

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

  it('IdP should have and able to get saved private messages', async function() {
    const response = await commonApi.getPrivateMessages('idp2', {
      request_id: requestId,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.be.an('array').that.is.not.empty;
  });

  it('IdP should remove saved private messages successfully', async function() {
    const response = await commonApi.removePrivateMessages('idp2', {
      request_id: requestId,
    });
    expect(response.status).to.equal(204);
  });

  it('IdP should have no saved private messages left after removal', async function() {
    const response = await commonApi.getPrivateMessages('idp2', {
      request_id: requestId,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.be.an('array').that.is.empty;
  });

  it('AS should have and able to get saved private messages', async function() {
    const response = await commonApi.getPrivateMessages('as1', {
      request_id: requestId,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.be.an('array').that.is.not.empty;
  });

  it('AS should remove saved private messages successfully', async function() {
    const response = await commonApi.removePrivateMessages('as1', {
      request_id: requestId,
    });
    expect(response.status).to.equal(204);
  });

  it('AS should have no saved private messages left after removal', async function() {
    const response = await commonApi.getPrivateMessages('as1', {
      request_id: requestId,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.be.an('array').that.is.empty;
  });

  after(function() {
    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
    as1EventEmitter.removeAllListeners('callback');
  });
});
