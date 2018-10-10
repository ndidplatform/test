import { expect } from 'chai';
import { exec } from 'child_process';

import {
  idp2Available,
  as1Available,
  as2Available,
  ndidAvailable,
  proxy1Available,
} from '.';
import * as dpkiApi from '../api/v2/dpki';
import * as debugApi from '../api/v2/debug';
import * as config from '../config';
import { wait } from '../utils';

describe('DPKI callback setup', function() {
  before(async function() {
    if (!config.USE_EXTERNAL_CRYPTO_SERVICE) {
      this.test.parent.pending = true;
      this.skip();
    } else {
      const response = await debugApi.query('idp1', {
        fnName: 'GetNodeInfo',
        node_id: 'idp1',
      });
      const responseBody = await response.json();
      if (responseBody.mq == null) {
        exec('npm run reset-dev-key', error => {
          if (error) {
            console.error(`exec error: ${error}`);
            return;
          }
        });
        await wait(1500);
      }
    }
  });

  describe('RP (rp1) DPKI callback setup', function() {
    it('should set callbacks successfully', async function() {
      const response = await dpkiApi.setCallbacks('rp1', {
        sign_url: config.DPKI_SIGN_CALLBACK_URL,
        master_sign_url: config.DPKI_MASTER_SIGN_CALLBACK_URL,
        decrypt_url: config.DPKI_DECRYPT_CALLBACK_URL,
      });
      expect(response.status).to.equal(204);
    });

    it('should have set callbacks', async function() {
      const response = await dpkiApi.getCallbacks('rp1');
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.deep.equal({
        sign_url: config.DPKI_SIGN_CALLBACK_URL,
        master_sign_url: config.DPKI_MASTER_SIGN_CALLBACK_URL,
        decrypt_url: config.DPKI_DECRYPT_CALLBACK_URL,
      });
    });
  });

  describe('IdP (idp1) DPKI callback setup', function() {
    it('should set callbacks successfully', async function() {
      const response = await dpkiApi.setCallbacks('idp1', {
        sign_url: config.DPKI_SIGN_CALLBACK_URL,
        master_sign_url: config.DPKI_MASTER_SIGN_CALLBACK_URL,
        decrypt_url: config.DPKI_DECRYPT_CALLBACK_URL,
      });
      expect(response.status).to.equal(204);
    });

    it('should have set callbacks', async function() {
      const response = await dpkiApi.getCallbacks('idp1');
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.deep.equal({
        sign_url: config.DPKI_SIGN_CALLBACK_URL,
        master_sign_url: config.DPKI_MASTER_SIGN_CALLBACK_URL,
        decrypt_url: config.DPKI_DECRYPT_CALLBACK_URL,
      });
    });
  });

  describe('IdP (idp2) DPKI callback setup', function() {
    before(async function() {
      if (!idp2Available) {
        this.skip();
      }
    });

    it('should set callbacks successfully', async function() {
      const response = await dpkiApi.setCallbacks('idp2', {
        sign_url: config.DPKI_SIGN_CALLBACK_URL,
        master_sign_url: config.DPKI_MASTER_SIGN_CALLBACK_URL,
        decrypt_url: config.DPKI_DECRYPT_CALLBACK_URL,
      });
      expect(response.status).to.equal(204);
    });

    it('should have set callbacks', async function() {
      const response = await dpkiApi.getCallbacks('idp2');
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.deep.equal({
        sign_url: config.DPKI_SIGN_CALLBACK_URL,
        master_sign_url: config.DPKI_MASTER_SIGN_CALLBACK_URL,
        decrypt_url: config.DPKI_DECRYPT_CALLBACK_URL,
      });
    });
  });

  describe('AS (as1) DPKI callback setup', function() {
    before(async function() {
      if (!as1Available) {
        this.skip();
      }
    });

    it('should set callbacks successfully', async function() {
      const response = await dpkiApi.setCallbacks('as1', {
        sign_url: config.DPKI_SIGN_CALLBACK_URL,
        master_sign_url: config.DPKI_MASTER_SIGN_CALLBACK_URL,
        decrypt_url: config.DPKI_DECRYPT_CALLBACK_URL,
      });
      expect(response.status).to.equal(204);
    });

    it('should have set callbacks', async function() {
      const response = await dpkiApi.getCallbacks('as1');
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.deep.equal({
        sign_url: config.DPKI_SIGN_CALLBACK_URL,
        master_sign_url: config.DPKI_MASTER_SIGN_CALLBACK_URL,
        decrypt_url: config.DPKI_DECRYPT_CALLBACK_URL,
      });
    });
  });

  describe('AS (as2) DPKI callback setup', function() {
    before(async function() {
      if (!as2Available) {
        this.skip();
      }
    });

    it('should set callbacks successfully', async function() {
      const response = await dpkiApi.setCallbacks('as2', {
        sign_url: config.DPKI_SIGN_CALLBACK_URL,
        master_sign_url: config.DPKI_MASTER_SIGN_CALLBACK_URL,
        decrypt_url: config.DPKI_DECRYPT_CALLBACK_URL,
      });
      expect(response.status).to.equal(204);
    });

    it('should have set callbacks', async function() {
      const response = await dpkiApi.getCallbacks('as2');
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.deep.equal({
        sign_url: config.DPKI_SIGN_CALLBACK_URL,
        master_sign_url: config.DPKI_MASTER_SIGN_CALLBACK_URL,
        decrypt_url: config.DPKI_DECRYPT_CALLBACK_URL,
      });
    });
  });

  describe('Proxy (proxy1) DPKI callback setup', function() {
    before(async function() {
      if (!proxy1Available) {
        this.skip();
      }
    });

    it('should set callbacks successfully', async function() {
      const response = await dpkiApi.setCallbacks('proxy1', {
        sign_url: config.DPKI_SIGN_CALLBACK_URL,
        master_sign_url: config.DPKI_MASTER_SIGN_CALLBACK_URL,
        decrypt_url: config.DPKI_DECRYPT_CALLBACK_URL,
      });
      expect(response.status).to.equal(204);
    });

    it('should have set callbacks', async function() {
      const response = await dpkiApi.getCallbacks('proxy1');
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.deep.equal({
        sign_url: config.DPKI_SIGN_CALLBACK_URL,
        master_sign_url: config.DPKI_MASTER_SIGN_CALLBACK_URL,
        decrypt_url: config.DPKI_DECRYPT_CALLBACK_URL,
      });
    });
  });

  describe('Proxy (proxy2) DPKI callback setup', function() {
    before(async function() {
      if (!proxy1Available) {
        this.skip();
      }
    });

    it('should set callbacks successfully', async function() {
      const response = await dpkiApi.setCallbacks('proxy2', {
        sign_url: config.DPKI_SIGN_CALLBACK_URL,
        master_sign_url: config.DPKI_MASTER_SIGN_CALLBACK_URL,
        decrypt_url: config.DPKI_DECRYPT_CALLBACK_URL,
      });
      expect(response.status).to.equal(204);
    });

    it('should have set callbacks', async function() {
      const response = await dpkiApi.getCallbacks('proxy2');
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.deep.equal({
        sign_url: config.DPKI_SIGN_CALLBACK_URL,
        master_sign_url: config.DPKI_MASTER_SIGN_CALLBACK_URL,
        decrypt_url: config.DPKI_DECRYPT_CALLBACK_URL,
      });
    });
  });

  describe('NDID DPKI callback setup', function() {
    before(async function() {
      if (!ndidAvailable) {
        this.skip();
      }
    });

    it('should set callbacks successfully', async function() {
      const response = await dpkiApi.setCallbacks('ndid1', {
        sign_url: config.DPKI_SIGN_CALLBACK_URL,
        master_sign_url: config.DPKI_MASTER_SIGN_CALLBACK_URL,
        decrypt_url: config.DPKI_DECRYPT_CALLBACK_URL,
      });
      expect(response.status).to.equal(204);
    });

    it('should have set callbacks', async function() {
      const response = await dpkiApi.getCallbacks('ndid1');
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.deep.equal({
        sign_url: config.DPKI_SIGN_CALLBACK_URL,
        master_sign_url: config.DPKI_MASTER_SIGN_CALLBACK_URL,
        decrypt_url: config.DPKI_DECRYPT_CALLBACK_URL,
      });
    });
  });

  after(async function() {
    this.timeout(5000);
    if (config.USE_EXTERNAL_CRYPTO_SERVICE) {
      //wait for register msq after set callback
      await wait(2000);
    }
  });
});
