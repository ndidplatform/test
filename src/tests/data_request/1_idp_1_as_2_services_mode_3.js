import { expect } from 'chai';

import * as rpApi from '../../api/v2/rp';
import * as idpApi from '../../api/v2/idp';
import * as asApi from '../../api/v2/as';
// import * as commonApi from '../../api/v2/common';
import {
  rpEventEmitter,
  idp1EventEmitter,
  as1EventEmitter,
} from '../../callback_server';
import * as db from '../../db';
import {
  createEventPromise,
  generateReferenceId,
  hash,
  createSignature,
} from '../../utils';
import * as config from '../../config';

describe('1 IdP, 1 AS, mode 3, 2 services', function() {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const asDataBankStatementReferenceId = generateReferenceId();
  const asDataCustomerInfoReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise(); // RP
  const requestStatusPendingPromise = createEventPromise(); // RP
  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise(); // IDP
  const requestStatusConfirmedPromise = createEventPromise(); // RP
  const dataRequestBankStatementReceivedPromise = createEventPromise(); // AS
  const dataRequestCustomerInfoReceivedPromise = createEventPromise(); // AS
  const sendDataBankStatementResultPromise = createEventPromise(); // AS
  const sendDataCustomerInfoResultPromise = createEventPromise(); // AS
  const requestStatusSignedDataBankStatementPromise = createEventPromise(); // RP
  const requestStatusReceivedDataBankStatementPromise = createEventPromise(); // RP
  const requestStatusSignedDataCustomerInfoPromise = createEventPromise(); // RP
  const requestStatusCompletedPromise = createEventPromise(); // RP
  const requestClosedPromise = createEventPromise(); // RP

  let createRequestParams;
  const bankStatementData = JSON.stringify({
    type: 'statement',
    name: 'test',
    withEscapedChar: 'test|fff||ss\\|NN\\\\|',
    arr: [1, 2, 3],
  });
  const customerInfoData = JSON.stringify({
    type: 'customer',
    name: 'test',
    withEscapedChar: 'test|fff||ss\\|NN\\\\|',
    arr: [1, 2, 3],
  });

  let requestId;
  let requestMessageSalt;

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
          as_id_list: ['as1'],
          min_as: 1,
          request_params: JSON.stringify({
            format: 'json',
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
          if (
            callbackData.service_list[0].signed_data_count === 1 &&
            callbackData.service_list[0].received_data_count === 0 &&
            callbackData.service_list[1].signed_data_count === 0 &&
            callbackData.service_list[1].received_data_count === 0
          ) {
            requestStatusSignedDataBankStatementPromise.resolve(callbackData);
          } else if (
            callbackData.service_list[0].signed_data_count === 1 &&
            callbackData.service_list[0].received_data_count === 1 &&
            callbackData.service_list[1].signed_data_count === 0 &&
            callbackData.service_list[1].received_data_count === 0
          ) {
            requestStatusReceivedDataBankStatementPromise.resolve(callbackData);
          } else if (
            callbackData.service_list[0].signed_data_count === 1 &&
            callbackData.service_list[0].received_data_count === 1 &&
            callbackData.service_list[1].signed_data_count === 1 &&
            callbackData.service_list[1].received_data_count === 0
          ) {
            requestStatusSignedDataCustomerInfoPromise.resolve(callbackData);
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

    as1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'data_request' &&
        callbackData.request_id === requestId
      ) {
        if (callbackData.service_id === 'bank_statement') {
          dataRequestBankStatementReceivedPromise.resolve(callbackData);
        } else if (callbackData.service_id === 'customer_info') {
          dataRequestCustomerInfoReceivedPromise.resolve(callbackData);
        }
      } else if (callbackData.type === 'send_data_result') {
        if (callbackData.reference_id === asDataBankStatementReferenceId) {
          sendDataBankStatementResultPromise.resolve(callbackData);
        } else if (
          callbackData.reference_id === asDataCustomerInfoReferenceId
        ) {
          sendDataCustomerInfoResultPromise.resolve(callbackData);
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
        {
          service_id: createRequestParams.data_request_list[1].service_id,
          min_as: createRequestParams.data_request_list[1].min_as,
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
      signature: createSignature(
        identity.accessors[0].accessorPrivateKey,
        createRequestParams.request_message + requestMessageSalt
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
        {
          service_id: createRequestParams.data_request_list[1].service_id,
          min_as: createRequestParams.data_request_list[1].min_as,
          signed_data_count: 0,
          received_data_count: 0,
        },
      ],
      response_valid_list: [
        { idp_id: 'idp1', valid_proof: true, valid_ial: true },
      ],
    });
    expect(requestStatus).to.have.property('block_height');
    expect(requestStatus.block_height).is.a('number');
  });

  it('AS should receive data request for "bank_statement" service', async function() {
    this.timeout(15000);
    const dataRequest = await dataRequestBankStatementReceivedPromise.promise;
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

  it('AS should receive data request for "customer_info" service', async function() {
    this.timeout(15000);
    const dataRequest = await dataRequestCustomerInfoReceivedPromise.promise;
    expect(dataRequest).to.deep.include({
      request_id: requestId,
      mode: createRequestParams.mode,
      namespace,
      identifier,
      service_id: createRequestParams.data_request_list[1].service_id,
      request_params: createRequestParams.data_request_list[1].request_params,
      max_ial: 2.3,
      max_aal: 3,
    });
    expect(dataRequest.response_signature_list).to.have.lengthOf(1);
    expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is.not
      .empty;
  });

  it('AS should send data successfully (bank_statement)', async function() {
    this.timeout(15000);
    const response = await asApi.sendData('as1', {
      requestId,
      serviceId: createRequestParams.data_request_list[0].service_id,
      reference_id: asDataBankStatementReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      data: bankStatementData,
    });
    expect(response.status).to.equal(202);

    const sendDataResult = await sendDataBankStatementResultPromise.promise;
    expect(sendDataResult).to.deep.include({
      reference_id: asDataBankStatementReferenceId,
      success: true,
    });
  });

  it('RP should receive request status with signed data count = 1 for "bank_statement" service', async function() {
    this.timeout(15000);
    const requestStatus = await requestStatusSignedDataBankStatementPromise.promise;
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
        {
          service_id: createRequestParams.data_request_list[1].service_id,
          min_as: createRequestParams.data_request_list[1].min_as,
          signed_data_count: 0,
          received_data_count: 0,
        },
      ],
      response_valid_list: [
        { idp_id: 'idp1', valid_proof: true, valid_ial: true },
      ],
    });
    expect(requestStatus).to.have.property('block_height');
    expect(requestStatus.block_height).is.a('number');
  });

  it('RP should receive confirmed request status with received data count = 1 for "bank_statement" service', async function() {
    this.timeout(15000);
    const requestStatus = await requestStatusReceivedDataBankStatementPromise.promise;
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
          received_data_count: 1,
        },
        {
          service_id: createRequestParams.data_request_list[1].service_id,
          min_as: createRequestParams.data_request_list[1].min_as,
          signed_data_count: 0,
          received_data_count: 0,
        },
      ],
      response_valid_list: [
        { idp_id: 'idp1', valid_proof: true, valid_ial: true },
      ],
    });
    expect(requestStatus).to.have.property('block_height');
    expect(requestStatus.block_height).is.a('number');
  });

  it('AS should send data successfully (customer_info)', async function() {
    this.timeout(15000);
    const response = await asApi.sendData('as1', {
      requestId,
      serviceId: createRequestParams.data_request_list[1].service_id,
      reference_id: asDataCustomerInfoReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      data: customerInfoData,
    });
    expect(response.status).to.equal(202);

    const sendDataResult = await sendDataCustomerInfoResultPromise.promise;
    expect(sendDataResult).to.deep.include({
      reference_id: asDataCustomerInfoReferenceId,
      success: true,
    });
  });

  it('RP should receive request status with signed data count = 1 for "customer_info" service', async function() {
    this.timeout(15000);
    const requestStatus = await requestStatusSignedDataCustomerInfoPromise.promise;
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
          received_data_count: 1,
        },
        {
          service_id: createRequestParams.data_request_list[1].service_id,
          min_as: createRequestParams.data_request_list[1].min_as,
          signed_data_count: 1,
          received_data_count: 0,
        },
      ],
      response_valid_list: [
        { idp_id: 'idp1', valid_proof: true, valid_ial: true },
      ],
    });
    expect(requestStatus).to.have.property('block_height');
    expect(requestStatus.block_height).is.a('number');
  });

  it('RP should receive completed request status with received data count = 1 for "customer_info" service', async function() {
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
        {
          service_id: createRequestParams.data_request_list[1].service_id,
          min_as: createRequestParams.data_request_list[1].min_as,
          signed_data_count: 1,
          received_data_count: 1,
        },
      ],
      response_valid_list: [
        { idp_id: 'idp1', valid_proof: true, valid_ial: true },
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
          signed_data_count: 1,
          received_data_count: 1,
        },
        {
          service_id: createRequestParams.data_request_list[1].service_id,
          min_as: createRequestParams.data_request_list[1].min_as,
          signed_data_count: 1,
          received_data_count: 1,
        },
      ],
      response_valid_list: [
        { idp_id: 'idp1', valid_proof: true, valid_ial: true },
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
    expect(dataArr[0]).to.deep.include({
      source_node_id: 'as1',
      service_id: createRequestParams.data_request_list[0].service_id,
      signature_sign_method: 'RSA-SHA256',
      data: bankStatementData,
    });
    expect(dataArr[0].source_signature).to.be.a('string').that.is.not.empty;
    expect(dataArr[0].data_salt).to.be.a('string').that.is.not.empty;
    expect(dataArr[1]).to.deep.include({
      source_node_id: 'as1',
      service_id: createRequestParams.data_request_list[1].service_id,
      signature_sign_method: 'RSA-SHA256',
      data: customerInfoData,
    });
    expect(dataArr[1].source_signature).to.be.a('string').that.is.not.empty;
    expect(dataArr[1].data_salt).to.be.a('string').that.is.not.empty;
  });

  it('RP should receive 7 request status updates', function() {
    expect(requestStatusUpdates).to.have.lengthOf(7);
  });

  after(function() {
    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
    as1EventEmitter.removeAllListeners('callback');
  });
});
