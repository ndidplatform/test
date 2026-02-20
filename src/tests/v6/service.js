import { expect } from 'chai';

import * as commonApi from '../../api/v6/common';

import { randomString } from '../../utils/random';

import { ensureDomain, ensureService } from '../_helpers';

describe('Service', function () {
  const serviceId = `test_service_${randomString(8)}`;
  const serviceName = `Test Service (${serviceId})`;

  before(async function () {
    this.timeout(10000);

    await ensureService({
      serviceId,
      serviceName,
      // dataSchema,
      // dataSchemaVersion,
      // domain,
      // requesterNodeWhitelistEnabled,
    });
  });

  it('should get service successfully', async function () {
    const response = await commonApi.getServices('ndid1');
    const responseBody = await response.json();
    const service = responseBody.find(
      (service) => service.service_id === serviceId
    );

    // should not have more than these properties
    expect(service).to.deep.equal({
      service_id: serviceId,
      service_name: serviceName,
      active: true,
    });
  });
});

describe('Service with domain', function () {
  const serviceId = `test_service_${randomString(8)}`;
  const serviceName = `Test Service (${serviceId})`;

  before(async function () {
    this.timeout(10000);

    await ensureDomain({ domain: 'YourData' });

    await ensureService({
      serviceId,
      serviceName,
      // dataSchema,
      // dataSchemaVersion,
      domain: 'YourData',
      requesterNodeWhitelistEnabled: true,
    });
  });

  it('should NOT have service in list', async function () {
    const response = await commonApi.getServices('ndid1');
    const responseBody = await response.json();
    const service = responseBody.find(
      (service) => service.service_id === serviceId
    );

    expect(service).to.be.undefined;
  });
});
