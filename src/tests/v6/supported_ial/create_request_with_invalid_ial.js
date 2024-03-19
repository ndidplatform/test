import { expect } from 'chai';

import * as commonApi from '../../../api/v6/common';
import * as rpApi from '../../../api/v6/rp';
import * as ndidApi from '../../../api/v6/ndid';
import * as apiHelpers from '../../../api/helpers';

import { generateReferenceId, wait } from '../../../utils';
import { randomString } from '../../../utils/random';
import { ndidAvailable } from '../..';

import * as config from '../../../config';

describe('Create request with invalid/unsupported IAL test', function () {
  const supportedIALList = [1, 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3, 3.5, 4, 5, 5.2];

  let originalSupportedIALList;

  const rpReferenceId = generateReferenceId();

  const createRequestParams = {
    reference_id: rpReferenceId,
    callback_url: config.RP_CALLBACK_URL,
    mode: 1,
    namespace: 'citizen_id',
    identifier: randomString(13, '0123456789'),
    idp_id_list: ['idp1'],
    data_request_list: [],
    request_message: 'Test request message (IAL)',
    min_ial: 1.9,
    min_aal: 3,
    min_idp: 1,
    request_timeout: 86400,
    bypass_identity_check: false,
  };

  before(async function () {
    this.timeout(10000);

    if (!ndidAvailable) {
      this.skip();
    }

    let response;

    response = await apiHelpers.getResponseAndBody(
      commonApi.getSupportedIALList('ndid1')
    );
    originalSupportedIALList = response.responseBody;

    await ndidApi.setSupportedIALList('ndid1', {
      supported_ial_list: supportedIALList,
    });

    await wait(3000);
  });

  it('RP should NOT be able to create a request with unsupported IAL', async function () {
    this.timeout(10000);
    const response = await rpApi.createRequest('rp1', createRequestParams);
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20094);
  });

  after(async function () {
    this.timeout(5000);

    await ndidApi.setSupportedIALList('ndid1', {
      supported_ial_list: originalSupportedIALList,
    });
  });
});
