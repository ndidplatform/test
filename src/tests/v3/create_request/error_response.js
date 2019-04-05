import { expect } from 'chai';

import * as rpApi from '../../../api/v3/rp';
import * as ndidApi from '../../../api/v3/ndid';
import * as commonApi from '../../../api/v3/common';
import * as asApi from '../../../api/v3/as';
import * as db from '../../../db';
import { generateReferenceId, wait, createEventPromise } from '../../../utils';
import { as1Available, ndidAvailable } from '../../';
import { as1EventEmitter, as2EventEmitter } from '../../../callback_server';
import * as config from '../../../config';

describe('RP create request errors', function() {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();

  before(function() {
    if (db.idp1Identities[0] == null) {
      throw new Error('No created identity to use');
    }

    namespace = db.idp1Identities[0].namespace;
    identifier = db.idp1Identities[0].identifier;
  });

  it('should get an error when creating a request without IdP ID list in mode 1', async function() {
    const createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 1,
      namespace,
      identifier,
      // idp_id_list: [],
      data_request_list: [],
      request_message: 'Test request message (error create request) (mode 3)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    };

    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20016);
  });

  it('should get an error when creating a request with empty IdP ID list in mode 1', async function() {
    const createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 1,
      namespace,
      identifier,
      idp_id_list: [],
      data_request_list: [],
      request_message: 'Test request message (error create request) (mode 3)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    };

    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20016);
  });

  it('should get an error when creating a request with AS ID that does not provide the requested service', async function() {
    const createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 3,
      namespace,
      identifier,
      idp_id_list: [],
      data_request_list: [
        {
          service_id: 'bank_statement',
          as_id_list: ['as1', 'as2', 'as3'],
          min_as: 1,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
        // {
        //   service_id: 'customer_info',
        //   as_id_list: ['as3'],
        //   min_as: 1,
        //   request_params: JSON.stringify({
        //     format: 'pdf',
        //   }),
        // },
      ],
      request_message: 'Test request message (error create request) (mode 3)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    };

    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20043);
  });

  it('should get an error when creating a request with AS ID that offer the service is less than minimum AS needed', async function() {
    const createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 3,
      namespace,
      identifier,
      idp_id_list: [],
      data_request_list: [
        {
          service_id: 'customer_info',
          as_id_list: ['as3'],
          min_as: 1,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
      ],
      request_message: 'Test request message (error create request) (mode 3)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    };

    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20024);
  });

  it('should get an error when creating a request with duplicate whole object service in data request list', async function() {
    const createRequestParams = {
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
          service_id: 'bank_statement',
          as_id_list: ['as1'],
          min_as: 1,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
      ],
      request_message: 'Test request message (error create request) (mode 3)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    };

    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20003);
  });

  it('should get an error when creating a request with duplicate service IDs in data request list', async function() {
    const createRequestParams = {
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
          service_id: 'bank_statement',
          as_id_list: ['as1'],
          min_as: 1,
          request_params: JSON.stringify({
            format: 'doc',
          }),
        },
      ],
      request_message: 'Test request message (error create request) (mode 3)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    };

    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20018);
  });

  it('should get an error when creating a request with as_id_list less than min_as in data request list', async function() {
    const createRequestParams = {
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
          min_as: 2,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
      ],
      request_message: 'Test request message (error create request) (mode 3)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    };

    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20017);
  });

  it('should get an error when creating a request with request_timeout = 0', async function() {
    const createRequestParams = {
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
      request_message: 'Test request message (error create request) (mode 3)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 0,
    };

    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20003);
  });

  it('should get an error when creating a request with request_timeout is string', async function() {
    const createRequestParams = {
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
      request_message: 'Test request message (error create request) (mode 3)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: '86400',
    };

    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20003);
  });

  it("should get an error when creating a request with min_ial (3) greater than identity's ial (2.3) ", async function() {
    let identity = db.idp1Identities.find(identity => identity.mode === 3);
    namespace = identity.namespace;
    identifier = identity.identifier;

    const createRequestParams = {
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
      request_message: 'Test request message (error create request) (mode 3)',
      min_ial: 3,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    };

    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20005);
  });

  it('should get an error when creating a request without request_message key ', async function() {
    const createRequestParams = {
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
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    };

    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20003);
  });

  it('should get an error when creating a request without min_ial key ', async function() {
    const createRequestParams = {
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
      request_message: 'Test request message (error create request) (mode 3)',
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    };

    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20003);
  });

  it('should get an error when creating a request without min_aal key ', async function() {
    const createRequestParams = {
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
      request_message: 'Test request message (error create request) (mode 3)',
      min_ial: 1.1,
      min_idp: 1,
      request_timeout: 86400,
    };

    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20003);
  });

  it('should get an error when creating a request without min_idp key ', async function() {
    const createRequestParams = {
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
      request_message: 'Test request message (error create request) (mode 3)',
      min_ial: 1.1,
      min_aal: 1,
      request_timeout: 86400,
    };

    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20003);
  });

  it('should get an error when creating a request without request_timeout key ', async function() {
    const createRequestParams = {
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
      request_message: 'Test request message (error create request) (mode 3)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
    };

    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20003);
  });

  it('should get an error when creating a request without min_as key', async function() {
    const createRequestParams = {
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
          request_params: 'string',
        },
      ],
      request_message: 'Test request message (error create request) (mode 3)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    };

    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20003);
  });

  it('should get an error when creating a request with idp_id_list is array with empty string (mode 1)', async function() {
    const createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 1,
      namespace,
      identifier,
      idp_id_list: [''],
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
      request_message: 'Test request message (error create request) (mode 1)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    };

    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20003);
  });

  it('should get an error when creating a request with idp_id_list is array with empty string (mode 3)', async function() {
    const createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 3,
      namespace,
      identifier,
      idp_id_list: [''],
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
      request_message: 'Test request message (error create request) (mode 3)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    };

    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20003);
  });

  it('should get an error when creating a request with service_id is empty string', async function() {
    const createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 3,
      namespace,
      identifier,
      idp_id_list: [],
      data_request_list: [
        {
          service_id: '',
          as_id_list: ['as1'],
          min_as: 1,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
      ],
      request_message: 'Test request message (error create request) (mode 3)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    };

    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20003);
  });

  it('should get an error when creating a request with as_id_list is empty string', async function() {
    const createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 3,
      namespace,
      identifier,
      idp_id_list: [],
      data_request_list: [
        {
          service_id: 'bank_statement',
          as_id_list: [''],
          min_as: 1,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
      ],
      request_message: 'Test request message (error create request) (mode 3)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    };

    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20003);
  });

  it('RP create request (mode 1) with does not have services that accepted this namespace (min_ial and min_aal is valid but min_as is invalid)', async function() {
    //potential as_id_list length = 0 but min_as = 1
    const createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 1,
      namespace: 'foo',
      identifier: 'bar',
      idp_id_list: ['idp1'],
      data_request_list: [
        {
          service_id: 'bank_statement',
          as_id_list: [],
          min_as: 1,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
      ],
      request_message: 'Test request message (error create request) (mode 3)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    };

    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20022);
  });

  it('RP create request (mode 1) with does not have services that accepted this namespace (min_ial or min_aal is invalid but min_as is valid)', async function() {
    this.timeout(50000);
    //potential as_id_list min_as is valid
    //but some service in request min_ial or min_aal too low
    const responseUpdateService = await asApi.addOrUpdateService('as1', {
      serviceId: 'bank_statement',
      reference_id: generateReferenceId(),
      callback_url: config.AS1_CALLBACK_URL,
      min_ial: 3,
      min_aal: 3,
    });
    expect(responseUpdateService.status).to.equal(202);

    const as2ResponseUpdateService = await asApi.addOrUpdateService('as2', {
      serviceId: 'bank_statement',
      reference_id: generateReferenceId(),
      callback_url: config.AS2_CALLBACK_URL,
      min_ial: 3,
      min_aal: 3,
    });
    expect(responseUpdateService.status).to.equal(202);
    expect(as2ResponseUpdateService.status).to.equal(202);

    await wait(3000);

    const response = await asApi.getService('as1', {
      serviceId: 'bank_statement',
    });

    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.deep.include({
      min_ial: 3,
      min_aal: 3,
      url: config.AS1_CALLBACK_URL,
      active: true,
      suspended: false,
    });

    const as2Response = await asApi.getService('as2', {
      serviceId: 'bank_statement',
    });

    const as2ResponseBody = await as2Response.json();
    expect(response.status).to.equal(200);
    expect(as2ResponseBody).to.deep.include({
      min_ial: 3,
      min_aal: 3,
      url: config.AS2_CALLBACK_URL,
      active: true,
      suspended: false,
    });

    const createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 1,
      namespace,
      identifier,
      idp_id_list: ['idp1'],
      data_request_list: [
        {
          service_id: 'bank_statement',
          as_id_list: [],
          min_as: 1,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
      ],
      request_message: 'Test request message (error create request) (mode 3)',
      min_ial: 2.3,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    };

    const responseCreateRequest = await rpApi.createRequest(
      'rp1',
      createRequestParams
    );

    const responseBodyCreateRequest = await responseCreateRequest.json();
    expect(responseCreateRequest.status).to.equal(400);
    expect(responseBodyCreateRequest.error.code).to.equal(20022);

    const responseUpdateServiceAftertest = await asApi.addOrUpdateService(
      'as1',
      {
        serviceId: 'bank_statement',
        reference_id: generateReferenceId(),
        callback_url: config.AS1_CALLBACK_URL,
        min_ial: 1.1,
        min_aal: 1,
      }
    );
    expect(responseUpdateServiceAftertest.status).to.equal(202);

    const as2ResponseUpdateServiceAfterTest = await asApi.addOrUpdateService(
      'as2',
      {
        serviceId: 'bank_statement',
        reference_id: generateReferenceId(),
        callback_url: config.AS2_CALLBACK_URL,
        min_ial: 1.1,
        min_aal: 1,
      }
    );
    expect(as2ResponseUpdateServiceAfterTest.status).to.equal(202);

    await wait(3000);

    const responseAfterTest = await asApi.getService('as1', {
      serviceId: 'bank_statement',
    });

    const responseBodyAfterTest = await responseAfterTest.json();
    expect(responseAfterTest.status).to.equal(200);
    expect(responseBodyAfterTest).to.deep.include({
      min_ial: 1.1,
      min_aal: 1,
      url: config.AS1_CALLBACK_URL,
      active: true,
      suspended: false,
    });

    const as2ResponseAfterTest = await asApi.getService('as2', {
      serviceId: 'bank_statement',
    });

    const as2ResponseBodyAfterTest = await as2ResponseAfterTest.json();
    expect(as2ResponseAfterTest.status).to.equal(200);
    expect(as2ResponseBodyAfterTest).to.deep.include({
      min_ial: 1.1,
      min_aal: 1,
      url: config.AS2_CALLBACK_URL,
      active: true,
      suspended: false,
    });
  });

  describe('RP create request (mode 2) with service in data request list does not accepted namespace', async function() {
    before(function() {
      if (!as1Available) {
        this.skip();
      }
      if (!ndidAvailable) {
        this.skip();
      }
    });

    const bankStatementReferenceId = generateReferenceId();
    const addOrUpdateServiceBankStatementResultPromise = createEventPromise();

    const as2BankStatementReferenceId = generateReferenceId();
    const as2AddOrUpdateServiceBankStatementResultPromise = createEventPromise();

    before(function() {
      as1EventEmitter.on('callback', function(callbackData) {
        if (callbackData.type === 'add_or_update_service_result') {
          if (callbackData.reference_id === bankStatementReferenceId) {
            addOrUpdateServiceBankStatementResultPromise.resolve(callbackData);
          }
        }
      });

      as2EventEmitter.on('callback', function(callbackData) {
        if (callbackData.type === 'add_or_update_service_result') {
          if (callbackData.reference_id === as2BankStatementReferenceId) {
            as2AddOrUpdateServiceBankStatementResultPromise.resolve(
              callbackData
            );
          }
        }
      });
    });

    it('NDID should add new namespace (TEST_NAMESPACE) successfully', async function() {
      this.timeout(50000);
      let alreadyAddedNamespace;

      //Check already added TEST_NAMESPACE namespace
      const response = await commonApi.getNamespaces('ndid1');
      const responseBody = await response.json();
      alreadyAddedNamespace = responseBody.find(
        ns => ns.namespace === 'TEST_NAMESPACE'
      );

      let responseNamespace = await ndidApi.registerNamespace('ndid1', {
        namespace: 'TEST_NAMESPACE',
        description: 'TEST_NAMESPACE',
      });

      if (alreadyAddedNamespace) {
        const responseBody = await responseNamespace.json();
        expect(responseNamespace.status).to.equal(400);
        expect(responseBody.error.code).to.equal(25013);
      } else {
        expect(responseNamespace.status).to.equal(201);
      }

      await wait(1000);
    });

    it('AS should add offered service (update accepted_namespace_list bank_statement) successfully', async function() {
      const responseUpdateService = await asApi.addOrUpdateService('as1', {
        serviceId: 'bank_statement',
        reference_id: bankStatementReferenceId,
        callback_url: config.AS1_CALLBACK_URL,
        accepted_namespace_list: ['TEST_NAMESPACE'],
      });
      expect(responseUpdateService.status).to.equal(202);

      const addOrUpdateServiceResult = await addOrUpdateServiceBankStatementResultPromise.promise;
      expect(addOrUpdateServiceResult).to.deep.include({
        reference_id: bankStatementReferenceId,
        success: true,
      });
    });

    it('AS should have offered service (update accepted_namespace_list bank_statement)', async function() {
      const response = await asApi.getService('as1', {
        serviceId: 'bank_statement',
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.deep.equal({
        min_ial: 1.1,
        min_aal: 1,
        url: config.AS1_CALLBACK_URL,
        active: true,
        suspended: false,
        accepted_namespace_list: ['TEST_NAMESPACE'],
      });
    });

    it('AS (as2) should add offered service (update accepted_namespace_list bank_statement) successfully', async function() {
      const responseUpdateService = await asApi.addOrUpdateService('as2', {
        serviceId: 'bank_statement',
        reference_id: as2BankStatementReferenceId,
        callback_url: config.AS2_CALLBACK_URL,
        accepted_namespace_list: ['TEST_NAMESPACE'],
      });
      expect(responseUpdateService.status).to.equal(202);

      const addOrUpdateServiceResult = await as2AddOrUpdateServiceBankStatementResultPromise.promise;
      expect(addOrUpdateServiceResult).to.deep.include({
        reference_id: as2BankStatementReferenceId,
        success: true,
      });
    });

    it('AS (as2) should have offered service (update accepted_namespace_list bank_statement)', async function() {
      const response = await asApi.getService('as2', {
        serviceId: 'bank_statement',
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.deep.equal({
        min_ial: 1.1,
        min_aal: 1,
        url: config.AS2_CALLBACK_URL,
        active: true,
        suspended: false,
        accepted_namespace_list: ['TEST_NAMESPACE'],
      });
    });

    it('RP should create request (mode 2 provide as_id_list) with service in data request does not accepted namespace unsuccessfully', async function() {
      let identity = db.idp1Identities.find(identity => identity.mode === 2);
      namespace = identity.namespace;
      identifier = identity.identifier;

      const createRequestParams = {
        reference_id: generateReferenceId(),
        callback_url: config.RP_CALLBACK_URL,
        mode: 2,
        namespace, // citizen_id
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
        request_message: 'Test request message (error create request) (mode 2)',
        min_ial: 1.1,
        min_aal: 1,
        min_idp: 1,
        request_timeout: 86400,
      };

      const responseRp = await rpApi.createRequest('rp1', createRequestParams);
      const responseBodyRp = await responseRp.json();
      expect(responseRp.status).to.equal(400);
      expect(responseBodyRp.error.code).to.equal(20022);
    });

    it('RP should create request (mode 3 provide as_id_list) with service in data request does not accepted namespace unsuccessfully', async function() {
      let identity = db.idp1Identities.find(identity => identity.mode === 3);
      namespace = identity.namespace;
      identifier = identity.identifier;

      const createRequestParams = {
        reference_id: generateReferenceId(),
        callback_url: config.RP_CALLBACK_URL,
        mode: 3,
        namespace, //citizen_id
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
        request_message: 'Test request message (error create request) (mode 3)',
        min_ial: 1.1,
        min_aal: 1,
        min_idp: 1,
        request_timeout: 86400,
      };

      const responseRp = await rpApi.createRequest('rp1', createRequestParams);
      const responseBodyRp = await responseRp.json();
      expect(responseRp.status).to.equal(400);
      expect(responseBodyRp.error.code).to.equal(20022);
    });

    it('RP should create request (mode 2 without provide as_id_list) with service in data request does not accepted namespace unsuccessfully', async function() {
      let identity = db.idp1Identities.find(identity => identity.mode === 2);
      namespace = identity.namespace;
      identifier = identity.identifier;

      const createRequestParams = {
        reference_id: generateReferenceId(),
        callback_url: config.RP_CALLBACK_URL,
        mode: 2,
        namespace,
        identifier,
        idp_id_list: [],
        data_request_list: [
          {
            service_id: 'bank_statement',
            as_id_list: [],
            min_as: 1,
            request_params: JSON.stringify({
              format: 'pdf',
            }),
          },
        ],
        request_message: 'Test request message (error create request) (mode 2)',
        min_ial: 1.1,
        min_aal: 1,
        min_idp: 1,
        request_timeout: 86400,
      };

      const responseRp = await rpApi.createRequest('rp1', createRequestParams);
      const responseBodyRp = await responseRp.json();
      expect(responseRp.status).to.equal(400);
      expect(responseBodyRp.error.code).to.equal(20022);
    });

    it('RP should create request (mode 3 without provide as_id_list) with service in data request does not accepted namespace unsuccessfully', async function() {
      let identity = db.idp1Identities.find(identity => identity.mode === 3);
      namespace = identity.namespace;
      identifier = identity.identifier;

      const createRequestParams = {
        reference_id: generateReferenceId(),
        callback_url: config.RP_CALLBACK_URL,
        mode: 3,
        namespace,
        identifier,
        idp_id_list: [],
        data_request_list: [
          {
            service_id: 'bank_statement',
            as_id_list: [],
            min_as: 1,
            request_params: JSON.stringify({
              format: 'pdf',
            }),
          },
        ],
        request_message: 'Test request message (error create request) (mode 3)',
        min_ial: 1.1,
        min_aal: 1,
        min_idp: 1,
        request_timeout: 86400,
      };

      const responseRp = await rpApi.createRequest('rp1', createRequestParams);
      const responseBodyRp = await responseRp.json();
      expect(responseRp.status).to.equal(400);
      expect(responseBodyRp.error.code).to.equal(20022);
    });
    after(async function() {
      this.timeout(20000);

      await asApi.addOrUpdateService('as1', {
        serviceId: 'bank_statement',
        reference_id: bankStatementReferenceId,
        callback_url: config.AS1_CALLBACK_URL,
        accepted_namespace_list: ['citizen_id'],
      });

      await asApi.addOrUpdateService('as2', {
        serviceId: 'bank_statement',
        reference_id: bankStatementReferenceId,
        callback_url: config.AS1_CALLBACK_URL,
        accepted_namespace_list: ['citizen_id'],
      });

      await wait(3000);

      as1EventEmitter.removeAllListeners('callback');
      as2EventEmitter.removeAllListeners('callback');
    });
  });
});
