import { expect } from 'chai';

import * as rpApi from '../../../../api/v5/rp';
import { ndidAvailable, proxy1Available } from '../../..';
import {
  generateReferenceId,
} from '../../../../utils';
import * as config from '../../../../config';

describe('Proxy node create message with non-existent RP node ID test', function () {
  let createMessageParams;
  const rpReferenceId = generateReferenceId();

  before(async function () {
    if (!ndidAvailable || !proxy1Available) {
      this.test.parent.pending = true;
      this.skip();
    }

    createMessageParams = {
      node_id: 'NonExistentRPNode',
      reference_id: rpReferenceId,
      callback_url: config.PROXY1_CALLBACK_URL,
      message:
        'Test message (Proxy node should create a message with non-existent RP node ID)',
      purpose: 'E2E test',
      hash_message: false,
    };
  });

  it('Proxy node should create a message with non-existent RP node ID unsuccessfully', async function () {
    this.timeout(15000);
    const response = await rpApi.createMessage('proxy1', createMessageParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(500);
    expect(responseBody.error.code).to.equal(10032);
  });
});
