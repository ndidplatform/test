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

describe('1 IdP, 2 AS (min_as = 2), 2 Services, mode 3', function() {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const as1BankStatementReferenceId = generateReferenceId();
  const as1CustomerInfoReferenceId = generateReferenceId();
  const as2BankStatementReferenceId = generateReferenceId();
  const as2CustomerInfoReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise(); // RP
  const requestStatusPendingPromise = createEventPromise(); // RP
  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise(); // IDP
  const requestStatusConfirmedPromise = createEventPromise(); // RP

  const as1DataRequestBankStatementPromise = createEventPromise(); // AS
  const as1DataRequestCustomerInfoPromise = createEventPromise(); // AS
  const as1SendDataBankStatementResultPromise = createEventPromise(); // AS
  const as1SendDataCustomerInfoResultPromise = createEventPromise(); // AS

  const as2DataRequestBankStatementPromise = createEventPromise(); // AS
  const as2DataRequestCustomerInfoPromise = createEventPromise(); // AS
  const as2SendDataBankStatementResultPromise = createEventPromise(); // AS
  const as2SendDataCustomerInfoResultPromise = createEventPromise(); // AS

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

  // const requestStatusUpdates = [];

  before(function() {
    if (!as2Available) {
      this.test.parent.pending = true;
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
          as_id_list: ['as1', 'as2'],
          min_as: 2,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
        {
          service_id: 'customer_info',
          as_id_list: ['as1', 'as2'],
          min_as: 2,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
      ],
      request_message:
        'Test request message (data request 1 IdP, 2 AS (min_as = 2), 2 Services) (mode 3)',
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
        if (callbackData.status === 'pending') {
          requestStatusPendingPromise.resolve(callbackData);
        } else if (callbackData.status === 'confirmed') {
          if (
            callbackData.service_list[0].signed_data_count === 2 &&
            callbackData.service_list[0].received_data_count === 0 &&
            callbackData.service_list[1].signed_data_count === 2 &&
            callbackData.service_list[1].received_data_count === 0
          ) {
            requestStatusSignedDataPromise.resolve(callbackData);
          } else {
            requestStatusConfirmedPromise.resolve(callbackData);
          }
        } else if (callbackData.status === 'completed') {
          if (callbackData.closed) {
            requestClosedPromise.resolve(callbackData);
          } else if (
            callbackData.service_list[0].received_data_count === 2 &&
            callbackData.service_list[1].received_data_count === 2
          ) {
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
        callbackData.request_id === requestId &&
        callbackData.service_id === 'bank_statement'
      ) {
        as1DataRequestBankStatementPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'data_request' &&
        callbackData.request_id === requestId &&
        callbackData.service_id === 'customer_info'
      ) {
        as1DataRequestCustomerInfoPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'send_data_result' &&
        callbackData.reference_id === as1BankStatementReferenceId
      ) {
        as1SendDataBankStatementResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'send_data_result' &&
        callbackData.reference_id === as1CustomerInfoReferenceId
      ) {
        as1SendDataCustomerInfoResultPromise.resolve(callbackData);
      }
    });

    as2EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'data_request' &&
        callbackData.request_id === requestId &&
        callbackData.service_id === 'bank_statement'
      ) {
        as2DataRequestBankStatementPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'data_request' &&
        callbackData.request_id === requestId &&
        callbackData.service_id === 'customer_info'
      ) {
        as2DataRequestCustomerInfoPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'send_data_result' &&
        callbackData.reference_id === as2BankStatementReferenceId
      ) {
        as2SendDataBankStatementResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'send_data_result' &&
        callbackData.reference_id === as2CustomerInfoReferenceId
      ) {
        as2SendDataCustomerInfoResultPromise.resolve(callbackData);
      }
    });
  });

  it('RP should create a request successfully', async function() {
    this.timeout(15000);
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
    this.timeout(15000);
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
      (dataRequest) => {
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

  it('Both AS (as1 and as2) should receive data request (bank_statement)', async function() {
    this.timeout(20000);

    const [
      as1DataRequestBankStatement,
      as2DataRequestBankStatement,
    ] = await Promise.all([
      as1DataRequestBankStatementPromise.promise,
      as2DataRequestBankStatementPromise.promise,
    ]);

    expect(as1DataRequestBankStatement).to.deep.include({
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
    expect(
      as1DataRequestBankStatement.response_signature_list
    ).to.have.lengthOf(1);
    expect(as1DataRequestBankStatement.response_signature_list[0]).to.be.a(
      'string'
    ).that.is.not.empty;

    expect(as2DataRequestBankStatement).to.deep.include({
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
    expect(
      as2DataRequestBankStatement.response_signature_list
    ).to.have.lengthOf(1);
    expect(as2DataRequestBankStatement.response_signature_list[0]).to.be.a(
      'string'
    ).that.is.not.empty;
  });

  it('Both AS (as1 and as2) should receive data request (customer_info)', async function() {
    this.timeout(15000);

    const [
      as1DataRequestCustomerInfo,
      as2DataRequestCustomerInfo,
    ] = await Promise.all([
      as1DataRequestCustomerInfoPromise.promise,
      as2DataRequestCustomerInfoPromise.promise,
    ]);

    expect(as1DataRequestCustomerInfo).to.deep.include({
      request_id: requestId,
      mode: createRequestParams.mode,
      namespace,
      identifier,
      service_id: createRequestParams.data_request_list[1].service_id,
      request_params: createRequestParams.data_request_list[1].request_params,
      max_ial: 2.3,
      max_aal: 3,
      requester_node_id: 'rp1',
    });
    expect(as1DataRequestCustomerInfo.response_signature_list).to.have.lengthOf(
      1
    );
    expect(as1DataRequestCustomerInfo.response_signature_list[0]).to.be.a(
      'string'
    ).that.is.not.empty;

    expect(as2DataRequestCustomerInfo).to.deep.include({
      request_id: requestId,
      mode: createRequestParams.mode,
      namespace,
      identifier,
      service_id: createRequestParams.data_request_list[1].service_id,
      request_params: createRequestParams.data_request_list[1].request_params,
      max_ial: 2.3,
      max_aal: 3,
      requester_node_id: 'rp1',
    });
    expect(as2DataRequestCustomerInfo.response_signature_list).to.have.lengthOf(
      1
    );
    expect(as2DataRequestCustomerInfo.response_signature_list[0]).to.be.a(
      'string'
    ).that.is.not.empty;
  });

  it('Both AS (as1 and as2) should send data successfully (send data bank_statement and customer_info at the same time)', async function() {
    this.timeout(20000);

    asApi.sendData('as1', {
      requestId,
      serviceId: createRequestParams.data_request_list[0].service_id,
      reference_id: as1BankStatementReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      data,
    });

    asApi.sendData('as1', {
      requestId,
      serviceId: createRequestParams.data_request_list[1].service_id,
      reference_id: as1CustomerInfoReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      data,
    });

    asApi.sendData('as2', {
      requestId,
      serviceId: createRequestParams.data_request_list[0].service_id,
      reference_id: as2BankStatementReferenceId,
      callback_url: config.AS2_CALLBACK_URL,
      data,
    });

    asApi.sendData('as2', {
      requestId,
      serviceId: createRequestParams.data_request_list[1].service_id,
      reference_id: as2CustomerInfoReferenceId,
      callback_url: config.AS2_CALLBACK_URL,
      data,
    });

    const [
      as1SendDataBankStatementResult,
      as1SendDataCustomerInfoResult,
      as2SendDataBankStatementResult,
      as2SendDataCustomerInfoResult,
    ] = await Promise.all([
      as1SendDataBankStatementResultPromise.promise,
      as1SendDataCustomerInfoResultPromise.promise,
      as2SendDataBankStatementResultPromise.promise,
      as2SendDataCustomerInfoResultPromise.promise,
    ]);
    expect(as1SendDataBankStatementResult).to.deep.include({
      reference_id: as1BankStatementReferenceId,
      success: true,
    });
    expect(as1SendDataCustomerInfoResult).to.deep.include({
      reference_id: as1CustomerInfoReferenceId,
      success: true,
    });
    expect(as2SendDataBankStatementResult).to.deep.include({
      reference_id: as2BankStatementReferenceId,
      success: true,
    });
    expect(as2SendDataCustomerInfoResult).to.deep.include({
      reference_id: as2CustomerInfoReferenceId,
      success: true,
    });
  });

  // it('RP should receive request status with both services (bank_statement and customer_info) signed data count = 2', async function() {
  //   this.timeout(25000);
  //   const requestStatus = await requestStatusSignedDataPromise.promise;
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
  //         received_data_count: 0,
  //       },
  //       {
  //         service_id: createRequestParams.data_request_list[1].service_id,
  //         min_as: createRequestParams.data_request_list[1].min_as,
  //         signed_data_count: 2,
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
  //   expect(requestStatus.block_height).is.a('string');const splittedBlockHeight = requestStatus.block_height.split(':');expect(splittedBlockHeight).to.have.lengthOf(2);expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
  // });

  it('RP should receive completed request status with both services (bank_statement and customer_info) received data count = 2', async function() {
    this.timeout(25000);
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
          signed_data_count: 2,
          received_data_count: 2,
        },
        {
          service_id: createRequestParams.data_request_list[1].service_id,
          min_as: createRequestParams.data_request_list[1].min_as,
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
          signed_data_count: 2,
          received_data_count: 2,
        },
        {
          service_id: createRequestParams.data_request_list[1].service_id,
          min_as: createRequestParams.data_request_list[1].min_as,
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
    expect(dataArr).to.have.lengthOf(4);

    expect(dataArr[0].source_node_id).to.be.a('string').that.is.not.empty;
    expect(dataArr[0].service_id).to.be.a('string').that.is.not.empty;
    expect(dataArr[0].source_signature).to.be.a('string').that.is.not.empty;
    expect(dataArr[0].signature_sign_method).to.be.a('string').that.is.not
      .empty;
    expect(dataArr[0].data_salt).to.be.a('string').that.is.not.empty;
    expect(dataArr[0].data).to.equal(data);

    expect(dataArr[1].source_node_id).to.be.a('string').that.is.not.empty;
    expect(dataArr[1].service_id).to.be.a('string').that.is.not.empty;
    expect(dataArr[1].source_signature).to.be.a('string').that.is.not.empty;
    expect(dataArr[1].signature_sign_method).to.be.a('string').that.is.not
      .empty;
    expect(dataArr[1].data_salt).to.be.a('string').that.is.not.empty;
    expect(dataArr[1].data).to.equal(data);

    expect(dataArr[2].source_node_id).to.be.a('string').that.is.not.empty;
    expect(dataArr[2].service_id).to.be.a('string').that.is.not.empty;
    expect(dataArr[2].source_signature).to.be.a('string').that.is.not.empty;
    expect(dataArr[2].signature_sign_method).to.be.a('string').that.is.not
      .empty;
    expect(dataArr[2].data_salt).to.be.a('string').that.is.not.empty;
    expect(dataArr[2].data).to.equal(data);

    expect(dataArr[3].source_node_id).to.be.a('string').that.is.not.empty;
    expect(dataArr[3].service_id).to.be.a('string').that.is.not.empty;
    expect(dataArr[3].source_signature).to.be.a('string').that.is.not.empty;
    expect(dataArr[3].signature_sign_method).to.be.a('string').that.is.not
      .empty;
    expect(dataArr[3].data_salt).to.be.a('string').that.is.not.empty;
    expect(dataArr[3].data).to.equal(data);
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

  it('AS (as1) should have and able to get saved private messages', async function() {
    const response = await commonApi.getPrivateMessages('as1', {
      request_id: requestId,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.be.an('array').that.is.not.empty;
  });

  it('AS (as1) should remove saved private messages successfully', async function() {
    const response = await commonApi.removePrivateMessages('as1', {
      request_id: requestId,
    });
    expect(response.status).to.equal(204);
  });

  it('AS (as1) should have no saved private messages left after removal', async function() {
    const response = await commonApi.getPrivateMessages('as1', {
      request_id: requestId,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.be.an('array').that.is.empty;
  });

  it('AS (as2) should have and able to get saved private messages', async function() {
    const response = await commonApi.getPrivateMessages('as2', {
      request_id: requestId,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.be.an('array').that.is.not.empty;
  });

  it('AS (as2) should remove saved private messages successfully', async function() {
    const response = await commonApi.removePrivateMessages('as2', {
      request_id: requestId,
    });
    expect(response.status).to.equal(204);
  });

  it('AS (as2) should have no saved private messages left after removal', async function() {
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
