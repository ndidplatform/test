import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import * as rpApi from '../../../api/v3/rp';
import * as ndidApi from '../../../api/v3/ndid';
import * as asApi from '../../../api/v3/as';
import * as commonApi from '../../../api/v3/common';
import { ndidAvailable, as2Available } from '../..';
import { generateReferenceId, createEventPromise, wait } from '../../../utils';
import { as1EventEmitter } from '../../../callback_server';
import * as config from '../../../config';

describe('RP create request errors (unqualified to response)', function() {
  describe('IdP ID list are unqualified to response (max_ial) test', function() {
    let namespace = 'citizen_id';
    let identifier = uuidv4();

    const rpReferenceId = generateReferenceId();

    before(async function() {
      this.timeout(10000);
      if (!ndidAvailable) {
        this.test.parent.pending = true;
        this.skip();
      }
      const response = await commonApi.getIdP('ndid1');
      const responseBody = await response.json();
      let idp3 = responseBody.find(idp => idp.node_id === 'idp3');
      if (!idp3) {
        this.test.parent.pending = true;
        this.skip();
      }
    });

    it("NDID should update IDP's (idp3) max ial (1.1) successfully", async function() {
      this.timeout(10000);
      const response = await ndidApi.updateNode('ndid1', {
        node_id: 'idp3',
        max_ial: 1.1,
      });
      expect(response.status).to.equal(200);
      await wait(3000);
    });

    it('should get an error when creating a request with some IdP IDs in requested IdP ID list are unqualified to response', async function() {
      this.timeout(10000);
      const createRequestParams = {
        reference_id: rpReferenceId,
        callback_url: config.RP_CALLBACK_URL,
        mode: 1,
        namespace,
        identifier,
        idp_id_list: ['idp1', 'idp2', 'idp3'], //idp3 is unqualified to response
        data_request_list: [],
        request_message:
          'Test request message (error create request IdP ID list are unqualified to response)',
        min_ial: 2.3,
        min_aal: 1,
        min_idp: 1,
        request_timeout: 86400,
      };

      const response = await rpApi.createRequest('rp1', createRequestParams);
      const responseBody = await response.json();
      expect(response.status).to.equal(400);
      expect(responseBody.error.code).to.equal(20058);
    });
    after(async function() {
      this.timeout(5000);
      await ndidApi.updateNode('ndid1', {
        node_id: 'idp3',
        max_ial: 3,
      });
    });
  });

  describe('IdP ID list are unqualified to response (max_aal) test', function() {
    let namespace = 'citizen_id';
    let identifier = uuidv4();

    const rpReferenceId = generateReferenceId();

    before(async function() {
      this.timeout(10000);
      if (!ndidAvailable) {
        this.test.parent.pending = true;
        this.skip();
      }
      const response = await commonApi.getIdP('ndid1');
      const responseBody = await response.json();
      let idp3 = responseBody.find(idp => idp.node_id === 'idp3');
      if (!idp3) {
        this.test.parent.pending = true;
        this.skip();
      }
    });

    it("NDID should update IDP's (idp3) max aal (1) successfully", async function() {
      this.timeout(10000);
      const response = await ndidApi.updateNode('ndid1', {
        node_id: 'idp3',
        max_aal: 1,
      });
      expect(response.status).to.equal(200);
      await wait(3000);
    });

    it('should get an error when creating a request with some IdP IDs in requested IdP ID list are unqualified to response', async function() {
      this.timeout(10000);
      const createRequestParams = {
        reference_id: rpReferenceId,
        callback_url: config.RP_CALLBACK_URL,
        mode: 1,
        namespace,
        identifier,
        idp_id_list: ['idp1', 'idp2', 'idp3'], //idp3 is unqualified to response
        data_request_list: [],
        request_message:
          'Test request message (error create request IdP ID list are unqualified to response)',
        min_ial: 1.1,
        min_aal: 2.2,
        min_idp: 1,
        request_timeout: 86400,
      };

      const response = await rpApi.createRequest('rp1', createRequestParams);
      const responseBody = await response.json();
      expect(response.status).to.equal(400);
      expect(responseBody.error.code).to.equal(20058);
    });
    after(async function() {
      this.timeout(5000);
      await ndidApi.updateNode('ndid1', {
        node_id: 'idp3',
        max_aal: 3,
      });
    });
  });

  describe('Some services in data request list are unqualified to release data (min_ial) test', function() {
    let namespace = 'citizen_id';
    let identifier = uuidv4();

    const rpReferenceId = generateReferenceId();
    const bankStatementReferenceId = generateReferenceId();

    const addOrUpdateServiceBankStatementResultPromise = createEventPromise();

    before(function() {
      this.timeout(5000);
      if (!as2Available) {
        this.test.parent.pending = true;
        this.skip();
      }

      as1EventEmitter.on('callback', function(callbackData) {
        if (callbackData.type === 'add_or_update_service_result') {
          if (callbackData.reference_id === bankStatementReferenceId) {
            addOrUpdateServiceBankStatementResultPromise.resolve(callbackData);
          }
        }
      });
    });

    it('AS (as1) should add offered service (bank_statement) with min_ial = 3 successfully', async function() {
      this.timeout(15000);
      const response = await asApi.addOrUpdateService('as1', {
        serviceId: 'bank_statement',
        reference_id: bankStatementReferenceId,
        callback_url: config.AS1_CALLBACK_URL,
        min_ial: 3,
        min_aal: 1,
        url: config.AS1_CALLBACK_URL,
      });
      expect(response.status).to.equal(202);

      const addOrUpdateServiceResult = await addOrUpdateServiceBankStatementResultPromise.promise;
      expect(addOrUpdateServiceResult).to.deep.include({
        reference_id: bankStatementReferenceId,
        success: true,
      });
      await wait(3000);
    });

    it('should get an error when creating a request with some services in data request list are unqualified to release data', async function() {
      this.timeout(10000);
      const createRequestParams = {
        reference_id: rpReferenceId,
        callback_url: config.RP_CALLBACK_URL,
        mode: 1,
        namespace,
        identifier,
        idp_id_list: ['idp1'],
        data_request_list: [
          {
            service_id: 'bank_statement',
            as_id_list: ['as1', 'as2'], //as1 (min_ial = 3) is unqualified to release data
            min_as: 1,
            request_params: JSON.stringify({
              format: 'pdf',
            }),
          },
        ],
        request_message:
          'Test request message (error create request some services in data request list are unqualified to release data test)',
        min_ial: 2.3,
        min_aal: 1,
        min_idp: 1,
        request_timeout: 86400,
      };

      const response = await rpApi.createRequest('rp1', createRequestParams);
      const responseBody = await response.json();
      expect(response.status).to.equal(400);
      expect(responseBody.error.code).to.equal(20058);
    });
    after(async function() {
      this.timeout(10000);
      await asApi.addOrUpdateService('as1', {
        serviceId: 'bank_statement',
        reference_id: bankStatementReferenceId,
        callback_url: config.AS1_CALLBACK_URL,
        min_ial: 1.1,
        min_aal: 1,
        url: config.AS1_CALLBACK_URL,
      });
      await wait(3000);
    });
  });

  describe('Some services in data request list are unqualified to release data (min_aal) test', function() {
    let namespace = 'citizen_id';
    let identifier = uuidv4();

    const rpReferenceId = generateReferenceId();
    const bankStatementReferenceId = generateReferenceId();

    const addOrUpdateServiceBankStatementResultPromise = createEventPromise();

    before(function() {
      this.timeout(5000);
      if (!as2Available) {
        this.test.parent.pending = true;
        this.skip();
      }

      as1EventEmitter.on('callback', function(callbackData) {
        if (callbackData.type === 'add_or_update_service_result') {
          if (callbackData.reference_id === bankStatementReferenceId) {
            addOrUpdateServiceBankStatementResultPromise.resolve(callbackData);
          }
        }
      });
    });

    it('AS (as1) should add offered service (bank_statement) with min_aal = 3 successfully', async function() {
      this.timeout(10000);
      const response = await asApi.addOrUpdateService('as1', {
        serviceId: 'bank_statement',
        reference_id: bankStatementReferenceId,
        callback_url: config.AS1_CALLBACK_URL,
        min_ial: 1.1,
        min_aal: 3,
        url: config.AS1_CALLBACK_URL,
      });
      expect(response.status).to.equal(202);

      const addOrUpdateServiceResult = await addOrUpdateServiceBankStatementResultPromise.promise;
      expect(addOrUpdateServiceResult).to.deep.include({
        reference_id: bankStatementReferenceId,
        success: true,
      });
      await wait(3000);
    });

    it('should get an error when creating a request with some services in data request list are unqualified to release data', async function() {
      this.timeout(10000);
      const createRequestParams = {
        reference_id: rpReferenceId,
        callback_url: config.RP_CALLBACK_URL,
        mode: 1,
        namespace,
        identifier,
        idp_id_list: ['idp1'],
        data_request_list: [
          {
            service_id: 'bank_statement',
            as_id_list: ['as1', 'as2'], //as1 (min_ial = 3) is unqualified to release data
            min_as: 1,
            request_params: JSON.stringify({
              format: 'pdf',
            }),
          },
        ],
        request_message:
          'Test request message (error create request some services in data request list are unqualified to release data test)',
        min_ial: 1.1,
        min_aal: 2.2,
        min_idp: 1,
        request_timeout: 86400,
      };

      const response = await rpApi.createRequest('rp1', createRequestParams);
      const responseBody = await response.json();
      expect(response.status).to.equal(400);
      expect(responseBody.error.code).to.equal(20058);
    });
    after(async function() {
      this.timeout(10000);
      await asApi.addOrUpdateService('as1', {
        serviceId: 'bank_statement',
        reference_id: bankStatementReferenceId,
        callback_url: config.AS1_CALLBACK_URL,
        min_ial: 1.1,
        min_aal: 1,
        url: config.AS1_CALLBACK_URL,
      });
      await wait(3000);
    });
  });
});
