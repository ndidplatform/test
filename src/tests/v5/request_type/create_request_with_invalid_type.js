import { expect } from 'chai';

import * as rpApi from '../../../api/v5/rp';

import { randomString, generateReferenceId } from '../../../utils';
import { ndidAvailable } from '../..';

import * as config from '../../../config';

describe('Create request with invalid request type test', function () {
  const requestType = `request_type_test_${randomString(5)}`;

  const rpReferenceId = generateReferenceId();

  const createRequestParams = {
    reference_id: rpReferenceId,
    callback_url: config.RP_CALLBACK_URL,
    mode: 1,
    namespace: 'citizen_id',
    identifier: randomString(13, '0123456789'),
    idp_id_list: ['idp1'],
    data_request_list: [],
    request_message: 'Test request message (request type)',
    min_ial: 2.3,
    min_aal: 3,
    min_idp: 1,
    request_timeout: 86400,
    bypass_identity_check: false,
    request_type: requestType,
  };

  before(async function () {
    if (!ndidAvailable) {
      this.skip();
    }
  });

  it('RP should NOT be able to create a request with unknown type', async function () {
    this.timeout(10000);
    const response = await rpApi.createRequest('rp1', createRequestParams);
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20091);
  });
});
