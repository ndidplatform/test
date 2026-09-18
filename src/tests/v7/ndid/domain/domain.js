import { expect } from 'chai';

import * as ndidApi from '../../../../api/v7/ndid';
import * as rpApi from '../../../../api/v7/rp';
import * as yourdataRpApi from '../../../../api/v7/yourdata/rp';
import * as yourDataUtilityApi from '../../../../api/v7/yourdata/utility';
import * as commonApi from '../../../../api/v7/common';
import * as apiHelpers from '../../../../api/helpers';

import * as db from '../../../../db';

import { generateReferenceId } from '../../../../utils';
import { randomString } from '../../../../utils/random';

import { waitUntilBlockHeightMatch } from '../../../../tendermint';

import * as config from '../../../../config';

import {
  ensureASService,
  ensureDomainCrossDomainRequestDisabled,
  ensureDomainCrossDomainRequestEnabled,
  ensureService,
} from '../../../_helpers';

describe('General', function () {
  const domain = 'YourData';

  describe('Add', function () {
    before(async function () {
      const response = await commonApi.getDomainList('ndid1');
      const responseBody = await response.json();
      const expectedDomain = responseBody.find((d) => d.domain === domain);

      if (expectedDomain != null) {
        this.skip();
      }
    });

    it('NDID should add new domain successfully', async function () {
      this.timeout(10000);

      const response = await ndidApi.addDomain('ndid1', {
        domain,
        // node_whitelist_enabled: false, // default: false
        // cross_domain_request_disabled: false, // default: false
      });

      expect(response.status).to.equal(204);
    });

    it('Domain should be added successfully', async function () {
      this.timeout(10000);

      const response = await commonApi.getDomainList('ndid1');
      const responseBody = await response.json();
      const expectedDomain = responseBody.find((d) => d.domain === domain);

      expect(expectedDomain).to.deep.equal({
        domain,
        active: true,
        node_whitelist_enabled: false,
        cross_domain_request_disabled: false,
      });
    });
  });

  describe('Enable/Disable', function () {
    before(async function () {
      this.timeout(5000);

      const response = await commonApi.getDomainList('ndid1');
      const responseBody = await response.json();
      const expectedDomain = responseBody.find((d) => d.domain === domain);

      if (!expectedDomain.active) {
        await ndidApi.enableDomain('ndid1', {
          domain,
        });
      }
    });

    it('NDID should disable domain successfully', async function () {
      this.timeout(10000);

      const response = await ndidApi.disableDomain('ndid1', {
        domain,
      });
      expect(response.status).to.equal(204);
    });

    it('Domain should be disabled successfully', async function () {
      this.timeout(10000);
      let response;
      let responseBody;

      response = await commonApi.getDomainList('ndid1');
      responseBody = await response.json();
      const expectedDomain = responseBody.find((d) => d.domain === domain);

      expect(expectedDomain).to.deep.include({
        domain,
        active: false,
        // node_whitelist_enabled: false,
      });
    });

    it('NDID should enable domain successfully', async function () {
      this.timeout(10000);

      const response = await ndidApi.enableDomain('ndid1', {
        domain,
      });
      expect(response.status).to.equal(204);
    });

    it('Domain should be enabled successfully', async function () {
      this.timeout(10000);
      let response;
      let responseBody;

      response = await commonApi.getDomainList('ndid1');
      responseBody = await response.json();
      const expectedDomain = responseBody.find((d) => d.domain === domain);

      expect(expectedDomain).to.deep.include({
        domain,
        active: true,
        // node_whitelist_enabled: false,
      });
    });
  });

  describe('Enable/Disable node whitelist', function () {
    before(async function () {
      this.timeout(5000);

      const response = await commonApi.getDomainList('ndid1');
      const responseBody = await response.json();
      const expectedDomain = responseBody.find((d) => d.domain === domain);

      if (expectedDomain.node_whitelist_enabled) {
        await ndidApi.disableDomainNodeWhitelist('ndid1', {
          domain,
        });
      }
    });

    it('NDID should enable domain node whitelist successfully', async function () {
      this.timeout(10000);

      const response = await ndidApi.enableDomainNodeWhitelist('ndid1', {
        domain,
      });
      expect(response.status).to.equal(204);
    });

    it('Domain should be updated successfully', async function () {
      this.timeout(10000);
      let response;
      let responseBody;

      response = await commonApi.getDomainList('ndid1');
      responseBody = await response.json();
      const expectedDomain = responseBody.find((d) => d.domain === domain);

      expect(expectedDomain).to.deep.equal({
        domain,
        active: true,
        node_whitelist_enabled: true,
        cross_domain_request_disabled: false,
      });
    });

    it('NDID should disable domain node whitelist successfully', async function () {
      this.timeout(10000);

      const response = await ndidApi.disableDomainNodeWhitelist('ndid1', {
        domain,
      });
      expect(response.status).to.equal(204);
    });

    it('Domain should be updated successfully', async function () {
      this.timeout(10000);
      let response;
      let responseBody;

      response = await commonApi.getDomainList('ndid1');
      responseBody = await response.json();
      const expectedDomain = responseBody.find((d) => d.domain === domain);

      expect(expectedDomain).to.deep.equal({
        domain,
        active: true,
        node_whitelist_enabled: false,
        cross_domain_request_disabled: false,
      });
    });
  });

  describe('Add/Remove node to/from node whitelist', function () {
    before(async function () {
      this.timeout(5000);

      const response = await commonApi.getDomainNodeWhitelistByDomain('ndid1', {
        domain,
      });
      const responseBody = await response.json();

      if (responseBody.node_id_list.includes('rp1')) {
        await ndidApi.removeNodeFromDomainNodeWhitelist('ndid1', {
          domain,
          node_id: 'rp1',
        });
      }
    });

    it('NDID should add node to domain node whitelist successfully', async function () {
      this.timeout(10000);

      const response = await ndidApi.addNodeToDomainNodeWhitelist('ndid1', {
        domain,
        node_id: 'rp1',
      });

      expect(response.status).to.equal(204);
    });

    it('should be added successfully', async function () {
      this.timeout(10000);

      const response = await commonApi.getDomainNodeWhitelistByDomain('ndid1', {
        domain,
      });
      const responseBody = await response.json();

      expect(responseBody.node_id_list).to.include.members(['rp1']);
      expect(responseBody).to.deep.include({
        // node_id_list: ['rp1'],
        enabled: false,
      });
    });

    it('NDID should remove node from domain node whitelist successfully', async function () {
      this.timeout(10000);

      const response = await ndidApi.removeNodeFromDomainNodeWhitelist(
        'ndid1',
        {
          domain,
          node_id: 'rp1',
        }
      );

      expect(response.status).to.equal(204);
    });

    it('should be removed successfully', async function () {
      this.timeout(10000);

      const response = await commonApi.getDomainNodeWhitelistByDomain('ndid1', {
        domain,
      });
      const responseBody = await response.json();

      expect(responseBody.node_id_list).to.not.include.members(['rp1']);
      expect(responseBody).to.deep.include({
        // node_id_list: [],
        enabled: false,
      });
    });
  });

  describe('Enable/Disable cross service domain request', function () {
    before(async function () {
      this.timeout(5000);

      const response = await commonApi.getDomainList('ndid1');
      const responseBody = await response.json();
      const expectedDomain = responseBody.find((d) => d.domain === domain);

      if (expectedDomain.cross_domain_request_disabled) {
        await ndidApi.enableDomainCrossDomainRequest('ndid1', {
          domain,
        });
      }
    });

    it('NDID should disable domain cross service domain request successfully', async function () {
      this.timeout(10000);

      const response = await ndidApi.disableDomainCrossDomainRequest('ndid1', {
        domain,
      });
      expect(response.status).to.equal(204);
    });

    it('Domain should be updated successfully', async function () {
      this.timeout(10000);
      let response;
      let responseBody;

      response = await commonApi.getDomainList('ndid1');
      responseBody = await response.json();
      const expectedDomain = responseBody.find((d) => d.domain === domain);

      expect(expectedDomain).to.deep.equal({
        domain,
        active: true,
        node_whitelist_enabled: false,
        cross_domain_request_disabled: true,
      });
    });

    it('NDID should enable domain cross service domain request successfully', async function () {
      this.timeout(10000);

      const response = await ndidApi.enableDomainCrossDomainRequest('ndid1', {
        domain,
      });
      expect(response.status).to.equal(204);
    });

    it('Domain should be updated successfully', async function () {
      this.timeout(10000);
      let response;
      let responseBody;

      response = await commonApi.getDomainList('ndid1');
      responseBody = await response.json();
      const expectedDomain = responseBody.find((d) => d.domain === domain);

      expect(expectedDomain).to.deep.equal({
        domain,
        active: true,
        node_whitelist_enabled: false,
        cross_domain_request_disabled: false,
      });
    });
  });

  describe('Create Request', function () {
    let namespace;
    let identifier;

    const serviceId = 'test_service_id';

    let authorizationToken;

    before(async function () {
      const identity = db.idp1Identities.filter(
        (identity) => identity.mode === 2
      );

      if (identity.length === 0) {
        throw new Error('No created identity to use');
      }

      namespace = identity[0].namespace;
      identifier = identity[0].identifier;

      let response;
      let responseBody;

      const authorizationTokenPayload = {
        requester_node_id: 'rp1',
        as_node_id: 'as1',
        namespace,
        identifier,
        token_objective: 'some_string',
        sub_identity_list: [
          {
            namespace: 'account_no',
            identifier: '123-45678-90',
            visible_identifier: '123-45XXX-XX',
            identifier_extension: '{account_type:savings}',
          },
        ],
        service_id_list: [
          {
            service_id: serviceId,
            service_version: 'v1',
            service_extension: ['test'],
          },
        ],
        validate_identifier: true,
        validate_service_id: true,
        validate_service_extension: false,
        usage_type: 'one_time',
        expiration_datetime: Math.floor(Date.now() / 1000) + 1 * 24 * 60 * 60, // + 1 day
        source_request_id_list: ['SOME_REQUEST_ID'],
      };

      response = await yourDataUtilityApi.createSignedAuthorizationToken(
        'as1',
        authorizationTokenPayload
      );
      responseBody = await response.json();

      authorizationToken = responseBody.token;
    });

    describe('Whitelist enabled, node not in whitelist', function () {
      const rpReferenceId = generateReferenceId();

      let createRequestParams;

      before(async function () {
        this.timeout(15000);

        let response;

        response = await ndidApi.enableDomainNodeWhitelist('ndid1', {
          domain,
        });

        if (!response.ok) {
          throw new Error('cannot enable domain node whitelist');
        }

        createRequestParams = {
          service_id: serviceId,
          service_version: 'v1',
          // service_extension: [''],
          as_node_id: 'as1',
          reference_id: rpReferenceId,
          callback_url: config.RP_CALLBACK_URL,
          namespace,
          identifier,
          request_params: JSON.stringify({
            selected_accounts: [
              {
                namespace: 'account_no',
                identifier: '123-45678-90',
                visible_identifier: '123-45XXX-XX',
                identifier_extension: '{account_type:savings}',
              },
            ],
          }),
          authorization: authorizationToken,
          request_timeout: 86400,
        };

        await waitUntilBlockHeightMatch('rp1', 'ndid1');
      });

      it('RP should NOT be able to create a request', async function () {
        this.timeout(10000);
        const response = await yourdataRpApi.createRequest(
          'rp1',
          createRequestParams
        );
        const responseBody = await response.json();
        expect(response.status).to.equal(400);
        expect(responseBody.error.code).to.equal(20104);
      });
    });

    describe('Whitelist enabled, some nodes in whitelist', function () {
      const rpReferenceId = generateReferenceId();

      let createRequestParams;

      before(async function () {
        this.timeout(15000);

        let response;

        response = await ndidApi.addNodeToDomainNodeWhitelist('ndid1', {
          domain,
          node_id: 'rp1',
        });

        if (!response.ok) {
          throw new Error('cannot add node to domain node whitelist');
        }

        createRequestParams = {
          service_id: serviceId,
          service_version: 'v1',
          // service_extension: [''],
          as_node_id: 'as1',
          reference_id: rpReferenceId,
          callback_url: config.RP_CALLBACK_URL,
          namespace,
          identifier,
          request_params: JSON.stringify({
            selected_accounts: [
              {
                namespace: 'account_no',
                identifier: '123-45678-90',
                visible_identifier: '123-45XXX-XX',
                identifier_extension: '{account_type:savings}',
              },
            ],
          }),
          authorization: authorizationToken,
          request_timeout: 86400,
        };

        await waitUntilBlockHeightMatch('rp1', 'ndid1');
      });

      it('RP should NOT be able to create a request', async function () {
        this.timeout(10000);
        const response = await yourdataRpApi.createRequest(
          'rp1',
          createRequestParams
        );
        const responseBody = await response.json();
        expect(response.status).to.equal(400);

        expect(responseBody.error.code).to.equal(20105);
      });

      after(async function () {
        this.timeout(5000);

        await ndidApi.removeNodeFromDomainNodeWhitelist('ndid1', {
          domain,
          node_id: 'rp1',
        });
      });
    });

    describe('Whitelist enabled, all nodes in whitelist', function () {
      const rpReferenceId = generateReferenceId();

      let createRequestParams;

      before(async function () {
        this.timeout(15000);

        let response;

        response = await ndidApi.addNodeToDomainNodeWhitelist('ndid1', {
          domain,
          node_id: 'rp1',
        });

        if (!response.ok) {
          throw new Error('cannot add node to domain node whitelist');
        }

        response = await ndidApi.addNodeToDomainNodeWhitelist('ndid1', {
          domain,
          node_id: 'as1',
        });

        if (!response.ok) {
          throw new Error('cannot add node to domain node whitelist');
        }

        createRequestParams = {
          service_id: serviceId,
          service_version: 'v1',
          // service_extension: [''],
          as_node_id: 'as1',
          reference_id: rpReferenceId,
          callback_url: config.RP_CALLBACK_URL,
          namespace,
          identifier,
          request_params: JSON.stringify({
            selected_accounts: [
              {
                namespace: 'account_no',
                identifier: '123-45678-90',
                visible_identifier: '123-45XXX-XX',
                identifier_extension: '{account_type:savings}',
              },
            ],
          }),
          authorization: authorizationToken,
          request_timeout: 86400,
        };

        await waitUntilBlockHeightMatch('rp1', 'ndid1');
      });

      it('RP should create a request successfully', async function () {
        this.timeout(10000);
        const response = await yourdataRpApi.createRequest(
          'rp1',
          createRequestParams
        );
        const responseBody = await response.json();
        expect(response.status).to.equal(200);
        expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
      });

      after(async function () {
        this.timeout(5000);

        await ndidApi.removeNodeFromDomainNodeWhitelist('ndid1', {
          domain,
          node_id: 'rp1',
        });

        await ndidApi.removeNodeFromDomainNodeWhitelist('ndid1', {
          domain,
          node_id: 'as1',
        });
      });
    });

    describe('Whitelist disabled, node not in whitelist', function () {
      const rpReferenceId = generateReferenceId();

      let createRequestParams;

      before(async function () {
        this.timeout(15000);

        let response;

        // response = await ndidApi.removeNodeFromDomainNodeWhitelist('ndid1', {
        //   domain,
        //   node_id: 'rp1',
        // });

        // if (!response.ok) {
        //   throw new Error('cannot remove node from domain node whitelist');
        // }

        response = await ndidApi.disableDomainNodeWhitelist('ndid1', {
          domain,
          node_id: 'rp1',
        });

        if (!response.ok) {
          throw new Error('cannot disable domain node whitelist');
        }

        createRequestParams = {
          service_id: serviceId,
          service_version: 'v1',
          // service_extension: [''],
          as_node_id: 'as1',
          reference_id: rpReferenceId,
          callback_url: config.RP_CALLBACK_URL,
          namespace,
          identifier,
          request_params: JSON.stringify({
            selected_accounts: [
              {
                namespace: 'account_no',
                identifier: '123-45678-90',
                visible_identifier: '123-45XXX-XX',
                identifier_extension: '{account_type:savings}',
              },
            ],
          }),
          authorization: authorizationToken,
          request_timeout: 86400,
        };

        await waitUntilBlockHeightMatch('rp1', 'ndid1');
      });

      it('RP should create a request successfully', async function () {
        this.timeout(10000);
        const response = await yourdataRpApi.createRequest(
          'rp1',
          createRequestParams
        );
        const responseBody = await response.json();
        expect(response.status).to.equal(200);
        expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
      });
    });

    describe('Cross service domain request disabled', function () {
      const rpReferenceId = generateReferenceId();

      const serviceInDomain = `service_test_${randomString(8)}`;

      const asNodeId = 'as1';

      let createRequestParams;

      before(async function () {
        this.timeout(15000);

        await ensureDomainCrossDomainRequestDisabled({
          domain,
        });

        await ensureService({
          serviceId: serviceInDomain,
          serviceName: serviceInDomain,
          dataSchema: 'n/a',
          dataSchemaVersion: 'n/a',
          domain,
        });

        await ensureASService({
          asNodeId,
          serviceId: serviceInDomain,
          minIal: 1.1,
          minAal: 1,
          supportedNamespaceList: ['citizen_id'],
        });

        createRequestParams = {
          reference_id: rpReferenceId,
          callback_url: config.RP_CALLBACK_URL,
          mode: 2,
          namespace,
          identifier,
          idp_id_list: ['idp1'],
          data_request_list: [
            {
              service_id: 'bank_statement',
              as_id_list: [asNodeId],
              min_as: 1,
              request_params: JSON.stringify({
                format: 'pdf',
              }),
            },
            {
              service_id: serviceInDomain,
              as_id_list: [asNodeId],
              min_as: 1,
              request_params: '',
            },
          ],
          request_message:
            'Test request message (cross service domain request disabled)',
          min_ial: 1.1,
          min_aal: 1,
          min_idp: 1,
          request_timeout: 86400,
          bypass_identity_check: false,
        };

        await waitUntilBlockHeightMatch('rp1', 'ndid1');
      });

      it('RP should NOT be able to create a request', async function () {
        this.timeout(10000);
        const response = await rpApi.createRequest('rp1', createRequestParams);
        const responseBody = await response.json();
        expect(response.status).to.equal(400);
        expect(responseBody.error.code).to.equal(20122);
      });

      after(async function () {
        this.timeout(10000);

        await apiHelpers.getResponseAndBody(
          ndidApi.enableDomainCrossDomainRequest('ndid1', {
            domain,
          })
        );
      });
    });

    describe('Cross service domain request enabled', function () {
      const rpReferenceId = generateReferenceId();

      const serviceInDomain = `service_test_${randomString(8)}`;

      const asNodeId = 'as1';

      let createRequestParams;

      before(async function () {
        this.timeout(15000);

        await ensureDomainCrossDomainRequestEnabled({
          domain,
        });

        await ensureService({
          serviceId: serviceInDomain,
          serviceName: serviceInDomain,
          dataSchema: 'n/a',
          dataSchemaVersion: 'n/a',
          domain,
        });

        await ensureASService({
          asNodeId,
          serviceId: serviceInDomain,
          minIal: 1.1,
          minAal: 1,
          supportedNamespaceList: ['citizen_id'],
        });

        createRequestParams = {
          reference_id: rpReferenceId,
          callback_url: config.RP_CALLBACK_URL,
          mode: 2,
          namespace,
          identifier,
          idp_id_list: ['idp1'],
          data_request_list: [
            {
              service_id: 'bank_statement',
              as_id_list: [asNodeId],
              min_as: 1,
              request_params: JSON.stringify({
                format: 'pdf',
              }),
            },
            {
              service_id: serviceInDomain,
              as_id_list: [asNodeId],
              min_as: 1,
              request_params: '',
            },
          ],
          request_message:
            'Test request message (cross service domain request enabled)',
          min_ial: 1.1,
          min_aal: 1,
          min_idp: 1,
          request_timeout: 86400,
          bypass_identity_check: false,
        };

        await waitUntilBlockHeightMatch('rp1', 'ndid1');
      });

      it('RP should be able to create a request successfully', async function () {
        this.timeout(10000);
        const response = await rpApi.createRequest('rp1', createRequestParams);
        // const responseBody = await response.json();
        expect(response.status).to.equal(202);
      });
    });
  });
});
