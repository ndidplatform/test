import { expect } from 'chai';

import * as ndidApi from '../../../../api/v5/ndid';
import * as commonApi from '../../../../api/v5/common';
import { wait } from '../../../../utils';

describe('Service destination is inactive', function () {
  before(async function () {
    this.timeout(5000);

    const response = await ndidApi.disableServiceDestination('ndid1', {
      node_id: 'as1',
      service_id: 'bank_statement',
    });
    if (response.status !== 204) {
      throw new Error('Disable service destination error');
    }
    await wait(2000);
  });

  it('Service price should NOT be included in queried list', async function () {
    this.timeout(10000);

    const response = await commonApi.getServicePriceList('as1', {
      service_id: 'bank_statement',
    });
    const responseBody = await response.json();

    expect(response.status).to.equal(200);

    expect(responseBody).to.be.an('array');
    expect(responseBody.some(({ node_id }) => node_id === 'as1')).to.be.false;
  });

  it('Service price should be able to queried (when specifying node ID) successfully', async function () {
    this.timeout(10000);

    const response = await commonApi.getServicePriceList('as1', {
      service_id: 'bank_statement',
      node_id: 'as1',
    });
    const responseBody = await response.json();

    expect(response.status).to.equal(200);

    expect(responseBody).to.be.an('array');
    expect(responseBody.some(({ node_id }) => node_id === 'as1')).to.be.true;
  });

  after(async function () {
    this.timeout(5000);

    const response = await ndidApi.enableServiceDestination('ndid1', {
      node_id: 'as1',
      service_id: 'bank_statement',
    });
    if (response.status !== 204) {
      throw new Error('Enable service destination error');
    }
    await wait(2000);
  });
});
