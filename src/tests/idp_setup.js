import { expect } from 'chai';

import * as idpApi from '../api/v2/idp';
import * as config from '../config';

describe('IdP (idp1) setup', function() {
  it('should set callbacks successfully', async function() {
    const response = await idpApi.setCallbacks('idp1', {
      incoming_request_url: config.IDP1_CALLBACK_URL,
      accessor_sign_url: config.IDP1_ACCESSOR_SIGN_CALLBACK_URL,
    });
    expect(response.status).to.equal(204);
  });

  it('should have set callbacks', async function() {
    const response = await idpApi.getCallbacks('idp1');
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.deep.equal({
      incoming_request_url: config.IDP1_CALLBACK_URL,
      accessor_sign_url: config.IDP1_ACCESSOR_SIGN_CALLBACK_URL,
    });
  });
});
