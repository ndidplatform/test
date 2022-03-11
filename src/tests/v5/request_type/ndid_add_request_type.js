import { expect } from 'chai';

import * as commonApi from '../../../api/v5/common';
import * as ndidApi from '../../../api/v5/ndid';
import { randomString } from '../../../utils';
import { ndidAvailable } from '../..';

describe('NDID add request type test', function () {
  const requestType = `request_type_test_${randomString(5)}`;

  before(function () {
    if (!ndidAvailable) {
      this.skip();
    }
  });

  it('NDID should add request type successfully', async function () {
    this.timeout(20000);

    const response = await ndidApi.addRequestType('ndid1', {
      name: requestType,
    });

    expect(response.status).to.equal(204);
  });

  it('should get added request type successfully', async function () {
    this.timeout(5000);

    const response = await commonApi.getRequestTypeList('ndid1');
    const responseBody = await response.json();
    expect(responseBody).to.be.an('array');
    const foundRequestType = responseBody.find((type) => type === requestType);
    expect(foundRequestType).to.not.be.undefined;
  });
});
