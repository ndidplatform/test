import { expect } from 'chai';

import { proxy1Available, proxy2Available } from '..';
import * as rpApi from '../../api/v3/rp';
import * as idpApi from '../../api/v3/idp';
import * as asApi from '../../api/v3/as';
import { proxy1EventEmitter } from '../../callback_server';
import { createEventPromise, generateReferenceId } from '../../utils';
import * as config from '../../config';

describe('Proxy (proxy1) setup', function() {
  before(async function() {
    if (!proxy1Available) {
      this.test.parent.pending = true;
      this.skip();
    }
  });

  // RP
  it('should set RP callbacks successfully', async function() {
    const response = await rpApi.setCallbacks('proxy1', {
      error_url: config.PROXY1_CALLBACK_URL,
    });
    expect(response.status).to.equal(204);
  });

  it('should have set RP callbacks', async function() {
    const response = await rpApi.getCallbacks('proxy1');
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.deep.equal({
      error_url: config.PROXY1_CALLBACK_URL,
    });
  });

  // IdP
  it('should set IdP callbacks successfully', async function() {
    const response = await idpApi.setCallbacks('proxy1', {
      incoming_request_url: config.PROXY1_CALLBACK_URL,
      incoming_request_status_update_url: config.PROXY1_CALLBACK_URL,
      // accessor_sign_url: config.PROXY1_ACCESSOR_SIGN_CALLBACK_URL,
      error_url: config.PROXY1_CALLBACK_URL,
      identity_modification_notification_url:
        config.PROXY1_NOTIFICATION_CALLBACK_URL,
      accessor_encrypt_url: config.PROXY1_ACCESSOR_ENCRYPT_CALLBACK_URL,
    });
    expect(response.status).to.equal(204);
  });

  it('should have set IdP callbacks', async function() {
    const response = await idpApi.getCallbacks('proxy1');
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.deep.equal({
      incoming_request_url: config.PROXY1_CALLBACK_URL,
      incoming_request_status_update_url: config.PROXY1_CALLBACK_URL,
      //accessor_sign_url: config.PROXY1_ACCESSOR_SIGN_CALLBACK_URL,
      error_url: config.PROXY1_CALLBACK_URL,
      identity_modification_notification_url:
        config.PROXY1_NOTIFICATION_CALLBACK_URL,
      accessor_encrypt_url: config.PROXY1_ACCESSOR_ENCRYPT_CALLBACK_URL,
    });
  });

  // AS
  it('should set AS callbacks successfully', async function() {
    const response = await asApi.setCallbacks('proxy1', {
      error_url: config.PROXY1_CALLBACK_URL,
      incoming_request_status_update_url: config.PROXY1_CALLBACK_URL,
    });
    expect(response.status).to.equal(204);
  });

  it('should have set AS callbacks', async function() {
    const response = await asApi.getCallbacks('proxy1');
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.deep.equal({
      error_url: config.PROXY1_CALLBACK_URL,
      incoming_request_status_update_url: config.PROXY1_CALLBACK_URL,
    });
  });

  // AS services
  describe('AS behind proxy (proxy1_as4) services setup', function() {
    const asNodeId = 'proxy1_as4';

    const bankStatementReferenceId = generateReferenceId();
    const customerInfoReferenceId = generateReferenceId();

    const addOrUpdateServiceBankStatementResultPromise = createEventPromise();
    const addOrUpdateServiceCustomerInfoResultPromise = createEventPromise();

    before(function() {
      proxy1EventEmitter.on('callback', function(callbackData) {
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
      const response = await asApi.addOrUpdateService('proxy1', {
        node_id: asNodeId,
        serviceId: 'bank_statement',
        reference_id: bankStatementReferenceId,
        callback_url: config.PROXY1_CALLBACK_URL,
        min_ial: 1.1,
        min_aal: 1,
        url: config.PROXY1_CALLBACK_URL,
        supported_namespace_list: ['citizen_id'],
      });
      expect(response.status).to.equal(202);

      const addOrUpdateServiceResult = await addOrUpdateServiceBankStatementResultPromise.promise;
      expect(addOrUpdateServiceResult).to.deep.include({
        node_id: asNodeId,
        reference_id: bankStatementReferenceId,
        success: true,
      });
    });

    it('should have offered service (bank_statement)', async function() {
      const response = await asApi.getService('proxy1', {
        node_id: asNodeId,
        serviceId: 'bank_statement',
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.deep.equal({
        min_ial: 1.1,
        min_aal: 1,
        url: config.PROXY1_CALLBACK_URL,
        active: true,
        suspended: false,
        supported_namespace_list: ['citizen_id'],
      });
    });

    it('should add offered service (customer_info) successfully', async function() {
      this.timeout(10000);
      const response = await asApi.addOrUpdateService('proxy1', {
        node_id: asNodeId,
        serviceId: 'customer_info',
        reference_id: customerInfoReferenceId,
        callback_url: config.PROXY1_CALLBACK_URL,
        min_ial: 1.1,
        min_aal: 1,
        url: config.PROXY1_CALLBACK_URL,
        supported_namespace_list: ['citizen_id'],
      });
      expect(response.status).to.equal(202);

      const addOrUpdateServiceResult = await addOrUpdateServiceCustomerInfoResultPromise.promise;
      expect(addOrUpdateServiceResult).to.deep.include({
        node_id: asNodeId,
        reference_id: customerInfoReferenceId,
        success: true,
      });
    });

    it('should have offered service (customer_info)', async function() {
      const response = await asApi.getService('proxy1', {
        node_id: asNodeId,
        serviceId: 'customer_info',
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.deep.equal({
        min_ial: 1.1,
        min_aal: 1,
        url: config.PROXY1_CALLBACK_URL,
        active: true,
        suspended: false,
        supported_namespace_list: ['citizen_id'],
      });
    });

    after(function() {
      proxy1EventEmitter.removeAllListeners('callback');
    });
  });
});

describe('Proxy (proxy2) setup', function() {
  before(async function() {
    if (!proxy2Available) {
      this.test.parent.pending = true;
      this.skip();
    }
  });

  // RP
  it('should set RP callbacks successfully', async function() {
    const response = await rpApi.setCallbacks('proxy2', {
      error_url: config.PROXY2_CALLBACK_URL,
    });
    expect(response.status).to.equal(204);
  });

  it('should have set RP callbacks', async function() {
    const response = await rpApi.getCallbacks('proxy2');
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.deep.equal({
      error_url: config.PROXY2_CALLBACK_URL,
    });
  });

  // IdP
  it('should set IdP callbacks successfully', async function() {
    const response = await idpApi.setCallbacks('proxy2', {
      incoming_request_url: config.PROXY2_CALLBACK_URL,
      incoming_request_status_update_url: config.PROXY2_CALLBACK_URL,
      //accessor_sign_url: config.PROXY2_ACCESSOR_SIGN_CALLBACK_URL,
      error_url: config.PROXY2_CALLBACK_URL,
      identity_modification_notification_url:
        config.PROXY2_NOTIFICATION_CALLBACK_URL,
      accessor_encrypt_url: config.PROXY2_ACCESSOR_ENCRYPT_CALLBACK_URL,
    });
    expect(response.status).to.equal(204);
  });

  it('should have set IdP callbacks', async function() {
    const response = await idpApi.getCallbacks('proxy2');
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.deep.equal({
      incoming_request_url: config.PROXY2_CALLBACK_URL,
      incoming_request_status_update_url: config.PROXY2_CALLBACK_URL,
      //accessor_sign_url: config.PROXY2_ACCESSOR_SIGN_CALLBACK_URL,
      error_url: config.PROXY2_CALLBACK_URL,
      identity_modification_notification_url:
        config.PROXY2_NOTIFICATION_CALLBACK_URL,
      accessor_encrypt_url: config.PROXY2_ACCESSOR_ENCRYPT_CALLBACK_URL,
    });
  });

  // AS
  it('should set AS callbacks successfully', async function() {
    const response = await asApi.setCallbacks('proxy2', {
      error_url: config.PROXY2_CALLBACK_URL,
      incoming_request_status_update_url: config.PROXY2_CALLBACK_URL,
    });
    expect(response.status).to.equal(204);
  });

  it('should have set AS callbacks', async function() {
    const response = await asApi.getCallbacks('proxy2');
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.deep.equal({
      error_url: config.PROXY2_CALLBACK_URL,
      incoming_request_status_update_url: config.PROXY2_CALLBACK_URL,
    });
  });
});
