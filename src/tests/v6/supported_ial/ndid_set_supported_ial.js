import { expect } from 'chai';

import * as commonApi from '../../../api/v6/common';
import * as ndidApi from '../../../api/v6/ndid';
import * as apiHelpers from '../../../api/helpers';
import { ndidAvailable } from '../..';

describe('NDID set supported IAL test', function () {
  const supportedIALList = [1, 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3, 3.5, 4, 5, 5.2];

  let originalSupportedIALList;

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
  });

  it('NDID should set supported IAL successfully', async function () {
    this.timeout(20000);

    const response = await ndidApi.setSupportedIALList('ndid1', {
      supported_ial_list: supportedIALList,
    });

    expect(response.status).to.equal(204);
  });

  it('should get set supported IAL successfully', async function () {
    this.timeout(5000);

    const response = await commonApi.getSupportedIALList('ndid1');
    const responseBody = await response.json();
    expect(responseBody).to.be.an('array');
    expect(responseBody).to.eql(supportedIALList);
  });

  after(async function () {
    await ndidApi.setSupportedIALList('ndid1', {
      supported_ial_list: originalSupportedIALList,
    });
  });
});
