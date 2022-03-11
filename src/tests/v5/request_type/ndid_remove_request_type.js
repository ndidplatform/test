import { expect } from 'chai';

import * as commonApi from '../../../api/v5/common';
import * as ndidApi from '../../../api/v5/ndid';
import { randomString } from '../../../utils';
import { ndidAvailable } from '../..';

describe('NDID remove request type test', function () {
  const requestType = `request_type_test_${randomString(5)}`;

  before(async function () {
    this.timeout(10000);

    if (!ndidAvailable) {
      this.skip();
    }

    await ndidApi.addRequestType('ndid1', {
      name: requestType,
    });
  });

  it('NDID should remove request type successfully', async function () {
    this.timeout(20000);

    const response = await ndidApi.removeRequestType('ndid1', {
      name: requestType,
    });

    expect(response.status).to.equal(204);
  });

  it('should NOT be able to get removed request type', async function () {
    this.timeout(5000);

    const response = await commonApi.getRequestTypeList('ndid1');
    const responseBody = await response.json();
    expect(responseBody).to.be.an('array');
    const foundRequestType = responseBody.find((type) => type === requestType);
    expect(foundRequestType).to.be.undefined;
  });
});
