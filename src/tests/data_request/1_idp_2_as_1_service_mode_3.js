import { expect } from 'chai';

import * as rpApi from '../../api/v2/rp';
import * as idpApi from '../../api/v2/idp';
import * as asApi from '../../api/v2/as';
import * as commonApi from '../../api/v2/common';
import { as2Available } from '..';
import {
  rpEventEmitter,
  idp1EventEmitter,
  as1EventEmitter,
  as2EventEmitter,
} from '../../callback_server';
import * as db from '../../db';
import {
  createEventPromise,
  generateReferenceId,
  hashRequestMessageForConsent,
  createResponseSignature,
} from '../../utils';
import * as config from '../../config';

describe('1 IdP, 2 AS, 1 Service, mode 3', function() {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const as1ReferenceId = generateReferenceId();
  const as2ReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise(); // RP
  const requestStatusPendingPromise = createEventPromise(); // RP
  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise(); // IDP
  const requestStatusConfirmedPromise = createEventPromise(); // RP
  const as1DataRequestReceivedPromise = createEventPromise(); // AS
  const as1SendDataResultPromise = createEventPromise(); // AS
  const as2DataRequestReceivedPromise = createEventPromise(); // AS
  const as2SendDataResultPromise = createEventPromise(); // AS
  const requestStatusSignedDataPromise1 = createEventPromise(); // RP
  const requestStatusSignedDataPromise2 = createEventPromise(); // RP
  const requestStatusReceiveDataCountPromise1 = createEventPromise(); // RP
  const requestStatusCompletedPromise2 = createEventPromise(); // RP
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

  // const requestStatusUpdates = [];

  before(function() {
    if (db.idp1Identities[0] == null) {
      throw new Error('No created identity to use');
    }
    if (!as2Available) {
      this.test.parent.pending = true;
      this.skip();
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
          as_id_list: ['as1', 'as2'],
          min_as: 2,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
      ],
      request_message:
        'Test request message (data request 1 IdP, 2 AS, 1 Service) (mode 3)',
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
        // requestStatusUpdates.push(callbackData);
        if (callbackData.status === 'pending') {
          requestStatusPendingPromise.resolve(callbackData);
        } else if (callbackData.status === 'confirmed') {
          if (callbackData.service_list[0].signed_data_count === 1) {
            requestStatusSignedDataPromise1.resolve(callbackData);
          } else if (
            callbackData.service_list[0].signed_data_count === 2 &&
            callbackData.service_list[0].received_data_count === 0
          ) {
            requestStatusSignedDataPromise2.resolve(callbackData);
          } else if (
            callbackData.service_list[0].signed_data_count === 2 &&
            callbackData.service_list[0].received_data_count === 1
          ) {
            requestStatusReceiveDataCountPromise1.resolve(callbackData);
          } else {
            requestStatusConfirmedPromise.resolve(callbackData);
          }
        } else if (callbackData.status === 'completed') {
          if (callbackData.closed) {
            requestClosedPromise.resolve(callbackData);
          } else if (callbackData.service_list[0].received_data_count === 2) {
            requestStatusCompletedPromise2.resolve(callbackData);
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

    as1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'data_request' &&
        callbackData.request_id === requestId
      ) {
        as1DataRequestReceivedPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'send_data_result' &&
        callbackData.reference_id === as1ReferenceId
      ) {
        as1SendDataResultPromise.resolve(callbackData);
      }
    });

    as2EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'data_request' &&
        callbackData.request_id === requestId
      ) {
        as2DataRequestReceivedPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'send_data_result' &&
        callbackData.reference_id === as2ReferenceId
      ) {
        as2SendDataResultPromise.resolve(callbackData);
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
    expect(createRequestResult.creation_block_height).to.be.a('number');
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
    expect(requestStatus.block_height).is.a('number');
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
      data_request_list: dataRequestListWithoutParams,
      request_timeout: createRequestParams.request_timeout,
    });
    expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
      .empty;
    expect(incomingRequest.creation_time).to.be.a('number');
    expect(incomingRequest.creation_block_height).to.be.a('number');

    requestMessageSalt = incomingRequest.request_message_salt;
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
          valid_proof: true,
          valid_ial: true,
        },
      ],
    });
    expect(requestStatus).to.have.property('block_height');
    expect(requestStatus.block_height).is.a('number');
  });

  it('Both AS (as1 and as2) should receive data request', async function() {
    this.timeout(15000);
    const as1DataRequest = await as1DataRequestReceivedPromise.promise;
    const as2DataRequest = await as2DataRequestReceivedPromise.promise;

    expect(as1DataRequest).to.deep.include({
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
    expect(as1DataRequest.response_signature_list).to.have.lengthOf(1);
    expect(as1DataRequest.response_signature_list[0]).to.be.a('string').that.is
      .not.empty;

    expect(as2DataRequest).to.deep.include({
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
    expect(as2DataRequest.response_signature_list).to.have.lengthOf(1);
    expect(as2DataRequest.response_signature_list[0]).to.be.a('string').that.is
      .not.empty;
  });

  it('Both AS (as1 and as2) should send data successfully', async function() {
    this.timeout(15000);
    const as1Response = asApi.sendData('as1', {
      requestId,
      serviceId: createRequestParams.data_request_list[0].service_id,
      reference_id: as1ReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      data,
    });
    //expect(as1Response.status).to.equal(202);

    const as2Response = asApi.sendData('as2', {
      requestId,
      serviceId: createRequestParams.data_request_list[0].service_id,
      reference_id: as2ReferenceId,
      callback_url: config.AS2_CALLBACK_URL,
      data,
    });
    //expect(as2Response.status).to.equal(202);

    const as1SendDataResult = await as1SendDataResultPromise.promise;
    expect(as1SendDataResult).to.deep.include({
      reference_id: as1ReferenceId,
      success: true,
    });

    const as2SendDataResult = await as2SendDataResultPromise.promise;
    expect(as2SendDataResult).to.deep.include({
      reference_id: as2ReferenceId,
      success: true,
    });
  });

  // it('RP should receive request status with signed data count = 1', async function() {
  //   this.timeout(15000);
  //   const requestStatus = await requestStatusSignedDataPromise1.promise;
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
  //         signed_data_count: 1,
  //         received_data_count: 0,
  //       },
  //     ],
  //     response_valid_list: [
  //       {
  //         idp_id: 'idp1',
  //         valid_signature: true,
  //         valid_proof: true,
  //         valid_ial: true,
  //       },
  //     ],
  //   });
  //   expect(requestStatus).to.have.property('block_height');
  //   expect(requestStatus.block_height).is.a('number');
  // });

  it('RP should receive request status with signed data count = 2', async function() {
    this.timeout(15000);
    const requestStatus = await requestStatusSignedDataPromise2.promise;
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
          signed_data_count: 2,
          received_data_count: 0,
        },
      ],
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
    expect(requestStatus.block_height).is.a('number');
  });

  // it('RP should receive completed request status with received data count = 1', async function() {
  //   this.timeout(15000);
  //   const requestStatus = await requestStatusReceiveDataCountPromise1.promise;
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
  //         signed_data_count: 2,
  //         received_data_count: 1,
  //       },
  //     ],
  //     response_valid_list: [
  //       {
  //         idp_id: 'idp1',
  //         valid_signature: true,
  //         valid_proof: true,
  //         valid_ial: true,
  //       },
  //     ],
  //   });
  //   expect(requestStatus).to.have.property('block_height');
  //   expect(requestStatus.block_height).is.a('number');
  // });

  it('RP should receive completed request status with received data count = 2', async function() {
    this.timeout(15000);
    const requestStatus = await requestStatusCompletedPromise2.promise;
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
          signed_data_count: 2,
          received_data_count: 2,
        },
      ],
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
    expect(requestStatus.block_height).is.a('number');
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
          signed_data_count: 2,
          received_data_count: 2,
        },
      ],
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
    expect(requestStatus.block_height).is.a('number');
  });

  it('RP should get the correct data received from AS', async function() {
    const response = await rpApi.getDataFromAS('rp1', {
      requestId,
    });
    const dataArr = await response.json();
    expect(response.status).to.equal(200);
    expect(dataArr).to.have.lengthOf(2);
    if (dataArr[0].source_node_id === 'as1') {
      expect(dataArr[0]).to.deep.include({
        source_node_id: 'as1',
        service_id: createRequestParams.data_request_list[0].service_id,
        signature_sign_method: 'RSA-SHA256',
        data,
      });
      expect(dataArr[0].source_signature).to.be.a('string').that.is.not.empty;
      expect(dataArr[0].data_salt).to.be.a('string').that.is.not.empty;
      expect(dataArr[1]).to.deep.include({
        source_node_id: 'as2',
        service_id: createRequestParams.data_request_list[0].service_id,
        signature_sign_method: 'RSA-SHA256',
        data,
      });
      expect(dataArr[1].source_signature).to.be.a('string').that.is.not.empty;
      expect(dataArr[1].data_salt).to.be.a('string').that.is.not.empty;
    } else {
      expect(dataArr[0]).to.deep.include({
        source_node_id: 'as2',
        service_id: createRequestParams.data_request_list[0].service_id,
        signature_sign_method: 'RSA-SHA256',
        data,
      });
      expect(dataArr[0].source_signature).to.be.a('string').that.is.not.empty;
      expect(dataArr[0].data_salt).to.be.a('string').that.is.not.empty;
      expect(dataArr[1]).to.deep.include({
        source_node_id: 'as1',
        service_id: createRequestParams.data_request_list[0].service_id,
        signature_sign_method: 'RSA-SHA256',
        data,
      });
      expect(dataArr[1].source_signature).to.be.a('string').that.is.not.empty;
      expect(dataArr[1].data_salt).to.be.a('string').that.is.not.empty;
    }
  });

  // it('RP should receive 7 request status updates', function() {
  //   expect(requestStatusUpdates).to.have.lengthOf(7);
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

  it('AS should have and able to get saved private messages', async function() {
    const response = await commonApi.getPrivateMessages('as2', {
      request_id: requestId,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.be.an('array').that.is.not.empty;
  });

  it('AS should remove saved private messages successfully', async function() {
    const response = await commonApi.removePrivateMessages('as2', {
      request_id: requestId,
    });
    expect(response.status).to.equal(204);
  });

  it('AS should have no saved private messages left after removal', async function() {
    const response = await commonApi.getPrivateMessages('as2', {
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
