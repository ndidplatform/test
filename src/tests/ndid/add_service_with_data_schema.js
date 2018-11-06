import { expect } from 'chai';

import * as ndidApi from '../../api/v2/ndid';
import * as commonApi from '../../api/v2/common';
import * as rpApi from '../../api/v2/rp';
import * as idpApi from '../../api/v2/idp';
import * as asApi from '../../api/v2/as';
import { ndidAvailable } from '..';
import * as db from '../../db';
import {
  as1EventEmitter,
  idp1EventEmitter,
  rpEventEmitter,
} from '../../callback_server';
import {
  createEventPromise,
  generateReferenceId,
  hashRequestMessageForConsent,
  wait,
  createResponseSignature,
} from '../../utils';
import * as config from '../../config';

describe('NDID add and update service with data_schema test', function() {
  const originalDataSchema = JSON.stringify({
    properties: {
      firstname: {
        type: 'string',
        maxLength: 100,
      },
      lastname: {
        type: 'string',
        maxLength: 100,
      },
      age: {
        type: 'integer',
        minimum: 1,
      },
      email: {
        type: 'string',
        format: 'email',
        maxLength: 100,
      },
      photo: {
        type: 'string',
      },
      citizen_id: {
        type: 'integer',
      },
    },
    required: ['firstname', 'lastname', 'citizen_id'],
  });
  describe('NDID add new service with data_schema test', function() {
    let namespace;
    let identifier;

    const rpReferenceId = generateReferenceId();
    const idpReferenceId = generateReferenceId();
    const asReferenceId = generateReferenceId();
    const serviceWithDataSchemaReferenceId = generateReferenceId();

    const addOrUpdateServiceResultPromise = createEventPromise();
    const createRequestResultPromise = createEventPromise(); // RP
    const incomingRequestPromise = createEventPromise(); // IDP
    const responseResultPromise = createEventPromise(); // IDP
    const dataRequestReceivedPromise = createEventPromise(); // AS
    const sendDataResultPromise = createEventPromise(); // AS
    const requestStatusSignedDataPromise = createEventPromise(); // RP
    const requestStatusCompletedPromise = createEventPromise(); // RP
    const requestClosedPromise = createEventPromise(); // RP

    let alreadyAddedService = false;
    let requestId;
    let requestMessageSalt;
    let requestMessageHash;

    let createRequestParams;

    before(async function() {
      this.timeout(15000);
      if (!ndidAvailable) {
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
            service_id: 'service_with_data_schema',
            as_id_list: ['as1'],
            min_as: 1,
            request_params: JSON.stringify({
              format: 'pdf',
            }),
          },
        ],
        request_message:
          'Test request message (add new service with data_schema) (mode 3)',
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
          if (callbackData.status === 'confirmed') {
            if (callbackData.service_list[0].signed_data_count === 1) {
              requestStatusSignedDataPromise.resolve(callbackData);
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
        if (callbackData.type === 'add_or_update_service_result') {
          if (callbackData.reference_id === serviceWithDataSchemaReferenceId) {
            addOrUpdateServiceResultPromise.resolve(callbackData);
          }
        }
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

      const responseGetServices = await commonApi.getServices('ndid1');
      const responseBody = await responseGetServices.json();
      alreadyAddedService = responseBody.find(
        (service) => service.service_id === 'service_with_data_schema'
      );
    });

    it('NDID should add new service (service_with_data_schema) with data_schema successfully', async function() {
      this.timeout(15000);
      if (alreadyAddedService) {
        const response = await ndidApi.updateService('ndid1', {
          service_id: 'service_with_data_schema',
          service_name: 'Test add new service with data schema',
          data_schema: originalDataSchema,
          data_schema_version: '1',
        });
        expect(response.status).to.equal(201);
      } else {
        const response = await ndidApi.addService('ndid1', {
          service_id: 'service_with_data_schema',
          service_name: 'Test add new service with data schema',
          data_schema: originalDataSchema,
          data_schema_version: '1',
        });
        expect(response.status).to.equal(201);
      }
      await wait(3000);
    });

    it('Service (service_with_data_schema) should be added successfully', async function() {
      this.timeout(15000);
      const response = await commonApi.getServices('ndid1');
      const responseBody = await response.json();
      const service = responseBody.find(
        (service) => service.service_id === 'service_with_data_schema'
      );
      expect(service).to.deep.equal({
        service_id: 'service_with_data_schema',
        service_name: 'Test add new service with data schema',
        active: true,
      });
    });

    it('NDID should approve service (service_with_data_schema) for as1 successfully', async function() {
      this.timeout(10000);
      const response = await ndidApi.approveService('ndid1', {
        node_id: 'as1',
        service_id: 'service_with_data_schema',
      });
      expect(response.status).to.equal(204);
      await wait(3000);
    });

    it('AS should add offered service (service_with_data_schema) successfully', async function() {
      this.timeout(30000);
      const response = await asApi.addOrUpdateService('as1', {
        serviceId: 'service_with_data_schema',
        reference_id: serviceWithDataSchemaReferenceId,
        callback_url: config.AS1_CALLBACK_URL,
        min_ial: 1.1,
        min_aal: 1,
        url: config.AS1_CALLBACK_URL,
      });
      expect(response.status).to.equal(202);

      const addOrUpdateServiceResult = await addOrUpdateServiceResultPromise.promise;
      expect(addOrUpdateServiceResult).to.deep.include({
        reference_id: serviceWithDataSchemaReferenceId,
        success: true,
      });
      await wait(5000);
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

    it('IdP should receive incoming request callback', async function() {
      this.timeout(20000);
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
      expect(dataRequest.response_signature_list).to.have.lengthOf(1);
      expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is
        .not.empty;
      expect(dataRequest.creation_time).to.be.a('number');
      expect(dataRequest.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = dataRequest.creation_block_height.split(
        ':'
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('AS should send data with invalid data_schema (does not send required field (citizen_id)) unsuccessfully', async function() {
      this.timeout(15000);

      const data = JSON.stringify({
        firstname: 'NDID',
        lastname: 'NDID',
        age: 25,
        email: 'NDID@gmail.com',
        photo: 'Photo',
      });

      const response = await asApi.sendData('as1', {
        requestId,
        serviceId: createRequestParams.data_request_list[0].service_id,
        reference_id: asReferenceId,
        callback_url: config.AS1_CALLBACK_URL,
        data,
      });
      expect(response.status).to.equal(400);
      const responseBody = await response.json();
      expect(responseBody.error.code).to.equal(20059);
      expect(responseBody.error.message).to.equal('Data validation failed');
    });

    it('AS should send data with invalid data schema (does not match citizen_id type) unsuccessfully', async function() {
      this.timeout(15000);

      const data = JSON.stringify({
        firstname: 'NDID',
        lastname: 'NDID',
        age: 25,
        email: 'NDID@gmail.com',
        photo: 'Photo',
        citizen_id: '12345',
      });

      const response = await asApi.sendData('as1', {
        requestId,
        serviceId: createRequestParams.data_request_list[0].service_id,
        reference_id: asReferenceId,
        callback_url: config.AS1_CALLBACK_URL,
        data,
      });
      expect(response.status).to.equal(400);
      const responseBody = await response.json();
      expect(responseBody.error.code).to.equal(20059);
      expect(responseBody.error.message).to.equal('Data validation failed');
    });

    it('AS should send data with valid data schema successfully', async function() {
      this.timeout(15000);

      const data = JSON.stringify({
        firstname: 'NDID',
        lastname: 'NDID',
        age: 25,
        email: 'NDID@gmail.com',
        photo: 'Photo',
        citizen_id: 9999999999999,
      });

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
            signed_data_count: 1,
            received_data_count: 1,
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
      const data = JSON.stringify({
        firstname: 'NDID',
        lastname: 'NDID',
        age: 25,
        email: 'NDID@gmail.com',
        photo: 'Photo',
        citizen_id: 9999999999999,
      });

      const response = await rpApi.getDataFromAS('rp1', {
        requestId,
      });
      const dataArr = await response.json();
      expect(response.status).to.equal(200);

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
  });

  describe('NDID update service with new data_schema test', function() {
    let namespace;
    let identifier;

    const rpReferenceId = generateReferenceId();
    const idpReferenceId = generateReferenceId();
    const asReferenceId = generateReferenceId();
    const serviceWithDataSchemaReferenceId = generateReferenceId();

    const addOrUpdateServiceResultPromise = createEventPromise();
    const createRequestResultPromise = createEventPromise(); // RP
    const requestStatusPendingPromise = createEventPromise(); // RP
    const incomingRequestPromise = createEventPromise(); // IDP
    const responseResultPromise = createEventPromise(); // IDP
    const requestStatusConfirmedPromise = createEventPromise(); // RP
    const dataRequestReceivedPromise = createEventPromise(); // AS
    const sendDataResultPromise = createEventPromise(); // AS
    const requestStatusSignedDataPromise = createEventPromise(); // RP
    const requestStatusCompletedPromise = createEventPromise(); // RP
    const requestClosedPromise = createEventPromise(); // RP

    let alreadyAddedService = false;
    let requestId;
    let requestMessageSalt;
    let requestMessageHash;

    let createRequestParams;

    before(async function() {
      this.timeout(15000);
      if (!ndidAvailable) {
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
            service_id: 'service_with_data_schema',
            as_id_list: ['as1'],
            min_as: 1,
            request_params: JSON.stringify({
              format: 'pdf',
            }),
          },
        ],
        request_message:
          'Test request message (update service with new data_schema) (mode 3)',
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

      as1EventEmitter.on('callback', function(callbackData) {
        if (callbackData.type === 'add_or_update_service_result') {
          if (callbackData.reference_id === serviceWithDataSchemaReferenceId) {
            addOrUpdateServiceResultPromise.resolve(callbackData);
          }
        }
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

      const responseGetServices = await commonApi.getServices('ndid1');
      const responseBody = await responseGetServices.json();
      alreadyAddedService = responseBody.find(
        (service) => service.service_id === 'service_with_data_schema'
      );
    });

    it('NDID should update service service (service_with_data_schema) with new data_schema successfully', async function() {
      this.timeout(15000);
      const response = await ndidApi.updateService('ndid1', {
        service_id: 'service_with_data_schema',
        service_name: 'Test add new service with data schema',
        data_schema: JSON.stringify({
          properties: {
            firstname: {
              type: 'string',
              maxLength: 100,
            },
            lastname: {
              type: 'string',
              maxLength: 100,
            },
            passport_no: {
              type: 'integer',
            },
            citizen_id: {
              type: 'integer',
            },
          },
          required: ['firstname', 'lastname', 'citizen_id', 'passport_no'],
        }),
        data_schema_version: '1',
      });
      expect(response.status).to.equal(201);
      await wait(3000);
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

    it('IdP should receive incoming request callback', async function() {
      this.timeout(20000);
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
      expect(dataRequest.response_signature_list).to.have.lengthOf(1);
      expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is
        .not.empty;
      expect(dataRequest.creation_time).to.be.a('number');
      expect(dataRequest.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = dataRequest.creation_block_height.split(
        ':'
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('AS should send data with invalid data_schema (does not send required field (passport_no)) unsuccessfully', async function() {
      this.timeout(15000);

      const data = JSON.stringify({
        firstname: 'NDID',
        lastname: 'NDID',
        age: 25,
        email: 'NDID@gmail.com',
        photo: 'Photo',
        citizen_id: 9999999999999,
      });

      const response = await asApi.sendData('as1', {
        requestId,
        serviceId: createRequestParams.data_request_list[0].service_id,
        reference_id: asReferenceId,
        callback_url: config.AS1_CALLBACK_URL,
        data,
      });
      expect(response.status).to.equal(400);
      const responseBody = await response.json();
      expect(responseBody.error.code).to.equal(20059);
      expect(responseBody.error.message).to.equal('Data validation failed');
    });

    it('AS should send data with invalid data schema (does not match passport_no type) unsuccessfully', async function() {
      this.timeout(15000);

      const data = JSON.stringify({
        firstname: 'NDID',
        lastname: 'NDID',
        age: 25,
        email: 'NDID@gmail.com',
        photo: 'Photo',
        citizen_id: 9999999999999,
        passport_no: '12345',
      });

      const response = await asApi.sendData('as1', {
        requestId,
        serviceId: createRequestParams.data_request_list[0].service_id,
        reference_id: asReferenceId,
        callback_url: config.AS1_CALLBACK_URL,
        data,
      });
      expect(response.status).to.equal(400);
      const responseBody = await response.json();
      expect(responseBody.error.code).to.equal(20059);
      expect(responseBody.error.message).to.equal('Data validation failed');
    });

    it('AS should send data with valid data_schema successfully', async function() {
      this.timeout(15000);
      const data = JSON.stringify({
        firstname: 'NDID',
        lastname: 'NDID',
        citizen_id: 9999999999999,
        passport_no: 123456789,
      });

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
            signed_data_count: 1,
            received_data_count: 1,
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
      const data = JSON.stringify({
        firstname: 'NDID',
        lastname: 'NDID',
        citizen_id: 9999999999999,
        passport_no: 123456789,
      });
      const response = await rpApi.getDataFromAS('rp1', {
        requestId,
      });
      const dataArr = await response.json();
      expect(response.status).to.equal(200);

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

    after(async function() {
      this.timeout(15000);
      await ndidApi.updateService('ndid1', {
        service_id: 'service_with_data_schema',
        service_name: 'Test add new service with data schema',
        data_schema: originalDataSchema,
        data_schema_version: '1',
      });
      await wait(3000);
    });
  });

  describe('NDID update service with data_schema = n/a (does not validate data) test', function() {
    let namespace;
    let identifier;

    const rpReferenceId = generateReferenceId();
    const idpReferenceId = generateReferenceId();
    const asReferenceId = generateReferenceId();
    const serviceWithDataSchemaReferenceId = generateReferenceId();

    const addOrUpdateServiceResultPromise = createEventPromise();
    const createRequestResultPromise = createEventPromise(); // RP
    const requestStatusPendingPromise = createEventPromise(); // RP
    const incomingRequestPromise = createEventPromise(); // IDP
    const responseResultPromise = createEventPromise(); // IDP
    const requestStatusConfirmedPromise = createEventPromise(); // RP
    const dataRequestReceivedPromise = createEventPromise(); // AS
    const sendDataResultPromise = createEventPromise(); // AS
    const requestStatusSignedDataPromise = createEventPromise(); // RP
    const requestStatusCompletedPromise = createEventPromise(); // RP
    const requestClosedPromise = createEventPromise(); // RP

    let alreadyAddedService = false;
    let requestId;
    let requestMessageSalt;
    let requestMessageHash;

    let createRequestParams;

    before(async function() {
      this.timeout(15000);
      if (!ndidAvailable) {
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
            service_id: 'service_with_data_schema',
            as_id_list: ['as1'],
            min_as: 1,
            request_params: JSON.stringify({
              format: 'pdf',
            }),
          },
        ],
        request_message:
          'Test request message (update service with new data_schema = n/a (does not validate data)) (mode 3)',
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

      as1EventEmitter.on('callback', function(callbackData) {
        if (callbackData.type === 'add_or_update_service_result') {
          if (callbackData.reference_id === serviceWithDataSchemaReferenceId) {
            addOrUpdateServiceResultPromise.resolve(callbackData);
          }
        }
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

      const responseGetServices = await commonApi.getServices('ndid1');
      const responseBody = await responseGetServices.json();
      alreadyAddedService = responseBody.find(
        (service) => service.service_id === 'service_with_data_schema'
      );
    });

    it('NDID should update service service (service_with_data_schema) with new data_schema successfully', async function() {
      this.timeout(15000);
      const response = await ndidApi.updateService('ndid1', {
        service_id: 'service_with_data_schema',
        service_name: 'Test add new service with data schema',
        data_schema: 'n/a',
        data_schema_version: 'n/a',
      });
      expect(response.status).to.equal(201);
      await wait(3000);
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

    it('IdP should receive incoming request callback', async function() {
      this.timeout(20000);
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
      expect(dataRequest.response_signature_list).to.have.lengthOf(1);
      expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is
        .not.empty;
      expect(dataRequest.creation_time).to.be.a('number');
      expect(dataRequest.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = dataRequest.creation_block_height.split(
        ':'
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('AS should send whatever data successfully', async function() {
      this.timeout(15000);
      const data = JSON.stringify({
        data: 'whatever data',
      });

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
            signed_data_count: 1,
            received_data_count: 1,
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
      const data = JSON.stringify({
        data: 'whatever data',
      });
      const response = await rpApi.getDataFromAS('rp1', {
        requestId,
      });
      const dataArr = await response.json();
      expect(response.status).to.equal(200);

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

    after(async function() {
      this.timeout(15000);
      await ndidApi.updateService('ndid1', {
        service_id: 'service_with_data_schema',
        service_name: 'Test add new service with data schema',
        data_schema: originalDataSchema,
        data_schema_version: '1',
      });
      await wait(3000);
    });
  });
});
