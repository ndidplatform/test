import { expect } from 'chai';

import { as1Available, as2Available } from '.';
import * as asApi from '../api/v2/as';
import { as1EventEmitter, as2EventEmitter } from '../callback_server';
import { createEventPromise, generateReferenceId } from '../utils';
import * as config from '../config';

describe('AS (as1) setup', function() {
  before(function() {
    if (!as1Available) {
      this.skip();
    }
  });

  const bankStatementReferenceId = generateReferenceId();
  const customerInfoReferenceId = generateReferenceId();

  const addOrUpdateServiceBankStatementResultPromise = createEventPromise();
  const addOrUpdateServiceCustomerInfoResultPromise = createEventPromise();

  before(function() {
    as1EventEmitter.on('callback', function(callbackData) {
      if (callbackData.type === 'add_or_update_service_result') {
        if (callbackData.reference_id === bankStatementReferenceId) {
          addOrUpdateServiceBankStatementResultPromise.resolve(callbackData);
        } else if (callbackData.reference_id === customerInfoReferenceId) {
          addOrUpdateServiceCustomerInfoResultPromise.resolve(callbackData);
        }
      }
    });
  });

  it('should add offered service (bank_statement) successfully', async function() {
    this.timeout(10000);
    const response = await asApi.addOrUpdateService('as1', {
      serviceId: 'bank_statement',
      reference_id: bankStatementReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      min_ial: 1.1,
      min_aal: 1,
      url: config.AS1_CALLBACK_URL,
    });
    expect(response.status).to.equal(202);

    const addOrUpdateServiceResult = await addOrUpdateServiceBankStatementResultPromise.promise;
    expect(addOrUpdateServiceResult).to.deep.include({
      reference_id: bankStatementReferenceId,
      success: true,
    });
  });

  it('should have offered service (bank_statement)', async function() {
    const response = await asApi.getService('as1', {
      serviceId: 'bank_statement',
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.deep.equal({
      min_ial: 1.1,
      min_aal: 1,
      url: config.AS1_CALLBACK_URL,
      active: true,
      suspended: false,
    });
  });

  it('should add offered service (customer_info) successfully', async function() {
    this.timeout(10000);
    const response = await asApi.addOrUpdateService('as1', {
      serviceId: 'customer_info',
      reference_id: customerInfoReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      min_ial: 1.1,
      min_aal: 1,
      url: config.AS1_CALLBACK_URL,
    });
    expect(response.status).to.equal(202);

    const addOrUpdateServiceResult = await addOrUpdateServiceCustomerInfoResultPromise.promise;
    expect(addOrUpdateServiceResult).to.deep.include({
      reference_id: customerInfoReferenceId,
      success: true,
    });
  });

  it('should have offered service (customer_info)', async function() {
    const response = await asApi.getService('as1', {
      serviceId: 'customer_info',
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.deep.equal({
      min_ial: 1.1,
      min_aal: 1,
      url: config.AS1_CALLBACK_URL,
      active: true,
      suspended: false,
    });
  });

  after(function() {
    as1EventEmitter.removeAllListeners('callback');
  });
});

describe('AS (as2) setup', function() {
  before(function() {
    if (!as2Available) {
      this.skip();
    }
  });

  const bankStatementReferenceId = generateReferenceId();
  const customerInfoReferenceId = generateReferenceId();

  const addOrUpdateServiceBankStatementResultPromise = createEventPromise();
  const addOrUpdateServiceCustomerInfoResultPromise = createEventPromise();

  before(function() {
    as2EventEmitter.on('callback', function(callbackData) {
      if (callbackData.type === 'add_or_update_service_result') {
        if (callbackData.reference_id === bankStatementReferenceId) {
          addOrUpdateServiceBankStatementResultPromise.resolve(callbackData);
        } else if (callbackData.reference_id === customerInfoReferenceId) {
          addOrUpdateServiceCustomerInfoResultPromise.resolve(callbackData);
        }
      }
    });
  });

  it('should add offered service (bank_statement) successfully', async function() {
    this.timeout(10000);
    const response = await asApi.addOrUpdateService('as2', {
      serviceId: 'bank_statement',
      reference_id: bankStatementReferenceId,
      callback_url: config.AS2_CALLBACK_URL,
      min_ial: 1.1,
      min_aal: 1,
      url: config.AS2_CALLBACK_URL,
    });
    expect(response.status).to.equal(202);

    const addOrUpdateServiceResult = await addOrUpdateServiceBankStatementResultPromise.promise;
    expect(addOrUpdateServiceResult).to.deep.include({
      reference_id: bankStatementReferenceId,
      success: true,
    });
  });

  it('should have offered service (bank_statement)', async function() {
    const response = await asApi.getService('as2', {
      serviceId: 'bank_statement',
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.deep.equal({
      min_ial: 1.1,
      min_aal: 1,
      url: config.AS2_CALLBACK_URL,
      active: true,
      suspended: false,
    });
  });

  it('should add offered service (customer_info) successfully', async function() {
    this.timeout(10000);
    const response = await asApi.addOrUpdateService('as2', {
      serviceId: 'customer_info',
      reference_id: customerInfoReferenceId,
      callback_url: config.AS2_CALLBACK_URL,
      min_ial: 1.1,
      min_aal: 1,
      url: config.AS2_CALLBACK_URL,
    });
    expect(response.status).to.equal(202);

    const addOrUpdateServiceResult = await addOrUpdateServiceCustomerInfoResultPromise.promise;
    expect(addOrUpdateServiceResult).to.deep.include({
      reference_id: customerInfoReferenceId,
      success: true,
    });
  });

  it('should have offered service (customer_info)', async function() {
    const response = await asApi.getService('as2', {
      serviceId: 'customer_info',
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.deep.equal({
      min_ial: 1.1,
      min_aal: 1,
      url: config.AS2_CALLBACK_URL,
      active: true,
      suspended: false,
    });
  });

  after(function() {
    as2EventEmitter.removeAllListeners('callback');
  });
});
