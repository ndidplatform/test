import { expect } from 'chai';

import * as ndidApi from '../../../../api/v5/ndid';
import * as commonApi from '../../../../api/v5/common';
import { wait, randomNumber } from '../../../../utils';
import { ndidAvailable, as1Available } from '../../..';

describe('Set Service price minimum effective datetime delay tests', function () {
  const newDurationToSet = randomNumber(86400, 129600);

  before(async function () {
    if (!ndidAvailable || !as1Available) {
      this.skip();
    }
  });

  it('should be able to query (default value or previous set value) successfully', async function () {
    this.timeout(10000);

    const response = await commonApi.getServicePriceMinEffectiveDatetimeDelay(
      'ndid1'
    );
    const responseBody = await response.json();

    expect(response.status).to.equal(200);
    expect(responseBody.duration_second).to.be.a('number');
    expect(responseBody.duration_second).to.be.greaterThan(0);
  });

  it('NDID should set service price minimum effective datetime delay successfully', async function () {
    this.timeout(10000);

    const response = await ndidApi.setServicePriceMinEffectiveDatetimeDelay(
      'ndid1',
      {
        duration_second: newDurationToSet,
      }
    );

    expect(response.status).to.equal(204);
    await wait(2000);
  });

  it('Service price minimum effective datetime delay should be set successfully', async function () {
    this.timeout(10000);

    const response = await commonApi.getServicePriceMinEffectiveDatetimeDelay(
      'as1'
    );
    const responseBody = await response.json();

    expect(response.status).to.equal(200);
    expect(responseBody).to.deep.equal({
      duration_second: newDurationToSet,
    });
  });

  after(function () {});
});
