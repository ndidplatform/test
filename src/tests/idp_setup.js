import { expect } from 'chai';

import * as idpApi from '../api/v2/idp';
import * as config from '../config';

describe('IdP setup', function() {
  it('should set callbacks successfully', async function() {
    const response = await idpApi.setCallback({
      incoming_request_url: config.IDP_CALLBACK_URL,
      accessor_sign_url: config.IDP_ACCESSOR_SIGN_CALLBACK_URL,
    });
    expect(response.status).to.equal(204);
  });
});