import { expect } from 'chai';

import * as ndidApi from '../../api/v2/ndid';
import * as commonApi from '../../api/v2/common';
import * as asApi from '../../api/v2/as';

import { ndidAvailable } from '..';
import { as1EventEmitter } from '../../callback_server';
import { createEventPromise, generateReferenceId, wait } from '../../utils';
import * as config from '../../config';

describe('NDID add new service', function() {
  let alreadyAddedService = false;

  const testAddNewServiceReferenceId = generateReferenceId();
  const addOrUpdateServiceResultPromise = createEventPromise();

  before(async function() {
    if (!ndidAvailable) {
      this.skip();
    }

    //If already added test_add_new_service service then skip add new service step
    const responseGetServices = await commonApi.getServices('ndid1');
    const responseBody = await responseGetServices.json();
    alreadyAddedService = responseBody.find(
      service => service.service_id === 'test_add_new_service'
    );

    as1EventEmitter.on('callback', function(callbackData) {
      if (callbackData.type === 'add_or_update_service_result') {
        if (callbackData.reference_id === testAddNewServiceReferenceId) {
          addOrUpdateServiceResultPromise.resolve(callbackData);
        }
      }
    });
  });

  it('NDID should add new service (test_add_new_service) successfully', async function() {
    this.timeout(10000);

    if (alreadyAddedService) {
      this.skip();
    }

    const response = await ndidApi.addService('ndid1', {
      service_id: 'test_add_new_service',
      service_name: 'Test add new service',
    });
    expect(response.status).to.equal(201);
    await wait(1000);
  });

  it('Service (test_add_new_service) should be added successfully', async function() {
    this.timeout(10000);

    if (alreadyAddedService) {
      this.skip();
    }

    const response = await commonApi.getServices('ndid1');
    const responseBody = await response.json();
    const service = responseBody.find(
      service => service.service_id === 'test_add_new_service'
    );
    expect(service).to.deep.equal({
      service_id: 'test_add_new_service',
      service_name: 'Test add new service',
      active: true,
    });
  });

  it('NDID should approve service (test_add_new_service) for as1 successfully', async function() {
    this.timeout(10000);

    const response = await ndidApi.approveService('ndid1', {
      node_id: 'as1',
      service_id: 'test_add_new_service',
    });
    expect(response.status).to.equal(204);
    await wait(3000);
  });

  it('AS should add offered service (test_add_new_service) successfully', async function() {
    this.timeout(30000);
    const response = await asApi.addOrUpdateService('as1', {
      serviceId: 'test_add_new_service',
      reference_id: testAddNewServiceReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      min_ial: 1.1,
      min_aal: 1,
      url: config.AS1_CALLBACK_URL,
    });
    expect(response.status).to.equal(202);

    const addOrUpdateServiceResult = await addOrUpdateServiceResultPromise.promise;
    expect(addOrUpdateServiceResult).to.deep.include({
      reference_id: testAddNewServiceReferenceId,
      success: true,
    });
  });

  it('NDID should disable service (test_add_new_service) destination successfully', async function() {
    this.timeout(10000);
    const response = await ndidApi.disableServiceDestination('ndid1', {
      node_id: 'as1',
      service_id: 'test_add_new_service',
    });
    expect(response.status).to.equal(204);
    await wait(1000);
  });

  it('AS service (test_add_new_service) should be disabled service destination successfully', async function() {
    this.timeout(10000);

    const response = await asApi.getService('as1', {
      serviceId: 'test_add_new_service',
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody.active).to.equal(true);
    expect(responseBody.suspended).to.equal(true);
  });

  it('NDID should enable service (test_add_new_service) destination successfully', async function() {
    this.timeout(10000);
    const response = await ndidApi.enableServiceDestination('ndid1', {
      node_id: 'as1',
      service_id: 'test_add_new_service',
    });
    expect(response.status).to.equal(204);
    await wait(1000);
  });

  it('AS service (test_add_new_service) should be enabled service destination successfully', async function() {
    this.timeout(10000);

    const response = await asApi.getService('as1', {
      serviceId: 'test_add_new_service',
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody.active).to.equal(true);
    expect(responseBody.suspended).to.equal(false);
  });

  it('NDID should update service (test_add_new_service) name successfully', async function() {
    this.timeout(10000);

    const response = await ndidApi.updateService('ndid1', {
      service_id: 'test_add_new_service',
      service_name: 'Test update service name by ndid',
    });
    expect(response.status).to.equal(201);
    await wait(1000);
  });

  it('Service (test_add_new_service) name should be updated successfully', async function() {
    this.timeout(10000);
    const response = await commonApi.getServices('ndid1');
    const responseBody = await response.json();
    const service = responseBody.find(
      service => service.service_id === 'test_add_new_service'
    );

    expect(service).to.deep.equal({
      service_id: 'test_add_new_service',
      service_name: 'Test update service name by ndid',
      active: true,
    });
  });
});
