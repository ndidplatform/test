import { expect } from 'chai';

import { as1Available } from '../../../';
import * as yourDataAsApi from '../../../../api/v7/yourdata/as';

import { ensureYourDataASErrorCode } from '../../../_helpers';

import { waitUntilBlockHeightMatch } from '../../../../tendermint';

describe('AS setup auto error response', function () {
  const serviceNotAvailbleErrorCode = 50001;
  const serviceNotAvailbleErrorCodeDesc = 'service not available error test';

  const unsupportedNamespaceErrorCode = 50002;
  const unsupportedNamespaceErrorCodeDesc = 'unsupported namespace error test';

  const unsupportedAuthorizationErrorCode = 50003;
  const unsupportedAuthorizationErrorCodeDesc =
    'unsupported authorization error test';

  before(async function () {
    this.timeout(10000);

    if (!as1Available) {
      this.skip();
    }

    await ensureYourDataASErrorCode({
      errorCode: serviceNotAvailbleErrorCode,
      description: serviceNotAvailbleErrorCodeDesc,
    });

    await ensureYourDataASErrorCode({
      errorCode: unsupportedNamespaceErrorCode,
      description: unsupportedNamespaceErrorCodeDesc,
    });

    await ensureYourDataASErrorCode({
      errorCode: unsupportedAuthorizationErrorCode,
      description: unsupportedAuthorizationErrorCodeDesc,
    });

    await waitUntilBlockHeightMatch('as1', 'ndid1');
  });

  describe('set auto error response', function () {
    const serviceNotAvailableAutoResConfig = {
      error_code: serviceNotAvailbleErrorCode,
      error_message: 'service is currently not available',
    };
    const unsupportedNamespaceAutoResConfig = {
      error_code: unsupportedNamespaceErrorCode,
      error_message: 'unsupported namespace',
    };
    const unsupportedAuthorizationAutoResConfig = {
      error_code: unsupportedAuthorizationErrorCode,
      error_message: 'unsupported authorization',
    };

    it('should set auto error response config successfully', async function () {
      const response = await yourDataAsApi.setAutoErrorResponses('as1', {
        service_not_available: serviceNotAvailableAutoResConfig,
        unsupported_namespace: unsupportedNamespaceAutoResConfig,
        unsupported_authorization: unsupportedAuthorizationAutoResConfig,
      });
      expect(response.status).to.equal(204);
    });

    it('should have set auto error response config', async function () {
      const response = await yourDataAsApi.getAutoErrorResponses('as1');
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.deep.equal({
        service_not_available: serviceNotAvailableAutoResConfig,
        unsupported_namespace: unsupportedNamespaceAutoResConfig,
        unsupported_authorization: unsupportedAuthorizationAutoResConfig,
      });
    });

    after(async function () {
      await yourDataAsApi.setAutoErrorResponses('as1', {
        service_not_available: null,
        unsupported_namespace: null,
        unsupported_authorization: null,
      });
    });
  });

  describe('unset auto error response', function () {
    const serviceNotAvailableAutoResConfig = {
      error_code: serviceNotAvailbleErrorCode,
      error_message: 'service is currently not available',
    };
    const unsupportedNamespaceAutoResConfig = {
      error_code: unsupportedNamespaceErrorCode,
      error_message: 'unsupported namespace',
    };
    const unsupportedAuthorizationAutoResConfig = {
      error_code: unsupportedAuthorizationErrorCode,
      error_message: 'unsupported authorization',
    };

    it('should set auto error response config successfully', async function () {
      const response = await yourDataAsApi.setAutoErrorResponses('as1', {
        service_not_available: serviceNotAvailableAutoResConfig,
        unsupported_namespace: unsupportedNamespaceAutoResConfig,
        unsupported_authorization: unsupportedAuthorizationAutoResConfig,
      });
      expect(response.status).to.equal(204);
    });

    it('should have set auto error response config', async function () {
      const response = await yourDataAsApi.getAutoErrorResponses('as1');
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.deep.equal({
        service_not_available: serviceNotAvailableAutoResConfig,
        unsupported_namespace: unsupportedNamespaceAutoResConfig,
        unsupported_authorization: unsupportedAuthorizationAutoResConfig,
      });
    });

    it('should unset some auto error response config successfully', async function () {
      const response = await yourDataAsApi.setAutoErrorResponses('as1', {
        service_not_available: null,
      });
      expect(response.status).to.equal(204);
    });

    it('should have new auto error response config', async function () {
      const response = await yourDataAsApi.getAutoErrorResponses('as1');
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.deep.equal({
        service_not_available: null,
        unsupported_namespace: unsupportedNamespaceAutoResConfig,
        unsupported_authorization: unsupportedAuthorizationAutoResConfig,
      });
    });

    it('should unset auto error response config successfully', async function () {
      const response = await yourDataAsApi.setAutoErrorResponses('as1', {
        service_not_available: null,
        unsupported_namespace: null,
        unsupported_authorization: null,
      });
      expect(response.status).to.equal(204);
    });

    it('should have new auto error response config', async function () {
      const response = await yourDataAsApi.getAutoErrorResponses('as1');
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.deep.equal({
        service_not_available: null,
        unsupported_namespace: null,
        unsupported_authorization: null,
      });
    });
  });

  describe('set auto error response (bypass error code check)', function () {
    const unregisteredErrorCode = Date.now(); // this error code doesn't exist on platform

    const serviceNotAvailableAutoResConfig = {
      error_code: unregisteredErrorCode,
      error_message: 'service is currently not available',
    };
    const unsupportedNamespaceAutoResConfig = {
      error_code: unregisteredErrorCode,
      error_message: 'unsupported namespace',
    };
    const unsupportedAuthorizationAutoResConfig = {
      error_code: unregisteredErrorCode,
      error_message: 'unsupported authorization',
    };

    it('should set auto error response config successfully', async function () {
      const response = await yourDataAsApi.setAutoErrorResponses('as1', {
        bypass_error_code_check: true,
        service_not_available: serviceNotAvailableAutoResConfig,
        unsupported_namespace: unsupportedNamespaceAutoResConfig,
        unsupported_authorization: unsupportedAuthorizationAutoResConfig,
      });
      expect(response.status).to.equal(204);
    });

    it('should have set auto error response config', async function () {
      const response = await yourDataAsApi.getAutoErrorResponses('as1');
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.deep.equal({
        service_not_available: serviceNotAvailableAutoResConfig,
        unsupported_namespace: unsupportedNamespaceAutoResConfig,
        unsupported_authorization: unsupportedAuthorizationAutoResConfig,
      });
    });

    after(async function () {
      await yourDataAsApi.setAutoErrorResponses('as1', {
        service_not_available: null,
        unsupported_namespace: null,
        unsupported_authorization: null,
      });
    });
  });
});
