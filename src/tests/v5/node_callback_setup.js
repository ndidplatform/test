import { expect } from 'chai';

import { idp2Available, as1Available, as2Available, proxy1Available } from '..';
import * as nodeApi from '../../api/v5/node';
import * as config from '../../config';

describe('Node callback setup', function() {
  describe('RP (rp1) node callback setup', function() {
    it('should set callbacks successfully', async function() {
      const response = await nodeApi.setCallbacks('rp1', {
        message_queue_send_success_url: config.MQ_SEND_SUCCESS_CALLBACK_URL,
      });
      expect(response.status).to.equal(204);
    });

    it('should have set callbacks', async function() {
      const response = await nodeApi.getCallbacks('rp1');
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody.message_queue_send_success_url).to.equal(
        config.MQ_SEND_SUCCESS_CALLBACK_URL
      );
    });
  });

  describe('IdP (idp1) node callback setup', function() {
    it('should set callbacks successfully', async function() {
      const response = await nodeApi.setCallbacks('idp1', {
        message_queue_send_success_url: config.MQ_SEND_SUCCESS_CALLBACK_URL,
      });
      expect(response.status).to.equal(204);
    });

    it('should have set callbacks', async function() {
      const response = await nodeApi.getCallbacks('idp1');
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody.message_queue_send_success_url).to.equal(
        config.MQ_SEND_SUCCESS_CALLBACK_URL
      );
    });
  });

  describe('IdP (idp2) node callback setup', function() {
    before(async function() {
      if (!idp2Available) {
        this.skip();
      }
    });

    it('should set callbacks successfully', async function() {
      const response = await nodeApi.setCallbacks('idp2', {
        message_queue_send_success_url: config.MQ_SEND_SUCCESS_CALLBACK_URL,
      });
      expect(response.status).to.equal(204);
    });

    it('should have set callbacks', async function() {
      const response = await nodeApi.getCallbacks('idp2');
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody.message_queue_send_success_url).to.equal(
        config.MQ_SEND_SUCCESS_CALLBACK_URL
      );
    });
  });

  describe('AS (as1) node callback setup', function() {
    before(async function() {
      if (!as1Available) {
        this.skip();
      }
    });

    it('should set callbacks successfully', async function() {
      const response = await nodeApi.setCallbacks('as1', {
        message_queue_send_success_url: config.MQ_SEND_SUCCESS_CALLBACK_URL,
      });
      expect(response.status).to.equal(204);
    });

    it('should have set callbacks', async function() {
      const response = await nodeApi.getCallbacks('as1');
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody.message_queue_send_success_url).to.equal(
        config.MQ_SEND_SUCCESS_CALLBACK_URL
      );
    });
  });

  describe('AS (as2) node callback setup', function() {
    before(async function() {
      if (!as2Available) {
        this.skip();
      }
    });

    it('should set callbacks successfully', async function() {
      const response = await nodeApi.setCallbacks('as2', {
        message_queue_send_success_url: config.MQ_SEND_SUCCESS_CALLBACK_URL,
      });
      expect(response.status).to.equal(204);
    });

    it('should have set callbacks', async function() {
      const response = await nodeApi.getCallbacks('as2');
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody.message_queue_send_success_url).to.equal(
        config.MQ_SEND_SUCCESS_CALLBACK_URL
      );
    });
  });

  describe('Proxy (proxy1) node callback setup', function() {
    before(async function() {
      if (!proxy1Available) {
        this.skip();
      }
    });

    it('should set callbacks successfully', async function() {
      const response = await nodeApi.setCallbacks('proxy1', {
        message_queue_send_success_url: config.MQ_SEND_SUCCESS_CALLBACK_URL,
      });
      expect(response.status).to.equal(204);
    });

    it('should have set callbacks', async function() {
      const response = await nodeApi.getCallbacks('proxy1');
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody.message_queue_send_success_url).to.equal(
        config.MQ_SEND_SUCCESS_CALLBACK_URL
      );
    });
  });

  describe('Proxy (proxy2) node callback setup', function() {
    before(async function() {
      if (!proxy1Available) {
        this.skip();
      }
    });

    it('should set callbacks successfully', async function() {
      const response = await nodeApi.setCallbacks('proxy2', {
        message_queue_send_success_url: config.MQ_SEND_SUCCESS_CALLBACK_URL,
      });
      expect(response.status).to.equal(204);
    });

    it('should have set callbacks', async function() {
      const response = await nodeApi.getCallbacks('proxy2');
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody.message_queue_send_success_url).to.equal(
        config.MQ_SEND_SUCCESS_CALLBACK_URL
      );
    });
  });
});
