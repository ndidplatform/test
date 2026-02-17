import { expect } from 'chai';

import { as1Available } from '../../';
import * as yourDataAsApi from '../../../api/v7/yourdata/as';

import { randomString } from '../../../utils/random';

import * as config from '../../../config';

describe('AS service setup', function () {
  describe('without optional "service_availability"', function () {
    const serviceId = `test_service_${randomString(8)}`;

    const supportedNamespaceList = ['citizen_id'];
    const supportedAuthorization = [
      // 'no_token_needed',
      'token_one_time',
      'token_continuous_with_expire',
      // 'token_continuous_no_expire',
    ];

    before(async function () {
      if (!as1Available) {
        this.skip();
      }
    });

    it('should set add or update service successfully', async function () {
      const response = await yourDataAsApi.addOrUpdateService('as1', {
        serviceId,
        service_url: config.AS1_CALLBACK_URL,
        supported_namespace_list: supportedNamespaceList,
        supported_authorization: supportedAuthorization,
        // service_availability: true, // default: true
      });
      expect(response.status).to.equal(204);
    });

    it('should have offered service', async function () {
      const response = await yourDataAsApi.getService('as1', { serviceId });
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.deep.equal({
        service_id: serviceId,
        service_url: config.AS1_CALLBACK_URL,
        supported_namespace_list: supportedNamespaceList,
        supported_authorization: supportedAuthorization,
        service_availability: true,
      });
    });
  });

  describe('with optional "service_availability"', function () {
    const serviceId = `test_service_${randomString(8)}`;

    const supportedNamespaceList = ['citizen_id'];
    const supportedAuthorization = [
      // 'no_token_needed',
      'token_one_time',
      'token_continuous_with_expire',
      // 'token_continuous_no_expire',
    ];

    before(async function () {
      if (!as1Available) {
        this.skip();
      }
    });

    it('should set add or update service successfully', async function () {
      const response = await yourDataAsApi.addOrUpdateService('as1', {
        serviceId,
        service_url: config.AS1_CALLBACK_URL,
        supported_namespace_list: supportedNamespaceList,
        supported_authorization: supportedAuthorization,
        service_availability: false,
      });
      expect(response.status).to.equal(204);
    });

    it('should have offered service', async function () {
      const response = await yourDataAsApi.getService('as1', { serviceId });
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.deep.equal({
        service_id: serviceId,
        service_url: config.AS1_CALLBACK_URL,
        supported_namespace_list: supportedNamespaceList,
        supported_authorization: supportedAuthorization,
        service_availability: false,
      });
    });
  });
});
