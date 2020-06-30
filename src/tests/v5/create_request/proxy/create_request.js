import { expect } from 'chai';

import * as rpApi from '../../../../api/v5/rp';
import * as db from '../../../../db';
import { ndidAvailable, proxy1Available } from '../../..';
import {
  generateReferenceId,
} from '../../../../utils';
import * as config from '../../../../config';

describe('Proxy node create request with non-existent RP node ID (mode 1) test', function () {
  let createRequestParams;
  const rpReferenceId = generateReferenceId();

  before(async function () {
    if (!ndidAvailable || !proxy1Available) {
      this.test.parent.pending = true;
      this.skip();
    }

    createRequestParams = {
      node_id: 'NonExistentRPNode',
      reference_id: rpReferenceId,
      callback_url: config.PROXY1_CALLBACK_URL,
      mode: 1,
      namespace: 'citizen_id',
      identifier: '1234567890123',
      idp_id_list: ['idp1'],
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
        'Test request message (Proxy node should create a request with non-existent RP node ID)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
      bypass_identity_check: false,
    };
  });

  it('Proxy node should create a request with non-existent RP node ID unsuccessfully', async function () {
    this.timeout(15000);
    const response = await rpApi.createRequest('proxy1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(500);
    expect(responseBody.error.code).to.equal(10032);
  });
});

describe('Proxy node create request with non-existent RP node ID (mode 2) test', function () {
  let createRequestParams;
  let namespace;
  let identifier;
  const rpReferenceId = generateReferenceId();

  before(async function () {
    if (!ndidAvailable || !proxy1Available) {
      this.test.parent.pending = true;
      this.skip();
    }

    const identity = db.proxy1Idp4Identities.find(
      (identity) => identity.mode === 2,
    );

    if (!identity) {
      throw new Error('No created identity to use');
    }

    namespace = identity.namespace;
    identifier = identity.identifier;

    createRequestParams = {
      node_id: 'NonExistentRPNode',
      reference_id: rpReferenceId,
      callback_url: config.PROXY1_CALLBACK_URL,
      mode: 2,
      namespace,
      identifier,
      idp_id_list: ['idp1'],
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
        'Test request message (Proxy node should create a request with non-existent RP node ID)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
      bypass_identity_check: false,
    };
  });

  it('Proxy node should create a request with non-existent RP node ID unsuccessfully', async function () {
    this.timeout(15000);
    const response = await rpApi.createRequest('proxy1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(500);
    expect(responseBody.error.code).to.equal(10032);
  });
});

describe('Proxy node create request with non-existent RP node ID (mode 3) test', function () {
  let createRequestParams;
  let namespace;
  let identifier;
  const rpReferenceId = generateReferenceId();

  before(async function () {
    if (!ndidAvailable || !proxy1Available) {
      this.test.parent.pending = true;
      this.skip();
    }

    const identity = db.proxy1Idp4Identities.find(
      (identity) => identity.mode === 3,
    );

    if (!identity) {
      throw new Error('No created identity to use');
    }

    namespace = identity.namespace;
    identifier = identity.identifier;

    createRequestParams = {
      node_id: 'NonExistentRPNode',
      reference_id: rpReferenceId,
      callback_url: config.PROXY1_CALLBACK_URL,
      mode: 2,
      namespace,
      identifier,
      idp_id_list: ['idp1'],
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
        'Test request message (Proxy node should create a request with non-existent RP node ID)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
      bypass_identity_check: false,
    };
  });

  it('Proxy node should create a request with non-existent RP node ID unsuccessfully', async function () {
    this.timeout(15000);
    const response = await rpApi.createRequest('proxy1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(500);
    expect(responseBody.error.code).to.equal(10032);
  });
});