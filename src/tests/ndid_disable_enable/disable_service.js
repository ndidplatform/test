import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import * as ndidApi from '../../api/v2/ndid';
import * as rpApi from '../../api/v2/rp';
import * as asApi from '../../api/v2/as';
import * as commonApi from '../../api/v2/common';
import * as idpApi from '../../api/v2/idp';

import { ndidAvailable, as1Available } from '..';
import {
  as1EventEmitter,
  idp1EventEmitter,
  rpEventEmitter,
} from '../../callback_server';
import {
  createEventPromise,
  generateReferenceId,
  wait,
  hashRequestMessageForConsent,
} from '../../utils';
import * as config from '../../config';

describe('NDID disable service test', function() {
  const namespace = 'cid';
  const identifier = uuidv4();

  const testDisableServiceReferenceId = generateReferenceId();
  const rpReferenceId = generateReferenceId();

  const addOrUpdateServiceResultPromise = createEventPromise(); // AS

  let createRequestParams;
  let alreadyAddedService;

  before(async function() {
    if (!ndidAvailable || !as1Available) {
      this.skip();
    }

    createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 1,
      namespace,
      identifier,
      idp_id_list: ['idp1'],
      data_request_list: [
        {
          service_id: 'test_disable_service',
          as_id_list: ['as1'],
          min_as: 1,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
      ],
      request_message: 'Test request message (disabled service)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    };

    as1EventEmitter.on('callback', function(callbackData) {
      if (callbackData.type === 'add_or_update_service_result') {
        if (callbackData.reference_id === testDisableServiceReferenceId) {
          addOrUpdateServiceResultPromise.resolve(callbackData);
        }
      }
    });

    const responseGetServices = await commonApi.getServices('ndid1');
    const responseBody = await responseGetServices.json();
    alreadyAddedService = responseBody.find(
      service => service.service_id === 'test_disable_service'
    );
  });

  it('NDID should add new service (test_disable_service) successfully', async function() {
    this.timeout(10000);

    const response = await ndidApi.addService('ndid1', {
      service_id: 'test_disable_service',
      service_name: 'Test disable service',
    });

    //If already added test_disable_service service then expect error code
    if (alreadyAddedService) {
      const responseBody = await response.json();
      expect(response.status).to.equal(400);
      expect(responseBody.error.code).to.equal(25005);
    } else {
      expect(response.status).to.equal(201);
    }
    await wait(3000);
  });

  it('Service (test_disable_service) should be added successfully', async function() {
    this.timeout(10000);

    const response = await commonApi.getServices('ndid1');
    const responseBody = await response.json();
    const service = responseBody.find(
      service => service.service_id === 'test_disable_service'
    );
    expect(service).to.deep.equal({
      service_id: 'test_disable_service',
      service_name: 'Test disable service',
      active: true,
    });
  });

  it('NDID should approve service (test_disable_service) for as1 successfully', async function() {
    this.timeout(10000);

    const response = await ndidApi.approveService('ndid1', {
      node_id: 'as1',
      service_id: 'test_disable_service',
    });
    expect(response.status).to.equal(204);
    await wait(1000);
  });

  it('AS should add offered service (test_disable_service) successfully', async function() {
    this.timeout(30000);
    const response = await asApi.addOrUpdateService('as1', {
      serviceId: 'test_disable_service',
      reference_id: testDisableServiceReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      min_ial: 1.1,
      min_aal: 1,
      url: config.AS1_CALLBACK_URL,
    });
    expect(response.status).to.equal(202);

    const addOrUpdateServiceResult = await addOrUpdateServiceResultPromise.promise;
    expect(addOrUpdateServiceResult).to.deep.include({
      reference_id: testDisableServiceReferenceId,
      success: true,
    });
  });

  it('NDID should disable service (test_disable_service) successfully', async function() {
    this.timeout(10000);

    const response = await ndidApi.disableService('ndid1', {
      service_id: 'test_disable_service',
    });

    expect(response.status).to.equal(204);
    await wait(3000);
  });

  it('Service (test_disable_service) should be disabled successfully', async function() {
    this.timeout(10000);

    const responseAsGetService = await asApi.getService('as1', {
      serviceId: 'test_disable_service',
    });

    expect(responseAsGetService.status).to.equal(404);

    const responseUtilityGetServices = await commonApi.getServices('as1');
    const responseBody = await responseUtilityGetServices.json();

    let service = responseBody.find(
      service => service.service_id === 'test_disable_service'
    );

    expect(service).to.be.an('undefined');
  });

  it('After NDID disabled service (test_disable_service) RP should create a request unsuccessfully', async function() {
    this.timeout(10000);
    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20024);
  });

  after(async function() {
    this.timeout(5000);
    await ndidApi.enableService('ndid1', {
      service_id: 'test_disable_service',
    });
    await wait(2000);

    as1EventEmitter.removeAllListeners('callback');
  });
});

describe('NDID disable service after RP create request test', function() {
  const namespace = 'cid';
  const identifier = uuidv4();

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const asServiceReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise(); // RP
  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise(); // IDP
  const dataRequestReceivedPromise = createEventPromise(); // AS
  const sendDataResultPromise = createEventPromise(); // AS

  let createRequestParams;
  let requestId;
  let requestMessageHash;

  before(async function() {
    if (!ndidAvailable || !as1Available) {
      this.skip();
    }

    createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 1,
      namespace,
      identifier,
      idp_id_list: ['idp1'],
      data_request_list: [
        {
          service_id: 'test_disable_service',
          as_id_list: ['as1'],
          min_as: 1,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
      ],
      request_message:
        'Test request message (disable service after rp create request)',
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
        dataRequestReceivedPromise.resolve(callbackData);
      } else if (callbackData.type === 'send_data_result') {
        if (callbackData.reference_id === asServiceReferenceId) {
          sendDataResultPromise.resolve(callbackData);
        }
      }
    });
  });

  it('RP should create a request successfully', async function() {
    this.timeout(10000);
    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();

    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

    requestId = responseBody.request_id;

    const createRequestResult = await createRequestResultPromise.promise;
    expect(createRequestResult.success).to.equal(true);
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
    });
    expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
      .empty;
    expect(incomingRequest.creation_time).to.be.a('number');

    requestMessageHash = incomingRequest.request_message_hash;
  });

  it('IdP should create response (accept) successfully', async function() {
    this.timeout(10000);

    const response = await idpApi.createResponse('idp1', {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      namespace: createRequestParams.namespace,
      identifier: createRequestParams.identifier,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      signature: 'Some signature',
    });
    expect(response.status).to.equal(202);

    const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      reference_id: idpReferenceId,
      request_id: requestId,
      success: true,
    });
  });

  it('NDID should disable service (test_disable_service) successfully', async function() {
    this.timeout(10000);

    const response = await ndidApi.disableService('ndid1', {
      service_id: 'test_disable_service',
    });

    expect(response.status).to.equal(204);
    await wait(3000);
  });

  it('Service (test_disable_service) should be disabled successfully', async function() {
    this.timeout(10000);

    const responseAsGetService = await asApi.getService('as1', {
      serviceId: 'test_disable_service',
    });

    expect(responseAsGetService.status).to.equal(404);

    const responseUtilityGetServices = await commonApi.getServices('as1');
    const responseBody = await responseUtilityGetServices.json();

    let service = responseBody.find(
      service => service.service_id === 'test_disable_service'
    );

    expect(service).to.be.an('undefined');
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
    });
    expect(dataRequest.response_signature_list).to.have.lengthOf(1);
    expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is.not
      .empty;
  });

  it('AS should send data unsuccessfully (test_disable_service)', async function() {
    this.timeout(15000);
    const response = await asApi.sendData('as1', {
      requestId,
      serviceId: createRequestParams.data_request_list[0].service_id,
      reference_id: asServiceReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      data: 'Test service is disabled after rp create request ',
    });
    expect(response.status).to.equal(202);

    const sendDataResult = await sendDataResultPromise.promise;
    expect(sendDataResult).to.deep.include({
      reference_id: asServiceReferenceId,
      request_id: requestId,
      success: false,
    });
    expect(sendDataResult.error.code).to.equal(15023);
  });

  after(async function() {
    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
    as1EventEmitter.removeAllListeners('callback');
  });
});

describe('NDID disable service before AS offered service test', function() {
  const testDisableServiceBeforeASOfferredReferenceId = generateReferenceId();

  const addOrUpdateServiceResultPromise = createEventPromise(); // AS

  let alreadyAddedService;

  before(async function() {
    this.skip();
    if (!ndidAvailable || !as1Available) {
      this.skip();
    }

    as1EventEmitter.on('callback', function(callbackData) {
      if (callbackData.type === 'add_or_update_service_result') {
        if (
          callbackData.reference_id ===
          testDisableServiceBeforeASOfferredReferenceId
        ) {
          addOrUpdateServiceResultPromise.resolve(callbackData);
        }
      }
    });

    const responseGetServices = await commonApi.getServices('ndid1');
    const responseBody = await responseGetServices.json();
    alreadyAddedService = responseBody.find(
      service =>
        service.service_id === 'test_disable_service_before_as_offered_service'
    );
  });

  it('NDID should add new service (test_disable_service_before_as_offered_service) successfully', async function() {
    this.timeout(10000);

    const response = await ndidApi.addService('ndid1', {
      service_id: 'test_disable_service_before_as_offered_service',
      service_name: 'Test disable service before as offerred service',
    });

    //If already added test_disable_service_before_as_offered_service service then expect error code
    if (alreadyAddedService) {
      const responseBody = await response.json();
      expect(response.status).to.equal(400);
      expect(responseBody.error.code).to.equal(25005);
    } else {
      expect(response.status).to.equal(201);
    }
    await wait(3000);
  });

  it('Service (test_disable_service_before_as_offered_service) should be added successfully', async function() {
    this.timeout(10000);

    const response = await commonApi.getServices('ndid1');
    const responseBody = await response.json();
    const service = responseBody.find(
      service =>
        service.service_id === 'test_disable_service_before_as_offered_service'
    );
    expect(service).to.deep.equal({
      service_id: 'test_disable_service_before_as_offered_service',
      service_name: 'Test disable service before as offerred service',
      active: true,
    });
  });

  it('NDID should approve service (test_disable_service_before_as_offered_service) for as1 successfully', async function() {
    this.timeout(10000);

    const response = await ndidApi.approveService('ndid1', {
      node_id: 'as1',
      service_id: 'test_disable_service_before_as_offered_service',
    });
    expect(response.status).to.equal(204);
    await wait(3000);
  });

  it('NDID should disable service (test_disable_service_before_as_offered_service) successfully', async function() {
    this.timeout(10000);

    const response = await ndidApi.disableService('ndid1', {
      service_id: 'test_disable_service_before_as_offered_service',
    });

    expect(response.status).to.equal(204);
    await wait(3000);
  });

  it('Service (test_disable_service_before_as_offered_service) should be disabled successfully', async function() {
    this.timeout(10000);

    const responseAsGetService = await asApi.getService('as1', {
      serviceId: 'test_disable_service_before_as_offered_service',
    });

    expect(responseAsGetService.status).to.equal(404);

    const responseUtilityGetServices = await commonApi.getServices('as1');
    const responseBody = await responseUtilityGetServices.json();

    let service = responseBody.find(
      service =>
        service.service_id === 'test_disable_service_before_as_offered_service'
    );

    expect(service).to.be.an('undefined');
  });

  it('AS should add offered service (test_disable_service_before_as_offered_service) unsuccessfully', async function() {
    this.timeout(30000);
    const response = await asApi.addOrUpdateService('as1', {
      serviceId: 'test_disable_service_before_as_offered_service',
      reference_id: testDisableServiceBeforeASOfferredReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      min_ial: 1.1,
      min_aal: 1,
      url: config.AS1_CALLBACK_URL,
    });
    expect(response.status).to.equal(202);

    const addOrUpdateServiceResult = await addOrUpdateServiceResultPromise.promise;
    expect(addOrUpdateServiceResult).to.deep.include({
      reference_id: testDisableServiceBeforeASOfferredReferenceId,
      success: false,
    });
    expect(addOrUpdateServiceResult.error.code).to.equal(15023);
  });

  after(async function() {
    this.timeout(5000);
    await ndidApi.enableService('ndid1', {
      service_id: 'test_disable_service_before_as_offered_service',
    });
    await wait(2000);

    as1EventEmitter.removeAllListeners('callback');
  });
});
