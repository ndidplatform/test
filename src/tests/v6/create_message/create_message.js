import { expect } from 'chai';
import * as rpApi from '../../../api/v6/rp';
import * as commonApi from '../../../api/v6/common';
import {
  generateReferenceId,
  createEventPromise,
} from '../../../utils';
import {
  rpEventEmitter,
} from '../../../callback_server';
import * as config from '../../../config';

describe('Create message tests', function () {

  describe('RP create message test', function () {
    const createMessageResultPromise = createEventPromise();

    const rpReferenceId = generateReferenceId();

    let messageId;

    let createMessageParams;

    before(function () {
      createMessageParams = {
        reference_id: rpReferenceId,
        callback_url: config.RP_CALLBACK_URL,
        message: 'Test message',
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
    });

    it('RP should create a message successfully', async function () {
      this.timeout(10000);

      const response = await rpApi.createMessage('rp1', createMessageParams);
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.message_id).to.be.a('string').that.is.not.empty;

      messageId = responseBody.message_id;

      const createMessageResult = await createMessageResultPromise.promise;
      expect(createMessageResult.success).to.equal(true);
      expect(createMessageResult.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = createMessageResult.creation_block_height.split(
        ':',
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);

      const responseMessage = await commonApi.getMessage('rp1', { messageId });
      const responseBodyMessage = await responseMessage.json();
      expect(responseBodyMessage.message_id).to.be.a('string').that.is.not.empty;
      expect(responseBodyMessage.message_id).to.equal(messageId);
      expect(responseBodyMessage.message).to.be.a('string').that.is.not.empty;
      expect(responseBodyMessage.message).to.equal(createMessageParams.message);
      expect(responseBodyMessage.purpose).to.be.a('string').that.is.not.empty;
      expect(responseBodyMessage.purpose).to.equal(createMessageParams.purpose);
    });

    after(function () {
      rpEventEmitter.removeAllListeners('callback');
    });
  });

  describe('RP create message test with hash_message = true', function () {
    const createMessageResultPromise = createEventPromise();

    const rpReferenceId = generateReferenceId();

    let messageId;

    let createMessageParams;

    before(function () {
      createMessageParams = {
        reference_id: rpReferenceId,
        callback_url: config.RP_CALLBACK_URL,
        message: 'Test message',
        purpose: 'E2E test',
        hash_message: true,
      };

      rpEventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'create_message_result' &&
          callbackData.reference_id === rpReferenceId
        ) {
          createMessageResultPromise.resolve(callbackData);
        }
      });
    });

    it('RP should create a message successfully', async function () {
      this.timeout(10000);

      const response = await rpApi.createMessage('rp1', createMessageParams);
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.message_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

      messageId = responseBody.message_id;

      const createMessageResult = await createMessageResultPromise.promise;
      expect(createMessageResult.success).to.equal(true);
      expect(createMessageResult.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = createMessageResult.creation_block_height.split(
        ':',
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);

      const responseMessage = await commonApi.getMessage('rp1', { messageId });
      const responseBodyMessage = await responseMessage.json();
      expect(responseBodyMessage.message_id).to.be.a('string').that.is.not.empty;
      expect(responseBodyMessage.message_id).to.equal(messageId);
      expect(responseBodyMessage.message).to.be.a('string').that.is.not.empty;
      expect(responseBodyMessage.message).to.not.equal(createMessageParams.message);
      expect(responseBodyMessage.purpose).to.be.a('string').that.is.not.empty;
      expect(responseBodyMessage.purpose).to.equal(createMessageParams.purpose);
    });

    after(function () {
      rpEventEmitter.removeAllListeners('callback');
    });
  });
});
