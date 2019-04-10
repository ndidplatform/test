import { expect } from 'chai';

import { idp2Available } from '../';
import * as idpApi from '../../api/v3/idp';
import * as config from '../../config';

describe('IdP (idp1) setup', function() {
  it('should set callbacks successfully', async function() {
    const response = await idpApi.setCallbacks('idp1', {
      incoming_request_url: config.IDP1_CALLBACK_URL,
      incoming_request_status_update_url: config.IDP1_CALLBACK_URL,
      // accessor_sign_url: config.IDP1_ACCESSOR_SIGN_CALLBACK_URL,
      identity_modification_notification_url:
        config.IDP1_NOTIFICATION_CALLBACK_URL,
      accessor_encrypt_url: config.IDP1_ACCESSOR_ENCRYPT_CALLBACK_URL,
      error_url: config.IDP1_CALLBACK_URL,
    });
    expect(response.status).to.equal(204);
  });
  it('should have set callbacks', async function() {
    const response = await idpApi.getCallbacks('idp1');
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.deep.equal({
      incoming_request_url: config.IDP1_CALLBACK_URL,
      incoming_request_status_update_url: config.IDP1_CALLBACK_URL,
      // accessor_sign_url: config.IDP1_ACCESSOR_SIGN_CALLBACK_URL,
      identity_modification_notification_url:
        config.IDP1_NOTIFICATION_CALLBACK_URL,
      accessor_encrypt_url: config.IDP1_ACCESSOR_ENCRYPT_CALLBACK_URL,
      error_url: config.IDP1_CALLBACK_URL,
    });
  });
});

describe('IdP (idp2) setup', function() {
  before(async function() {
    if (!idp2Available) {
      this.skip();
    }
  });

  it('should set callbacks successfully', async function() {
    const response = await idpApi.setCallbacks('idp2', {
      incoming_request_url: config.IDP2_CALLBACK_URL,
      incoming_request_status_update_url: config.IDP2_CALLBACK_URL,
      // accessor_sign_url: config.IDP2_ACCESSOR_SIGN_CALLBACK_URL,
      identity_modification_notification_url:
        config.IDP2_NOTIFICATION_CALLBACK_URL,
      accessor_encrypt_url: config.IDP2_ACCESSOR_ENCRYPT_CALLBACK_URL,
      error_url: config.IDP2_CALLBACK_URL,
    });
    expect(response.status).to.equal(204);
  });

  it('should have set callbacks', async function() {
    const response = await idpApi.getCallbacks('idp2');
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.deep.equal({
      incoming_request_url: config.IDP2_CALLBACK_URL,
      incoming_request_status_update_url: config.IDP2_CALLBACK_URL,
      // accessor_sign_url: config.IDP2_ACCESSOR_SIGN_CALLBACK_URL,
      identity_modification_notification_url:
        config.IDP2_NOTIFICATION_CALLBACK_URL,
      accessor_encrypt_url: config.IDP2_ACCESSOR_ENCRYPT_CALLBACK_URL,
      error_url: config.IDP2_CALLBACK_URL,
    });
  });
});
