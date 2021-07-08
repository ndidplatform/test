import { expect } from 'chai';

import * as rpApi from '../../../../api/v5/rp';
import { ndidAvailable, proxy1Available } from '../../..';
import { createEventPromise, generateReferenceId } from '../../../../utils';
import { proxy1EventEmitter } from '../../../../callback_server';
import * as config from '../../../../config';

describe('Proxy node create message with non-existent RP node ID test', function () {
  let createMessageParams;

  const rpReferenceId = generateReferenceId();

  const createMessageResultPromise = createEventPromise(); //RP

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

    proxy1EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'create_message_result' &&
        callbackData.reference_id === rpReferenceId
      ) {
        createMessageResultPromise.resolve(callbackData);
      }
    });
  });

  it('Proxy node should create a message with non-existent RP node ID unsuccessfully', async function () {
    this.timeout(15000);
    if (!config.USE_EXTERNAL_CRYPTO_SERVICE) {
      const response = await rpApi.createMessage('proxy1', createMessageParams);
      // const responseBody = await response.json();
      expect(response.status).to.equal(202);

      const createMessageResult = await createMessageResultPromise.promise;
      expect(createMessageResult.success).to.equal(false);
      expect(createMessageResult.error.code).to.equal(10034);
    } else {
      const response = await rpApi.createMessage('proxy1', createMessageParams);
      // const responseBody = await response.json();
      expect(response.status).to.equal(202);

      const createMessageResult = await createMessageResultPromise.promise;
      expect(createMessageResult.success).to.equal(false);
      expect(createMessageResult.error.code).to.equal(25042);
    }
  });

  after(function () {
    proxy1EventEmitter.removeAllListeners('callback');
  });
});
