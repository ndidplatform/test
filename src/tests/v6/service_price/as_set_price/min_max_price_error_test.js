import { expect } from 'chai';

import * as asApi from '../../../../api/v6/as';
import * as commonApi from '../../../../api/v6/common';
import { generateReferenceId } from '../../../../utils';
import { as1Available } from '../../..';
import * as config from '../../../../config';

describe('Set Service price (min,max price) error test', function () {
  const referenceId = generateReferenceId();

  let servicePriceMinEffectiveDatetimeDelay;

  before(async function () {
    if (!as1Available) {
      this.skip();
    }

    const servicePriceMinEffectiveDatetimeDelayRes = await commonApi.getServicePriceMinEffectiveDatetimeDelay(
      'as1'
    );
    servicePriceMinEffectiveDatetimeDelay = await servicePriceMinEffectiveDatetimeDelayRes.json();
  });

  it('AS should NOT be able to set service price with min price greater than max price', async function () {
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
          min_price: 9999.99,
          max_price: 299.99,
        },
      ],
      effective_datetime: effectiveDatetime,
      more_info_url: 'https://example.com/more_info',
      detail: 'free text',
    });

    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20084);
  });

  after(function () {});
});
