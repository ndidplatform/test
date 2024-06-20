import { expect } from 'chai';

import * as rpApi from '../../../api/v6/rp';
import { rpEventEmitter } from '../../../callback_server';
import { createEventPromise, generateReferenceId } from '../../../utils';
import { randomThaiIdNumber } from '../../../utils/thai_id';
import * as config from '../../../config';

describe('Thai ID validation', function () {
  describe('Valid Thai ID (mode 1)', function () {
    const namespace = 'citizen_id';
    const identifier = randomThaiIdNumber();

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

    it('RP should create a request with valid Thai ID (identifier) successfully', async function () {
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

  describe('Invalid Thai ID (mode 1)', function () {
    const namespace = 'citizen_id';
    const identifier = '3712644096692'; // invalid

    const rpReferenceId = generateReferenceId();

    // before(function () {});

    it('RP should not be able to create a request with invalid Thai ID (identifier)', async function () {
      this.timeout(10000);
      const response = await rpApi.createRequest('rp1', {
        reference_id: rpReferenceId,
        callback_url: config.RP_CALLBACK_URL,
        mode: 1,
        namespace,
        identifier,
        idp_id_list: ['idp1'],
        data_request_list: [],
        request_message: 'Test Thai ID validation (invalid)',
        min_ial: 1.1,
        min_aal: 1,
        min_idp: 1,
        request_timeout: 86400, // seconds
        bypass_identity_check: false,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(400);
      expect(responseBody.error.code).to.equal(20096);
    });

    // after(function () {});
  });

  //

  describe('Valid Thai ID (mode 2)', function () {
    const namespace = 'citizen_id';
    const identifier = randomThaiIdNumber();

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

    it('RP should create a request with valid Thai ID (identifier) successfully', async function () {
      this.timeout(10000);
      const response = await rpApi.createRequest('rp1', {
        reference_id: rpReferenceId,
        callback_url: config.RP_CALLBACK_URL,
        mode: 2,
        namespace,
        identifier,
        idp_id_list: ['idp1', 'idp2'],
        data_request_list: [],
        request_message: 'Test Thai ID validation (valid)',
        min_ial: 1.1,
        min_aal: 1,
        min_idp: 1,
        request_timeout: 86400, // seconds
        bypass_identity_check: true,
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

  describe('Invalid Thai ID (mode 2)', function () {
    const namespace = 'citizen_id';
    const identifier = '3712644096692'; // invalid

    const rpReferenceId = generateReferenceId();

    // before(function () {});

    it('RP should not be able to create a request with invalid Thai ID (identifier)', async function () {
      this.timeout(10000);
      const response = await rpApi.createRequest('rp1', {
        reference_id: rpReferenceId,
        callback_url: config.RP_CALLBACK_URL,
        mode: 2,
        namespace,
        identifier,
        idp_id_list: ['idp1', 'idp2'],
        data_request_list: [],
        request_message: 'Test Thai ID validation (invalid)',
        min_ial: 1.1,
        min_aal: 1,
        min_idp: 1,
        request_timeout: 86400, // seconds
        bypass_identity_check: true,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(400);
      expect(responseBody.error.code).to.equal(20096);
    });

    // after(function () {});
  });
});
