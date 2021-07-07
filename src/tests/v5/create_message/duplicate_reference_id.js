import { expect } from 'chai';

import * as rpApi from '../../../api/v5/rp';
import { rpEventEmitter } from '../../../callback_server';
import { createEventPromise, generateReferenceId, wait } from '../../../utils';
import * as config from '../../../config';

describe('Create message with duplicate reference id test', function () {

  const rpReferenceId = generateReferenceId();

  const createMessageResultPromise = createEventPromise(); //RP

  let createMessageParams;

  before(async function () {
    this.timeout(10000);

    createMessageParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      message: 'Test message (duplicate reference id)',
      purpose: 'E2E test',
      hash_message: false,
    };

    rpEventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'create_message_result' &&
        callbackData.reference_id === rpReferenceId
      ) {
        createMessageResultPromise.resolve(callbackData);
      }
    });

    await rpApi.createMessage('rp1', createMessageParams);
    await createMessageResultPromise.promise;
    await wait(2000);
  });

  it('RP should create a message with duplicate reference id unsuccessfully', async function () {
    this.timeout(10000);
    const response = await rpApi.createMessage('rp1', createMessageParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20045);
  });

  it('RP should create a message with duplicate reference id unsuccessfully', async function () {
    this.timeout(10000);
    const response = await rpApi.createMessage('rp1', createMessageParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20045);
  });

  after(async function () {
    this.timeout(15000);
    await wait(3000);
    rpEventEmitter.removeAllListeners('callback');
  });
});
