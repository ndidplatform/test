import { expect } from 'chai';

import * as ndidApi from '../../../../api/v5/ndid';
import * as commonApi from '../../../../api/v5/common';
import { wait } from '../../../../utils';
import { ndidAvailable, rpAvailable } from '../../..';

describe('Set Service price ceiling tests', function () {
  before(async function () {
    if (!ndidAvailable || !rpAvailable) {
      this.skip();
    }
  });

  it('NDID should set service price ceiling successfully', async function () {
    this.timeout(10000);

    const response = await ndidApi.setServicePriceCeiling('ndid1', {
      service_id: 'bank_statement',
      price_ceiling_by_currency_list: [
        {
          currency: 'THB',
          price: 369.99,
        },
      ],
    });

    expect(response.status).to.equal(204);
    await wait(2000);
  });

  it('Service price ceiling should be set successfully', async function () {
    this.timeout(10000);

    const response = await commonApi.getServicePriceCeiling('rp1', {
      service_id: 'bank_statement',
    });
    const responseBody = await response.json();

    expect(response.status).to.equal(200);
    expect(responseBody).to.deep.equal({
      service_id: 'bank_statement',
      price_ceiling_by_currency_list: [
        {
          currency: 'THB',
          price: 369.99,
        },
      ],
    });
  });

  after(function () {});
});
