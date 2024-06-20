import { expect } from 'chai';

import * as commonApi from '../../../api/v5/common';
import * as rpApi from '../../../api/v5/rp';
import * as ndidApiV6 from '../../../api/v6/ndid';
import * as apiHelpers from '../../../api/helpers';

import { generateReferenceId, wait } from '../../../utils';
import { randomThaiIdNumber } from '../../../utils/thai_id';
import { ndidAvailable } from '../..';

import * as config from '../../../config';

describe('Create request with invalid/unsupported AAL test', function () {
  const supportedAALList = [1, 2.1, 2.2, 2.8, 3, 3.2, 4.1];

  let originalSupportedAALList;

  const rpReferenceId = generateReferenceId();

  const createRequestParams = {
    reference_id: rpReferenceId,
    callback_url: config.RP_CALLBACK_URL,
    mode: 1,
    namespace: 'citizen_id',
    identifier: randomThaiIdNumber(),
    idp_id_list: ['idp1'],
    data_request_list: [],
    request_message: 'Test request message (AAL)',
    min_ial: 2.3,
    min_aal: 2.9,
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
      commonApi.getSupportedAALList('ndid1')
    );
    originalSupportedAALList = response.responseBody;

    await ndidApiV6.setSupportedAALList('ndid1', {
      supported_aal_list: supportedAALList,
    });

    await wait(3000);
  });

  it('RP should NOT be able to create a request with unsupported AAL', async function () {
    this.timeout(10000);
    const response = await rpApi.createRequest('rp1', createRequestParams);
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20095);
  });

  after(async function () {
    await ndidApiV6.setSupportedAALList('ndid1', {
      supported_aal_list: originalSupportedAALList,
    });
  });
});
