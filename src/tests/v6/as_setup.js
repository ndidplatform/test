import { expect } from 'chai';

import { as1Available, as2Available } from '../';
import * as asApi from '../../api/v6/as';
import * as config from '../../config';

describe('AS (as1) setup', function() {
  before(async function() {
    if (!as1Available) {
      this.skip();
    }
  });

  it('should set callbacks successfully', async function() {
    const response = await asApi.setCallbacks('as1', {
      incoming_request_status_update_url: config.AS1_CALLBACK_URL,
      error_url: config.AS1_CALLBACK_URL,
    });
    expect(response.status).to.equal(204);
  });

  it('should have set callbacks', async function() {
    const response = await asApi.getCallbacks('as1');
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.deep.equal({
      incoming_request_status_update_url: config.AS1_CALLBACK_URL,
      error_url: config.AS1_CALLBACK_URL,
    });
  });
});

describe('AS (as2) setup', function() {
  before(async function() {
    if (!as2Available) {
      this.skip();
    }
  });

  it('should set callbacks successfully', async function() {
    const response = await asApi.setCallbacks('as2', {
      incoming_request_status_update_url: config.AS2_CALLBACK_URL,
      error_url: config.AS2_CALLBACK_URL,
    });
    expect(response.status).to.equal(204);
  });

  it('should have set callbacks', async function() {
    const response = await asApi.getCallbacks('as2');
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.deep.equal({
      incoming_request_status_update_url: config.AS2_CALLBACK_URL,
      error_url: config.AS2_CALLBACK_URL,
    });
  });
});
