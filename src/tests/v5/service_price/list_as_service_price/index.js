import * as ndidApi from '../../../../api/v5/ndid';
import * as asApi from '../../../../api/v5/as';
import * as commonApi from '../../../../api/v5/common';
import { as1EventEmitter } from '../../../../callback_server';
import {
  createEventPromise,
  generateReferenceId,
  wait,
} from '../../../../utils';
import { as1Available } from '../../..';
import * as config from '../../../../config';

describe('List AS service price tests', function () {
  const priceCeiling = 10000;

  const referenceId = generateReferenceId();

  const setServicePriceResultPromise = createEventPromise();

  let servicePriceToSet;

  before(async function () {
    this.timeout(15000);

    if (!as1Available) {
      this.skip();
    }

    let response;

    response = await ndidApi.setServicePriceCeiling('ndid1', {
      service_id: 'bank_statement',
      price_ceiling_by_currency_list: [
        {
          currency: 'THB',
          price: priceCeiling,
        },
      ],
    });
    if (response.status !== 204) {
      throw new Error('NDID set price ceiling error');
    }
    await wait(2000);

    const servicePriceMinEffectiveDatetimeDelayRes =
      await commonApi.getServicePriceMinEffectiveDatetimeDelay('as1');
    const servicePriceMinEffectiveDatetimeDelay =
      await servicePriceMinEffectiveDatetimeDelayRes.json();

    const effectiveDatetime = new Date(
      Date.now() +
        servicePriceMinEffectiveDatetimeDelay.duration_second * 1000 +
        5 * 60 * 1000
    );

    servicePriceToSet = {
      serviceId: 'bank_statement',
      reference_id: referenceId,
      callback_url: config.AS1_CALLBACK_URL,
      price_by_currency_list: [
        {
          currency: 'THB',
          min_price: 10.59,
          max_price: 299.99,
        },
      ],
      effective_datetime: effectiveDatetime,
      more_info_url: 'https://example.com/more_info',
      detail: 'free text',
    };

    as1EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'set_service_price_result' &&
        callbackData.reference_id === referenceId
      ) {
        setServicePriceResultPromise.resolve(callbackData);
      }
    });

    response = await asApi.setServicePrice('as1', servicePriceToSet);
    if (response.status !== 202) {
      throw new Error('AS set service price error');
    }
    const setServicePriceResult = await setServicePriceResultPromise.promise;
    if (!setServicePriceResult.success) {
      throw new Error('AS set service price error');
    }
    await wait(2000);
  });

  require('./inactive_service');
  require('./inactive_node');
  require('./inactive_service_destination');

  after(function () {
    as1EventEmitter.removeAllListeners('callback');
  });
});
