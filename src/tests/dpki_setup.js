import { expect } from 'chai';

import { idp2Available, as1Available, as2Available } from '.';
import * as dpkiApi from '../api/v2/dpki';
import * as config from '../config';

describe('DPKI callback setup', function() {
  before(function() {
    if (!config.USE_EXTERNAL_CRYPTO_SERVICE) {
      this.test.parent.pending = true;
      this.skip();
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
});
