import { expect } from 'chai';

import { rp2Available } from '../';
import * as rpApi from '../../api/v5/rp';
import * as config from '../../config';

describe('RP (rp1) setup', function () {
  it('should set callbacks successfully', async function () {
    const response = await rpApi.setCallbacks('rp1', {
      error_url: config.RP_CALLBACK_URL,
    });
    expect(response.status).to.equal(204);
  });

  it('should have set callbacks', async function () {
    const response = await rpApi.getCallbacks('rp1');
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.deep.equal({
      error_url: config.RP_CALLBACK_URL,
    });
  });
});

describe('RP (rp2) setup', function () {
  before(async function () {
    if (!rp2Available) {
      this.skip();
    }
  });

  it('should set callbacks successfully', async function () {
    const response = await rpApi.setCallbacks('rp2', {
      error_url: config.RP2_CALLBACK_URL,
    });
    expect(response.status).to.equal(204);
  });

  it('should have set callbacks', async function () {
    const response = await rpApi.getCallbacks('rp2');
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.deep.equal({
      error_url: config.RP2_CALLBACK_URL,
    });
  });
});
