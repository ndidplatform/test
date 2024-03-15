import { expect } from 'chai';

import * as ndidApi from '../../../../api/v6/ndid';
import * as commonApi from '../../../../api/v6/common';
import { wait } from '../../../../utils';
import { randomNumber } from '../../../../utils/random';
import { ndidAvailable, as1Available } from '../../..';

describe('Set Service price minimum effective datetime delay by service ID tests', function () {
  let servicePriceMinEffectiveDatetimeDelayBeforeTest;

  const newDurationToSet = randomNumber(86400, 129600);

  before(async function () {
    if (!ndidAvailable || !as1Available) {
      this.skip();
    }

    const servicePriceMinEffectiveDatetimeDelayRes =
      await commonApi.getServicePriceMinEffectiveDatetimeDelay('ndid1', {
        service_id: 'bank_statement',
      });
    servicePriceMinEffectiveDatetimeDelayBeforeTest =
      await servicePriceMinEffectiveDatetimeDelayRes.json();
  });

  it('NDID should set service price minimum effective datetime delay by service ID successfully', async function () {
    this.timeout(10000);

    const response = await ndidApi.setServicePriceMinEffectiveDatetimeDelay(
      'ndid1',
      {
        service_id: 'bank_statement',
        duration_second: newDurationToSet,
      }
    );

    expect(response.status).to.equal(204);
    await wait(2000);
  });

  it('Service price minimum effective datetime delay by service ID should be set successfully', async function () {
    this.timeout(10000);

    const response = await commonApi.getServicePriceMinEffectiveDatetimeDelay(
      'as1',
      {
        service_id: 'bank_statement',
      }
    );
    const responseBody = await response.json();

    expect(response.status).to.equal(200);
    expect(responseBody).to.deep.equal({
      duration_second: newDurationToSet,
    });
  });

  after(async function () {
    this.timeout(5000);

    const response = await ndidApi.setServicePriceMinEffectiveDatetimeDelay(
      'ndid1',
      {
        service_id: 'bank_statement',
        duration_second:
          servicePriceMinEffectiveDatetimeDelayBeforeTest.duration_second,
      }
    );
    if (response.status !== 204) {
      throw new Error('NDID set price min effective datetime delay error');
    }

    await wait(2000);
  });
});
