import { expect } from 'chai';

import * as commonApi from '../../../api/v6/common';
import * as ndidApi from '../../../api/v6/ndid';
import * as apiHelpers from '../../../api/helpers';
import { ndidAvailable } from '../..';

describe('NDID set supported AAL test', function () {
  const supportedAALList = [1, 2.1, 2.2, 3, 3.2, 4.1];

  let originalSupportedAALList;

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
  });

  it('NDID should set supported AAL successfully', async function () {
    this.timeout(20000);

    const response = await ndidApi.setSupportedAALList('ndid1', {
      supported_aal_list: supportedAALList,
    });

    expect(response.status).to.equal(204);
  });

  it('should get set supported AAL successfully', async function () {
    this.timeout(5000);

    const response = await commonApi.getSupportedAALList('ndid1');
    const responseBody = await response.json();
    expect(responseBody).to.be.an('array');
    expect(responseBody).to.eql(supportedAALList);
  });

  after(async function () {
    await ndidApi.setSupportedAALList('ndid1', {
      supported_aal_list: originalSupportedAALList,
    });
  });
});
