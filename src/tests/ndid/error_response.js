import { expect } from 'chai';

import * as ndidApi from '../../api/v2/ndid';

import { ndidAvailable } from '..';

describe('NDID response errors', function() {

  before(function() {
    if (!ndidAvailable) {
      this.skip();
    }
  });

  it('NDID should get an error when register namespace with reserved word (requests)', async function() {
    this.timeout(10000);
    const response = await ndidApi.registerNamespace('ndid1', {
      namespace: 'requests',
      description: 'test register namespace with reserved word (requests)',
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody).to.deep.include({
      message:
        'Input namespace cannot be reserved words ("requests" and "housekeeping")',
    });
  });

  it('NDID should get an error when register namespace with reserved word (housekeeping)', async function() {
    this.timeout(10000);
    const response = await ndidApi.registerNamespace('ndid1', {
      namespace: 'housekeeping',
      description: 'test register namespace with reserved word (housekeeping)',
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody).to.deep.include({
      message:
        'Input namespace cannot be reserved words ("requests" and "housekeeping")',
    });
  });
});
