import { expect } from 'chai';

import * as ndidApi from '../../../../api/v6/ndid';
import * as asApi from '../../../../api/v6/as';
import * as commonApi from '../../../../api/v6/common';
// import { as1EventEmitter } from '../../../../callback_server';
import {
  // createEventPromise,
  generateReferenceId,
  wait,
} from '../../../../utils';
import { as1Available } from '../../..';
import * as config from '../../../../config';

describe('AS set Service price with not enough effective datetime delay tests', function () {
  const serviceId = 'bank_statement';
  let servicePriceMinEffectiveDatetimeDelayBeforeTest;

  const servicePriceMinEffectiveDatetimeDelaySeconds = 36 * 60 * 60;

  const referenceId = generateReferenceId();

  // const setServicePriceResultPromise = createEventPromise();

  before(async function () {
    this.timeout(10000);

    if (!as1Available) {
      this.skip();
    }

    const servicePriceMinEffectiveDatetimeDelayRes =
      await commonApi.getServicePriceMinEffectiveDatetimeDelay('ndid1', {
        service_id: serviceId,
      });
    servicePriceMinEffectiveDatetimeDelayBeforeTest =
      await servicePriceMinEffectiveDatetimeDelayRes.json();

    const response = await ndidApi.setServicePriceMinEffectiveDatetimeDelay(
      'ndid1',
      {
        service_id: serviceId,
        duration_second: servicePriceMinEffectiveDatetimeDelaySeconds,
      }
    );
    if (response.status !== 204) {
      throw new Error('NDID set price min effective datetime delay error');
    }
    await wait(2000);

    // as1EventEmitter.on('callback', function (callbackData) {
    //   if (
    //     callbackData.type === 'set_service_price_result' &&
    //     callbackData.reference_id === referenceId
    //   ) {
    //     setServicePriceResultPromise.resolve(callbackData);
    //   }
    // });
  });

  it('AS should NOT be able to set service price', async function () {
    this.timeout(10000);

    const effectiveDatetime = new Date(
      Date.now() +
        servicePriceMinEffectiveDatetimeDelaySeconds * 1000 -
        5 * 60 * 1000
    ).toJSON();

    const response = await asApi.setServicePrice('as1', {
      serviceId,
      reference_id: referenceId,
      callback_url: config.AS1_CALLBACK_URL,
      price_by_currency_list: [
        {
          currency: 'THB',
          min_price: 0.99,
          max_price: 9.99,
        },
      ],
      effective_datetime: effectiveDatetime,
      more_info_url: 'https://example.com/more_info',
      detail: 'free text',
    });

    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20090);

    // expect(response.status).to.equal(202);

    // const setServicePriceResult = await setServicePriceResultPromise.promise;
    // expect(setServicePriceResult.success).to.equal(false);
    // expect(setServicePriceResult.node_id).to.equal('as1');
  });

  after(async function () {
    this.timeout(5000);

    const response = await ndidApi.setServicePriceMinEffectiveDatetimeDelay(
      'ndid1',
      {
        service_id: serviceId,
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
