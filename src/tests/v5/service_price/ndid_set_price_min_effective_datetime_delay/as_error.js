import { expect } from 'chai';

import * as ndidApi from '../../../../api/v5/ndid';
import * as asApi from '../../../../api/v5/as';
import * as commonApi from '../../../../api/v5/common';
import { as1EventEmitter } from '../../../../callback_server';
import { createEventPromise, generateReferenceId } from '../../../../utils';
import { as1Available } from '../../..';
import * as config from '../../../../config';

describe('AS set Service price with not enough effective datetime delay tests', function () {
  let servicePriceMinEffectiveDatetimeDelayBeforeTest;

  const servicePriceMinEffectiveDatetimeDelaySeconds = 36 * 60 * 60;

  const referenceId = generateReferenceId();

  const setServicePriceResultPromise = createEventPromise();

  before(async function () {
    if (!as1Available) {
      this.skip();
    }

    const servicePriceMinEffectiveDatetimeDelayRes = await commonApi.getServicePriceMinEffectiveDatetimeDelay(
      'ndid1'
    );
    servicePriceMinEffectiveDatetimeDelayBeforeTest = await servicePriceMinEffectiveDatetimeDelayRes.json();

    const response = await ndidApi.setServicePriceMinEffectiveDatetimeDelay(
      'ndid1',
      {
        duration_second: servicePriceMinEffectiveDatetimeDelaySeconds,
      }
    );
    if (response.status !== 204) {
      throw new Error('NDID set price min effective datetime delay error');
    }

    as1EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'set_service_price_result' &&
        callbackData.reference_id === referenceId
      ) {
        setServicePriceResultPromise.resolve(callbackData);
      }
    });
  });

  it('AS should NOT be able to set service price', async function () {
    this.timeout(10000);

    const effectiveDatetime = new Date(
      Date.now() +
        servicePriceMinEffectiveDatetimeDelaySeconds * 1000 -
        5 * 60 * 1000
    ).toJSON();

    const response = await asApi.setServicePrice('as1', {
      serviceId: 'bank_statement',
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

    expect(response.status).to.equal(202);

    const setServicePriceResult = await setServicePriceResultPromise.promise;
    expect(setServicePriceResult.success).to.equal(false);
    expect(setServicePriceResult.node_id).to.equal('as1');
  });

  after(async function () {
    const response = await ndidApi.setServicePriceMinEffectiveDatetimeDelay(
      'ndid1',
      servicePriceMinEffectiveDatetimeDelayBeforeTest
    );
    if (response.status !== 204) {
      throw new Error('NDID set price min effective datetime delay error');
    }
  });
});