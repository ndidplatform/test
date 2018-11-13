import { expect } from 'chai';

import * as rpApi from '../../api/v2/rp';
import * as db from '../../db';
import { generateReferenceId } from '../../utils';
import * as config from '../../config';

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

  it("should get an error when creating a request with min_ial (3) greater than identity's ial (2.3) ", async function() {
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
          as_id_list: [''],
          min_as: 1,
          request_params: '',
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

  // it('should get an error when creating a request with request_params is empty string', async function() {
  //   const createRequestParams = {
  //     reference_id: rpReferenceId,
  //     callback_url: config.RP_CALLBACK_URL,
  //     mode: 3,
  //     namespace,
  //     identifier,
  //     idp_id_list: [],
  //     data_request_list: [
  //       {
  //         service_id: 'bank_statement',
  //         as_id_list: [],
  //         min_as: 1,
  //         request_params: '',
  //       },
  //     ],
  //     request_message: 'Test request message (error create request) (mode 3)',
  //     min_ial: 1.1,
  //     min_aal: 1,
  //     min_idp: 1,
  //     request_timeout: 86400,
  //   };

  //   const response = await rpApi.createRequest('rp1', createRequestParams);
  //   const responseBody = await response.json();
  //   expect(response.status).to.equal(400);
  //   expect(responseBody.error.code).to.equal(20003);
  // });

  // it('should get an error when creating a request without request_params key', async function() {
  //   const createRequestParams = {
  //     reference_id: rpReferenceId,
  //     callback_url: config.RP_CALLBACK_URL,
  //     mode: 3,
  //     namespace,
  //     identifier,
  //     idp_id_list: [],
  //     data_request_list: [
  //       {
  //         service_id: 'bank_statement',
  //         as_id_list: [],
  //         min_as: 1,
  //       },
  //     ],
  //     request_message: 'Test request message (error create request) (mode 3)',
  //     min_ial: 1.1,
  //     min_aal: 1,
  //     min_idp: 1,
  //     request_timeout: 86400,
  //   };

  //   const response = await rpApi.createRequest('rp1', createRequestParams);
  //   const responseBody = await response.json();
  //   expect(response.status).to.equal(400);
  //   expect(responseBody.error.code).to.equal(20003);
  // });
});
