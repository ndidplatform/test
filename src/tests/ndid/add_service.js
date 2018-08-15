import { expect } from 'chai';

import * as ndidApi from '../../api/v2/ndid';
import * as commonApi from '../../api/v2/common';

import { ndidAvailable } from '..';
import { wait } from '../../utils';

describe('NDID add new service test', function() {
  let alreadyAddedService = false;
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
  });

  it('NDID should add new service (test_add_new_service) successfully', async function() {
    this.timeout(10000);

    const response = await ndidApi.addService('ndid1', {
      service_id: 'test_add_new_service',
      service_name: 'Test add new service',
    });

    if (alreadyAddedService) {
      const responseBody = await response.json();
      expect(response.status).to.equal(400);
      expect(responseBody.error.code).to.equal(25005);
    } else {
      expect(response.status).to.equal(201);
    }
    await wait(1000);
  });

  it('Service (test_add_new_service) should be added successfully', async function() {
    this.timeout(10000);

    const response = await commonApi.getServices('ndid1');
    const responseBody = await response.json();
    const service = responseBody.find(
      service => service.service_id === 'test_add_new_service'
    );

    if (alreadyAddedService) {
      expect(service).to.deep.equal({
        service_id: 'test_add_new_service',
        service_name: 'Test update service name by ndid',
        active: true,
      });
    } else {
      expect(service).to.deep.equal({
        service_id: 'test_add_new_service',
        service_name: 'Test add new service',
        active: true,
      });
    }
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
