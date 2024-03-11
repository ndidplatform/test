import { expect } from 'chai';

import * as rpApi from '../../../api/v5/rp';
import { rpEventEmitter } from '../../../callback_server';
import { createEventPromise, generateReferenceId } from '../../../utils';
import { randomThaiIdNumber } from '../../../utils/thai_id';
import * as config from '../../../config';

describe('Thai ID validation (no validation)', function () {
  describe('Invalid Thai ID', function () {
    const namespace = 'citizen_id';
    const identifier = randomThaiIdNumber() + '0';

    const rpReferenceId = generateReferenceId();

    const createRequestResultPromise = createEventPromise(); // RP

    let requestId;

    before(async function () {
      this.timeout(10000);

      rpEventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'create_request_result' &&
          callbackData.reference_id === rpReferenceId
        ) {
          createRequestResultPromise.resolve(callbackData);
        }
      });
    });

    it('RP should create a request with invalid Thai ID (identifier) successfully', async function () {
      this.timeout(10000);
      const response = await rpApi.createRequest('rp1', {
        reference_id: rpReferenceId,
        callback_url: config.RP_CALLBACK_URL,
        mode: 1,
        namespace,
        identifier,
        idp_id_list: ['idp1'],
        data_request_list: [],
        request_message: 'Test Thai ID validation (valid)',
        min_ial: 1.1,
        min_aal: 1,
        min_idp: 1,
        request_timeout: 86400, // seconds
        bypass_identity_check: false,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

      requestId = responseBody.request_id;

      const createRequestResult = await createRequestResultPromise.promise;
      expect(createRequestResult.success).to.equal(true);
      expect(createRequestResult.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight =
        createRequestResult.creation_block_height.split(':');
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    after(function () {
      rpEventEmitter.removeAllListeners('callback');
    });
  });
});
