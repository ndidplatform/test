import { expect } from 'chai';

import * as ndidApi from '../../../../api/v6/ndid';
import * as asApi from '../../../../api/v6/as';
import * as commonApi from '../../../../api/v6/common';
import { as1EventEmitter } from '../../../../callback_server';
import {
  createEventPromise,
  generateReferenceId,
  wait,
} from '../../../../utils';
import { as1Available } from '../../..';
import * as config from '../../../../config';

describe('Set Service price (success) test', function () {
  const priceCeiling = 10000;

  const referenceId = generateReferenceId();

  const setServicePriceResultPromise = createEventPromise();

  let servicePriceToSet;

  before(async function () {
    this.timeout(10000);

    if (!as1Available) {
      this.skip();
    }

    const response = await ndidApi.setServicePriceCeiling('ndid1', {
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
  });

  it('AS should set service price successfully', async function () {
    this.timeout(10000);

    const response = await asApi.setServicePrice('as1', servicePriceToSet);

    expect(response.status).to.equal(202);

    const setServicePriceResult = await setServicePriceResultPromise.promise;
    expect(setServicePriceResult.success).to.equal(true);
    expect(setServicePriceResult.node_id).to.equal('as1');
    await wait(2000);
  });

  it('Service price should be able to queried successfully', async function () {
    this.timeout(10000);

    const response = await commonApi.getServicePriceList('rp1', {
      service_id: 'bank_statement',
      node_id: 'as1',
    });
    const responseBody = await response.json();

    expect(response.status).to.equal(200);

    const nodeServicePrice = responseBody.find(
      ({ node_id }) => node_id === 'as1'
    );
    expect(nodeServicePrice.node_id).to.equal('as1');
    const latestServicePrice = nodeServicePrice.price_list[0];
    expect(latestServicePrice.price_by_currency_list).to.deep.equal([
      {
        currency: 'THB',
        min_price: 10.59,
        max_price: 299.99,
      },
    ]);
    expect(new Date(latestServicePrice.effective_datetime).getTime()).to.equal(
      servicePriceToSet.effective_datetime.getTime()
    );
    expect(latestServicePrice.more_info_url).to.equal(
      servicePriceToSet.more_info_url
    );
    expect(latestServicePrice.detail).to.equal(servicePriceToSet.detail);

    expect(latestServicePrice.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight =
      latestServicePrice.creation_block_height.split(':');
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('Service price should be able to queried (without specifying node ID) successfully', async function () {
    this.timeout(10000);

    const response = await commonApi.getServicePriceList('rp1', {
      service_id: 'bank_statement',
    });
    const responseBody = await response.json();

    expect(response.status).to.equal(200);

    const nodeServicePrice = responseBody.find(
      ({ node_id }) => node_id === 'as1'
    );
    expect(nodeServicePrice.node_id).to.equal('as1');
    const latestServicePrice = nodeServicePrice.price_list[0];
    expect(latestServicePrice.price_by_currency_list).to.deep.equal([
      {
        currency: 'THB',
        min_price: 10.59,
        max_price: 299.99,
      },
    ]);
    expect(new Date(latestServicePrice.effective_datetime).getTime()).to.equal(
      servicePriceToSet.effective_datetime.getTime()
    );
    expect(latestServicePrice.more_info_url).to.equal(
      servicePriceToSet.more_info_url
    );
    expect(latestServicePrice.detail).to.equal(servicePriceToSet.detail);

    expect(latestServicePrice.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight =
      latestServicePrice.creation_block_height.split(':');
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  after(function () {});
});

describe('Set Service price (success) (equal min,max price) test', function () {
  const referenceId = generateReferenceId();

  const setServicePriceResultPromise = createEventPromise();

  let servicePriceToSet;

  before(async function () {
    if (!as1Available) {
      this.skip();
    }

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
          min_price: 99.99,
          max_price: 99.99,
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
  });

  it('AS should set service price successfully', async function () {
    this.timeout(10000);

    const response = await asApi.setServicePrice('as1', servicePriceToSet);

    expect(response.status).to.equal(202);

    const setServicePriceResult = await setServicePriceResultPromise.promise;
    expect(setServicePriceResult.success).to.equal(true);
    expect(setServicePriceResult.node_id).to.equal('as1');

    await wait(2000);
  });

  it('Service price should be able to queried successfully', async function () {
    this.timeout(10000);

    const response = await commonApi.getServicePriceList('rp1', {
      service_id: 'bank_statement',
      node_id: 'as1',
    });
    const responseBody = await response.json();

    expect(response.status).to.equal(200);

    const nodeServicePrice = responseBody.find(
      ({ node_id }) => node_id === 'as1'
    );
    expect(nodeServicePrice.node_id).to.equal('as1');
    const latestServicePrice = nodeServicePrice.price_list[0];
    expect(latestServicePrice.price_by_currency_list).to.deep.equal([
      {
        currency: 'THB',
        min_price: 99.99,
        max_price: 99.99,
      },
    ]);
    expect(new Date(latestServicePrice.effective_datetime).getTime()).to.equal(
      servicePriceToSet.effective_datetime.getTime()
    );
    expect(latestServicePrice.more_info_url).to.equal(
      servicePriceToSet.more_info_url
    );
    expect(latestServicePrice.detail).to.equal(servicePriceToSet.detail);

    expect(latestServicePrice.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight =
      latestServicePrice.creation_block_height.split(':');
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('Service price should be able to queried (without specifying node ID) successfully', async function () {
    this.timeout(10000);

    const response = await commonApi.getServicePriceList('rp1', {
      service_id: 'bank_statement',
    });
    const responseBody = await response.json();

    expect(response.status).to.equal(200);

    const nodeServicePrice = responseBody.find(
      ({ node_id }) => node_id === 'as1'
    );
    expect(nodeServicePrice.node_id).to.equal('as1');
    const latestServicePrice = nodeServicePrice.price_list[0];
    expect(latestServicePrice.price_by_currency_list).to.deep.equal([
      {
        currency: 'THB',
        min_price: 99.99,
        max_price: 99.99,
      },
    ]);
    expect(new Date(latestServicePrice.effective_datetime).getTime()).to.equal(
      servicePriceToSet.effective_datetime.getTime()
    );
    expect(latestServicePrice.more_info_url).to.equal(
      servicePriceToSet.more_info_url
    );
    expect(latestServicePrice.detail).to.equal(servicePriceToSet.detail);

    expect(latestServicePrice.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight =
      latestServicePrice.creation_block_height.split(':');
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  after(function () {});
});
