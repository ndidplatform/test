import { expect } from 'chai';

import * as ndidApi from '../../../api/v7/ndid';
import * as commonApi from '../../../api/v7/common';

import { ndidAvailable } from '../..';
import { randomString } from '../../../utils/random';

import { ensureDomain } from '../../_helpers';

describe('NDID add new service test', function () {
  let alreadyAddedService = false;
  before(async function () {
    if (!ndidAvailable) {
      this.skip();
    }

    //If already added test_add_new_service service then skip add new service step
    const responseGetServices = await commonApi.getServices('ndid1');
    const responseBody = await responseGetServices.json();
    alreadyAddedService = responseBody.find(
      (service) => service.service_id === 'test_add_new_service'
    );
  });

  it('NDID should add new service (test_add_new_service) successfully', async function () {
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
  });

  it('Service (test_add_new_service) should be added successfully', async function () {
    this.timeout(10000);

    const response = await commonApi.getServices('ndid1');
    const responseBody = await response.json();
    const service = responseBody.find(
      (service) => service.service_id === 'test_add_new_service'
    );

    expect(service).to.deep.equal({
      service_id: 'test_add_new_service',
      service_name: 'Test add new service',
      requester_node_whitelist_enabled: false,
      active: true,
    });

    // if (alreadyAddedService) {
    //   expect(service).to.deep.equal({
    //     service_id: 'test_add_new_service',
    //     service_name: 'Test update service name by ndid',
    //     active: true,
    //   });
    // } else {
    //   expect(service).to.deep.equal({
    //     service_id: 'test_add_new_service',
    //     service_name: 'Test add new service',
    //     active: true,
    //   });
    // }
  });

  it('Should get data schema service test_add_new_service successfully', async function () {
    this.timeout(15000);
    const response = await commonApi.getService('ndid1', {
      serviceId: 'test_add_new_service',
    });
    const responseBody = await response.json();
    expect(responseBody).to.deep.equal({
      service_id: 'test_add_new_service',
      service_name: 'Test add new service',
      requester_node_whitelist_enabled: false,
      active: true,
    });
  });

  it('NDID should update service (test_add_new_service) name successfully', async function () {
    this.timeout(10000);

    const response = await ndidApi.updateService('ndid1', {
      service_id: 'test_add_new_service',
      service_name: 'Test update service name by ndid',
    });
    expect(response.status).to.equal(204);
  });

  it('Service (test_add_new_service) name should be updated successfully', async function () {
    this.timeout(10000);
    const response = await commonApi.getServices('ndid1');
    const responseBody = await response.json();
    const service = responseBody.find(
      (service) => service.service_id === 'test_add_new_service'
    );

    expect(service).to.deep.equal({
      service_id: 'test_add_new_service',
      service_name: 'Test update service name by ndid',
      requester_node_whitelist_enabled: false,
      active: true,
    });
  });

  after(async function () {
    this.timeout(10000);
    await ndidApi.updateService('ndid1', {
      service_id: 'test_add_new_service',
      service_name: 'Test add new service',
    });
  });
});

describe('Service with domain', function () {
  const serviceId = `service_test_${randomString(8)}`;
  const serviceName = `Service (${serviceId})`;
  const domain = 'YourData';

  before(async function () {
    if (!ndidAvailable) {
      this.skip();
    }

    await ensureDomain({ domain });
  });

  it('NDID should add new service successfully', async function () {
    this.timeout(10000);

    const response = await ndidApi.addService('ndid1', {
      service_id: serviceId,
      service_name: serviceName,
      domain,
    });

    expect(response.status).to.equal(201);
  });

  it('Service should be added successfully', async function () {
    this.timeout(10000);

    const response = await commonApi.getServices('ndid1', { domain: 'all' });
    const responseBody = await response.json();
    const service = responseBody.find(
      (service) => service.service_id === serviceId
    );

    expect(service).to.deep.equal({
      service_id: serviceId,
      service_name: serviceName,
      domain,
      requester_node_whitelist_enabled: false,
      active: true,
    });
  });

  it('Should get service successfully', async function () {
    this.timeout(15000);
    const response = await commonApi.getService('ndid1', {
      serviceId,
    });
    const responseBody = await response.json();
    expect(responseBody).to.deep.equal({
      service_id: serviceId,
      service_name: serviceName,
      domain,
      requester_node_whitelist_enabled: false,
      active: true,
    });
  });

  const serviceNewName = `Service New Name (${serviceId})`;

  it('NDID should update service name successfully', async function () {
    this.timeout(10000);

    const response = await ndidApi.updateService('ndid1', {
      service_id: serviceId,
      service_name: serviceNewName,
    });
    expect(response.status).to.equal(204);
  });

  it('Service name should be updated successfully', async function () {
    this.timeout(10000);
    const response = await commonApi.getServices('ndid1', { domain: 'all' });
    const responseBody = await response.json();
    const service = responseBody.find(
      (service) => service.service_id === serviceId
    );

    expect(service).to.deep.equal({
      service_id: serviceId,
      service_name: serviceNewName,
      domain,
      requester_node_whitelist_enabled: false,
      active: true,
    });
  });
});

describe('Error - Invalid Domain', function () {
  const serviceId = `service_test_${randomString(8)}`;
  const serviceName = `Service (${serviceId})`;
  const serviceDomain = 'invalid_domain';

  before(async function () {
    if (!ndidAvailable) {
      this.skip();
    }
  });

  it('NDID should NOT be able to add new service', async function () {
    this.timeout(10000);

    const response = await ndidApi.addService('ndid1', {
      service_id: serviceId,
      service_name: serviceName,
      domain: serviceDomain,
    });

    expect(response.status).to.equal(400);

    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(25101);
  });
});

describe('Service with requester node whitelist flag', function () {
  const serviceId = `service_test_${randomString(8)}`;
  const serviceName = `Service (${serviceId})`;
  const domain = 'YourData';

  before(async function () {
    if (!ndidAvailable) {
      this.skip();
    }

    await ensureDomain({ domain });
  });

  it('NDID should add new service successfully', async function () {
    this.timeout(10000);

    const response = await ndidApi.addService('ndid1', {
      service_id: serviceId,
      service_name: serviceName,
      domain,
      requester_node_whitelist_enabled: true,
    });

    expect(response.status).to.equal(201);
  });

  it('Service should be added successfully', async function () {
    this.timeout(10000);

    const response = await commonApi.getServices('ndid1', { domain: 'all' });
    const responseBody = await response.json();
    const service = responseBody.find(
      (service) => service.service_id === serviceId
    );

    expect(service).to.deep.equal({
      service_id: serviceId,
      service_name: serviceName,
      domain,
      requester_node_whitelist_enabled: true,
      active: true,
    });
  });

  it('Should get service successfully', async function () {
    this.timeout(15000);
    const response = await commonApi.getService('ndid1', {
      serviceId,
    });
    const responseBody = await response.json();
    expect(responseBody).to.deep.equal({
      service_id: serviceId,
      service_name: serviceName,
      domain,
      requester_node_whitelist_enabled: true,
      active: true,
    });
  });
});
