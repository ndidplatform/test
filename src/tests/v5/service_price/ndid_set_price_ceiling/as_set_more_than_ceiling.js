import { expect } from 'chai';

import * as ndidApi from '../../../../api/v5/ndid';
import * as asApi from '../../../../api/v5/as';
import * as commonApi from '../../../../api/v5/common';
import { as1EventEmitter } from '../../../../callback_server';
import { createEventPromise, generateReferenceId } from '../../../../utils';
import { as1Available } from '../../..';
import * as config from '../../../../config';

describe('AS set Service price more than price ceiling tests', function () {
  let servicePriceCeilingBeforeTest;

  const priceCeiling = 50.0;

  const referenceId = generateReferenceId();

  const setServicePriceResultPromise = createEventPromise();

  let servicePriceMinEffectiveDatetimeDelay;

  before(async function () {
    if (!as1Available) {
      this.skip();
    }

    let response;

    response = await commonApi.getServicePriceCeiling('ndid1', {
      service_id: 'bank_statement',
    });
    if (response.status !== 200) {
      throw new Error('Error getting service price ceiling');
    }
    servicePriceCeilingBeforeTest = await response.json();

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

    const servicePriceMinEffectiveDatetimeDelayRes = await commonApi.getServicePriceMinEffectiveDatetimeDelay(
      'as1'
    );
    servicePriceMinEffectiveDatetimeDelay = await servicePriceMinEffectiveDatetimeDelayRes.json();

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
        servicePriceMinEffectiveDatetimeDelay.duration_second * 1000 +
        5 * 60 * 1000
    ).toJSON();

    const response = await asApi.setServicePrice('as1', {
      serviceId: 'bank_statement',
      reference_id: referenceId,
      callback_url: config.AS1_CALLBACK_URL,
      price_by_currency_list: [
        {
          currency: 'THB',
          min_price: priceCeiling - 10.0,
          max_price: priceCeiling + 100.99,
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

  it('AS should NOT be able to set service price (2)', async function () {
    this.timeout(10000);

    const effectiveDatetime = new Date(
      Date.now() +
        servicePriceMinEffectiveDatetimeDelay.duration_second * 1000 +
        5 * 60 * 1000
    ).toJSON();

    const response = await asApi.setServicePrice('as1', {
      serviceId: 'bank_statement',
      reference_id: referenceId,
      callback_url: config.AS1_CALLBACK_URL,
      price_by_currency_list: [
        {
          currency: 'THB',
          min_price: priceCeiling + 88.88,
          max_price: priceCeiling + 120.99,
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
    const response = await ndidApi.setServicePriceCeiling('ndid1', servicePriceCeilingBeforeTest);
    if (response.status !== 204) {
      throw new Error('NDID set price ceiling error');
    }
  });
});
