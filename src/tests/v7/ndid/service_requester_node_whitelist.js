import { expect } from 'chai';

import * as ndidApi from '../../../api/v7/ndid';
import * as rpApi from '../../../api/v7/rp';
import * as asApi from '../../../api/v7/as';
import * as commonApi from '../../../api/v7/common';

import { ndidAvailable } from '../..';

import * as db from '../../../db';
import { rpEventEmitter, as1EventEmitter } from '../../../callback_server';

import { createEventPromise, generateReferenceId } from '../../../utils';
import { randomString } from '../../../utils/random';

import { waitUntilBlockHeightMatch } from '../../../tendermint';

import * as config from '../../../config';

describe('Service requester node whitelist', function () {
  const serviceId = `service_test_${randomString(8)}`;
  const serviceName = `Service (${serviceId})`;

  before(async function () {
    if (!ndidAvailable) {
      this.skip();
    }
  });

  describe('Enable/Disable', function () {
    it('NDID should add new service successfully', async function () {
      this.timeout(10000);

      const response = await ndidApi.addService('ndid1', {
        service_id: serviceId,
        service_name: serviceName,
      });

      expect(response.status).to.equal(201);
    });

    it('Service should be added successfully', async function () {
      this.timeout(10000);

      const response = await commonApi.getServices('ndid1');
      const responseBody = await response.json();
      const service = responseBody.find(
        (service) => service.service_id === serviceId
      );

      expect(service).to.deep.equal({
        service_id: serviceId,
        service_name: serviceName,
        requester_node_whitelist_enabled: false,
        active: true,
      });
    });

    it('should get service successfully', async function () {
      this.timeout(15000);
      const response = await commonApi.getService('ndid1', {
        serviceId,
      });
      const responseBody = await response.json();
      expect(responseBody).to.deep.equal({
        service_id: serviceId,
        service_name: serviceName,
        requester_node_whitelist_enabled: false,
        active: true,
      });
    });

    it('NDID should enable service requester node whitelist successfully', async function () {
      this.timeout(10000);

      const response = await ndidApi.enableServiceRequesterNodeWhitelist(
        'ndid1',
        {
          service_id: serviceId,
        }
      );
      expect(response.status).to.equal(204);
    });

    it('Service should be updated successfully', async function () {
      this.timeout(10000);
      let response;
      let responseBody;

      response = await commonApi.getServices('ndid1');
      responseBody = await response.json();
      const service = responseBody.find(
        (service) => service.service_id === serviceId
      );

      expect(service).to.deep.equal({
        service_id: serviceId,
        service_name: serviceName,
        requester_node_whitelist_enabled: true,
        active: true,
      });

      response = await commonApi.getService('ndid1', {
        serviceId,
      });
      responseBody = await response.json();
      expect(responseBody).to.deep.equal({
        service_id: serviceId,
        service_name: serviceName,
        requester_node_whitelist_enabled: true,
        active: true,
      });

      response = await commonApi.getServiceRequesterNodeWhitelistByServiceId(
        'ndid1',
        {
          serviceId,
        }
      );
      responseBody = await response.json();

      expect(responseBody).to.deep.equal({
        node_id_list: [],
        enabled: true,
      });
    });

    it('NDID should disable service requester node whitelist successfully', async function () {
      this.timeout(10000);

      const response = await ndidApi.disableServiceRequesterNodeWhitelist(
        'ndid1',
        {
          service_id: serviceId,
        }
      );
      expect(response.status).to.equal(204);
    });

    it('Service should be updated successfully', async function () {
      this.timeout(10000);
      let response;
      let responseBody;

      response = await commonApi.getServices('ndid1');
      responseBody = await response.json();
      const service = responseBody.find(
        (service) => service.service_id === serviceId
      );

      expect(service).to.deep.equal({
        service_id: serviceId,
        service_name: serviceName,
        requester_node_whitelist_enabled: false,
        active: true,
      });

      response = await commonApi.getService('ndid1', {
        serviceId,
      });
      responseBody = await response.json();
      expect(responseBody).to.deep.equal({
        service_id: serviceId,
        service_name: serviceName,
        requester_node_whitelist_enabled: false,
        active: true,
      });

      response = await commonApi.getServiceRequesterNodeWhitelistByServiceId(
        'ndid1',
        {
          serviceId,
        }
      );
      responseBody = await response.json();

      expect(responseBody).to.deep.equal({
        node_id_list: [],
        enabled: false,
      });
    });
  });

  describe('Add/Remove node', function () {
    it('NDID should add node to service requester node whitelist successfully', async function () {
      this.timeout(10000);

      const response = await ndidApi.addNodeToServiceRequesterNodeWhitelist(
        'ndid1',
        {
          service_id: serviceId,
          node_id: 'rp1',
        }
      );

      expect(response.status).to.equal(204);
    });

    it('should be added successfully', async function () {
      this.timeout(10000);

      const response =
        await commonApi.getServiceRequesterNodeWhitelistByServiceId('ndid1', {
          serviceId,
        });
      const responseBody = await response.json();

      expect(responseBody).to.deep.equal({
        node_id_list: ['rp1'],
        enabled: false,
      });
    });

    it('NDID should remove node from service requester node whitelist successfully', async function () {
      this.timeout(10000);

      const response =
        await ndidApi.removeNodeFromServiceRequesterNodeWhitelist('ndid1', {
          service_id: serviceId,
          node_id: 'rp1',
        });

      expect(response.status).to.equal(204);
    });

    it('should be removed successfully', async function () {
      this.timeout(10000);

      const response =
        await commonApi.getServiceRequesterNodeWhitelistByServiceId('ndid1', {
          serviceId,
        });
      const responseBody = await response.json();

      expect(responseBody).to.deep.equal({
        node_id_list: [],
        enabled: false,
      });
    });
  });

  describe('Create Request', function () {
    let namespace;
    let identifier;

    before(function () {
      const identity = db.idp1Identities.filter(
        (identity) => identity.mode === 2
      );

      if (identity.length === 0) {
        throw new Error('No created identity to use');
      }

      namespace = identity[0].namespace;
      identifier = identity[0].identifier;
    });

    describe('Whitelist enabled, node not in whitelist', function () {
      const rpReferenceId = generateReferenceId();

      let createRequestParams;

      before(async function () {
        this.timeout(15000);

        let response;

        response = await ndidApi.enableServiceRequesterNodeWhitelist('ndid1', {
          service_id: serviceId,
        });

        if (!response.ok) {
          throw new Error('cannot enable service requester node whitelist');
        }

        createRequestParams = {
          reference_id: rpReferenceId,
          callback_url: config.RP_CALLBACK_URL,
          mode: 2,
          namespace,
          identifier,
          idp_id_list: [],
          data_request_list: [
            {
              service_id: serviceId,
              as_id_list: ['as1'],
              min_as: 1,
              request_params: JSON.stringify({
                format: 'pdf',
              }),
            },
          ],
          request_message: 'Test request message',
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

        expect(responseBody.error.code).to.equal(20099);
      });
    });

    describe('Whitelist enabled, node in whitelist', function () {
      const addOrUpdateServiceReferenceId = generateReferenceId(); // AS - setup

      const addOrUpdateServiceResultPromise = createEventPromise(); // AS - setup

      const rpReferenceId = generateReferenceId();

      const createRequestResultPromise = createEventPromise(); // RP

      let createRequestParams;

      before(async function () {
        this.timeout(15000);

        let response;

        response = await ndidApi.addNodeToServiceRequesterNodeWhitelist(
          'ndid1',
          {
            service_id: serviceId,
            node_id: 'rp1',
          }
        );

        if (!response.ok) {
          throw new Error('cannot add node to requester node whitelist');
        }

        response = await ndidApi.approveService('ndid1', {
          service_id: serviceId,
          node_id: 'as1',
        });

        if (!response.ok) {
          throw new Error('cannot approve service');
        }

        await waitUntilBlockHeightMatch('as1', 'ndid1');

        as1EventEmitter.on('callback', function (callbackData) {
          if (callbackData.type === 'add_or_update_service_result') {
            if (callbackData.reference_id === addOrUpdateServiceReferenceId) {
              addOrUpdateServiceResultPromise.resolve(callbackData);
            }
          }
        });

        response = await asApi.addOrUpdateService('as1', {
          serviceId,
          reference_id: addOrUpdateServiceReferenceId,
          callback_url: config.AS1_CALLBACK_URL,
          min_ial: 1.1,
          min_aal: 1,
          url: config.AS1_CALLBACK_URL,
          supported_namespace_list: ['citizen_id'],
        });

        if (!response.ok) {
          throw new Error('cannot add/update service');
        }

        const addOrUpdateServiceResult =
          await addOrUpdateServiceResultPromise.promise;

        if (!addOrUpdateServiceResult.success) {
          throw new Error('cannot add/update service');
        }

        rpEventEmitter.on('callback', function (callbackData) {
          if (
            callbackData.type === 'create_request_result' &&
            callbackData.reference_id === rpReferenceId
          ) {
            createRequestResultPromise.resolve(callbackData);
          }
        });

        createRequestParams = {
          reference_id: rpReferenceId,
          callback_url: config.RP_CALLBACK_URL,
          mode: 2,
          namespace,
          identifier,
          idp_id_list: [],
          data_request_list: [
            {
              service_id: serviceId,
              as_id_list: ['as1'],
              min_as: 1,
              request_params: JSON.stringify({
                format: 'pdf',
              }),
            },
          ],
          request_message: 'Test request message',
          min_ial: 1.1,
          min_aal: 1,
          min_idp: 1,
          request_timeout: 86400,
          bypass_identity_check: false,
        };

        await waitUntilBlockHeightMatch('rp1', 'as1');
      });

      it('RP should create a request successfully', async function () {
        this.timeout(10000);
        const response = await rpApi.createRequest('rp1', createRequestParams);
        const responseBody = await response.json();
        expect(response.status).to.equal(202);
        expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
        expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

        const createRequestResult = await createRequestResultPromise.promise;
        expect(createRequestResult.success).to.equal(true);
        expect(createRequestResult.creation_block_height).to.be.a('string');
        const splittedCreationBlockHeight =
          createRequestResult.creation_block_height.split(':');
        expect(splittedCreationBlockHeight).to.have.lengthOf(2);
        expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
        expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
      });

      after(function () {
        rpEventEmitter.removeAllListeners('callback');
        as1EventEmitter.removeAllListeners('callback');
      });
    });

    describe('Whitelist disabled, node not in whitelist', function () {
      const rpReferenceId = generateReferenceId();

      const createRequestResultPromise = createEventPromise(); // RP

      let createRequestParams;

      before(async function () {
        this.timeout(15000);

        let response;

        response = await ndidApi.removeNodeFromServiceRequesterNodeWhitelist(
          'ndid1',
          {
            service_id: serviceId,
            node_id: 'rp1',
          }
        );

        if (!response.ok) {
          throw new Error('cannot remove node from requester node whitelist');
        }

        response = await ndidApi.disableServiceRequesterNodeWhitelist('ndid1', {
          service_id: serviceId,
          node_id: 'rp1',
        });

        if (!response.ok) {
          throw new Error('cannot disable service requester node whitelist');
        }

        rpEventEmitter.on('callback', function (callbackData) {
          if (
            callbackData.type === 'create_request_result' &&
            callbackData.reference_id === rpReferenceId
          ) {
            createRequestResultPromise.resolve(callbackData);
          }
        });

        createRequestParams = {
          reference_id: rpReferenceId,
          callback_url: config.RP_CALLBACK_URL,
          mode: 2,
          namespace,
          identifier,
          idp_id_list: [],
          data_request_list: [
            {
              service_id: serviceId,
              as_id_list: ['as1'],
              min_as: 1,
              request_params: JSON.stringify({
                format: 'pdf',
              }),
            },
          ],
          request_message: 'Test request message',
          min_ial: 1.1,
          min_aal: 1,
          min_idp: 1,
          request_timeout: 86400,
          bypass_identity_check: false,
        };

        await waitUntilBlockHeightMatch('rp1', 'ndid1');
      });

      it('RP should create a request successfully', async function () {
        this.timeout(10000);
        const response = await rpApi.createRequest('rp1', createRequestParams);
        const responseBody = await response.json();
        expect(response.status).to.equal(202);
        expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
        expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

        const createRequestResult = await createRequestResultPromise.promise;
        expect(createRequestResult.success).to.equal(true);
        expect(createRequestResult.creation_block_height).to.be.a('string');
        const splittedCreationBlockHeight =
          createRequestResult.creation_block_height.split(':');
        expect(splittedCreationBlockHeight).to.have.lengthOf(2);
        expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
        expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
      });

      after(function () {
        rpEventEmitter.removeAllListeners('callback');
        as1EventEmitter.removeAllListeners('callback');
      });
    });
  });
});
