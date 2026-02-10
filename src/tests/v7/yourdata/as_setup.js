import { expect } from 'chai';

import { as1Available } from '../../';
import * as yourDataAsApi from '../../../api/v7/yourdata/as';
import * as config from '../../../config';

describe('AS setup', function() {
  before(async function() {
    if (!as1Available) {
      this.skip();
    }
  });

  it('should set callbacks successfully', async function() {
    const response = await yourDataAsApi.setCallbacks('as1', {
      incoming_request_status_update_url: config.AS1_CALLBACK_URL,
    });
    expect(response.status).to.equal(204);
  });

  it('should have set callbacks', async function() {
    const response = await yourDataAsApi.getCallbacks('as1');
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.deep.equal({
      incoming_request_status_update_url: config.AS1_CALLBACK_URL,
    });
  });
});
