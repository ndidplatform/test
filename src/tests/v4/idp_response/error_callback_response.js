import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import * as rpApi from '../../../api/v4/rp';
import * as idpApi from '../../../api/v4/idp';
import * as ndidApi from '../../../api/v4/ndid';
import * as commonApi from '../../../api/v4/common';
import { rpEventEmitter, idp1EventEmitter } from '../../../callback_server';
import {
  createEventPromise,
  generateReferenceId,
  hashRequestMessageForConsent,
  wait,
} from '../../../utils';
import { ndidAvailable } from '../..';
import * as config from '../../../config';

describe('IdP error callback response tests', function() {
  describe("IdP response ial is greater than IdP node's max_ial (mode 1)", function() {
    let namespace = 'citizen_id';
    let identifier = uuidv4();

    const rpReferenceId = generateReferenceId();
    const idpReferenceId = generateReferenceId();

    const incomingRequestPromise = createEventPromise();
    const responseResultPromise = createEventPromise();
    const createRequestResultPromise = createEventPromise(); // RP

    let createRequestParams;

    let requestId;
    let requestMessageHash;
    let requestMessageSalt;

    before(async function() {
      this.timeout(30000);

      if (!ndidAvailable) {
        this.test.parent.pending = true;
        this.skip();
      }

      rpEventEmitter.on('callback', function(callbackData) {
        if (
          callbackData.type === 'create_request_result' &&
          callbackData.request_id === requestId
        ) {
          createRequestResultPromise.resolve(callbackData);
        }
      });

      idp1EventEmitter.on('callback', function(callbackData) {
        if (
          callbackData.type === 'incoming_request' &&
          callbackData.request_id === requestId
        ) {
          incomingRequestPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'response_result' &&
          callbackData.request_id === requestId
        ) {
          responseResultPromise.resolve(callbackData);
        }
      });
    });

    it("NDID should update IDP's max ial (2.3) successfully", async function() {
      this.timeout(10000);
      const response = await ndidApi.updateNode('ndid1', {
        node_id: 'idp1',
        max_ial: 2.3,
      });
      expect(response.status).to.equal(204);
      await wait(3000);
    });

    it("IDP's max ial should be updated successfully", async function() {
      this.timeout(10000);
      const response = await commonApi.getNodeInfo('idp1');
      const responseBody = await response.json();
      expect(responseBody.max_ial).to.equal(2.3);
      expect(responseBody.role).to.equal('IdP');
      expect(responseBody.public_key).to.be.a('string').that.is.not.empty;
    });

    it('RP should create a request successfully', async function() {
      this.timeout(10000);

      createRequestParams = {
        reference_id: rpReferenceId,
        callback_url: config.RP_CALLBACK_URL,
        mode: 1,
        namespace,
        identifier,
        idp_id_list: ['idp1'],
        data_request_list: [
          {
            service_id: 'bank_statement',
            as_id_list: ['as1'],
            min_as: 1,
            request_params: JSON.stringify({
              format: 'pdf',
            }),
          },
        ],
        request_message:
          'Test request message (IdP error callback response) (mode 3)',
        min_ial: 2.3,
        min_aal: 3,
        min_idp: 1,
        request_timeout: 86400,
      };

      const response = await rpApi.createRequest('rp1', createRequestParams);
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

      requestId = responseBody.request_id;

      const createRequestResult = await createRequestResultPromise.promise;
      expect(createRequestResult.success).to.equal(true);
      expect(createRequestResult.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = createRequestResult.creation_block_height.split(
        ':'
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('IdP should receive incoming request callback', async function() {
      this.timeout(15000);
      const incomingRequest = await incomingRequestPromise.promise;

      const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
        dataRequest => {
          const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
          return {
            ...dataRequestWithoutParams,
          };
        }
      );

      expect(incomingRequest).to.deep.include({
        mode: createRequestParams.mode,
        request_id: requestId,
        namespace: createRequestParams.namespace,
        identifier: createRequestParams.identifier,
        request_message: createRequestParams.request_message,
        request_message_hash: hashRequestMessageForConsent(
          createRequestParams.request_message,
          incomingRequest.initial_salt,
          requestId
        ),
        requester_node_id: 'rp1',
        min_ial: createRequestParams.min_ial,
        min_aal: createRequestParams.min_aal,
        data_request_list: dataRequestListWithoutParams,
        request_timeout: createRequestParams.request_timeout,
      });
      expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
        .empty;
      expect(incomingRequest.creation_time).to.be.a('number');
      expect(incomingRequest.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
        ':'
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);

      requestMessageSalt = incomingRequest.request_message_salt;
      requestMessageHash = incomingRequest.request_message_hash;
    });

    it("IdP should get an error when create response (accept) with ial (3) is greater than IdP noded's max_ial", async function() {
      this.timeout(15000);
      const response = await idpApi.createResponse('idp1', {
        reference_id: idpReferenceId,
        callback_url: config.IDP1_CALLBACK_URL,
        request_id: requestId,
        namespace: createRequestParams.namespace,
        identifier: createRequestParams.identifier,
        ial: 3,
        aal: 3,
        status: 'accept',
        signature: 'Some-Signature-For-Mode-1',
      });
      expect(response.status).to.equal(202);

      const responseResult = await responseResultPromise.promise;
      expect(responseResult).to.deep.include({
        reference_id: idpReferenceId,
        request_id: requestId,
        success: false,
      });
      expect(responseResult.error.code).to.equal(25010);
    });

    after(async function() {
      this.timeout(10000);
      await Promise.all([
        ndidApi.updateNode('ndid1', {
          node_id: 'idp1',
          max_ial: 3,
        }),
        rpApi.closeRequest('rp1', {
          reference_id: uuidv4(),
          callback_url: config.RP_CALLBACK_URL,
          request_id: requestId,
        }),
      ]);
      idp1EventEmitter.removeAllListeners('callback');
      rpEventEmitter.removeAllListeners('callback');
      await wait(3000);
    });
  });

  describe("IdP response aal is greater than IdP node's max_aal (mode 1)", function() {
    let namespace = 'citizen_id';
    let identifier = uuidv4();

    const rpReferenceId = generateReferenceId();
    const idpReferenceId = generateReferenceId();

    const incomingRequestPromise = createEventPromise();
    const responseResultPromise = createEventPromise();
    const createRequestResultPromise = createEventPromise(); // RP

    let createRequestParams;

    let requestId;
    let requestMessageHash;
    let requestMessageSalt;

    before(async function() {
      this.timeout(30000);

      if (!ndidAvailable) {
        this.test.parent.pending = true;
        this.skip();
      }

      rpEventEmitter.on('callback', function(callbackData) {
        if (
          callbackData.type === 'create_request_result' &&
          callbackData.request_id === requestId
        ) {
          createRequestResultPromise.resolve(callbackData);
        }
      });

      idp1EventEmitter.on('callback', function(callbackData) {
        if (
          callbackData.type === 'incoming_request' &&
          callbackData.request_id === requestId
        ) {
          incomingRequestPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'response_result' &&
          callbackData.request_id === requestId
        ) {
          responseResultPromise.resolve(callbackData);
        }
      });
    });

    it("NDID should update IDP's max aal (2.2) successfully", async function() {
      this.timeout(10000);
      const response = await ndidApi.updateNode('ndid1', {
        node_id: 'idp1',
        max_aal: 2.2,
      });
      expect(response.status).to.equal(204);
      await wait(3000);
    });

    it("IDP's max aal should be updated successfully", async function() {
      this.timeout(10000);
      const response = await commonApi.getNodeInfo('idp1');
      const responseBody = await response.json();
      expect(responseBody.max_aal).to.equal(2.2);
      expect(responseBody.role).to.equal('IdP');
      expect(responseBody.public_key).to.be.a('string').that.is.not.empty;
    });

    it('RP should create a request successfully', async function() {
      this.timeout(10000);

      createRequestParams = {
        reference_id: rpReferenceId,
        callback_url: config.RP_CALLBACK_URL,
        mode: 1,
        namespace,
        identifier,
        idp_id_list: ['idp1'],
        data_request_list: [
          {
            service_id: 'bank_statement',
            as_id_list: ['as1'],
            min_as: 1,
            request_params: JSON.stringify({
              format: 'pdf',
            }),
          },
        ],
        request_message:
          'Test request message (IdP error callback response) (mode 3)',
        min_ial: 2.3,
        min_aal: 2.2,
        min_idp: 1,
        request_timeout: 86400,
      };

      const response = await rpApi.createRequest('rp1', createRequestParams);
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

      requestId = responseBody.request_id;

      const createRequestResult = await createRequestResultPromise.promise;
      expect(createRequestResult.success).to.equal(true);
      expect(createRequestResult.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = createRequestResult.creation_block_height.split(
        ':'
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('IdP should receive incoming request callback', async function() {
      this.timeout(15000);
      const incomingRequest = await incomingRequestPromise.promise;

      const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
        dataRequest => {
          const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
          return {
            ...dataRequestWithoutParams,
          };
        }
      );

      expect(incomingRequest).to.deep.include({
        mode: createRequestParams.mode,
        request_id: requestId,
        namespace: createRequestParams.namespace,
        identifier: createRequestParams.identifier,
        request_message: createRequestParams.request_message,
        request_message_hash: hashRequestMessageForConsent(
          createRequestParams.request_message,
          incomingRequest.initial_salt,
          requestId
        ),
        requester_node_id: 'rp1',
        min_ial: createRequestParams.min_ial,
        min_aal: createRequestParams.min_aal,
        data_request_list: dataRequestListWithoutParams,
        request_timeout: createRequestParams.request_timeout,
      });
      expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
        .empty;
      expect(incomingRequest.creation_time).to.be.a('number');
      expect(incomingRequest.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
        ':'
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);

      requestMessageSalt = incomingRequest.request_message_salt;
      requestMessageHash = incomingRequest.request_message_hash;
    });

    it("IdP should get an error when create response (accept) with aal (3) is greater than IdP noded's max_ial", async function() {
      this.timeout(15000);
      const response = await idpApi.createResponse('idp1', {
        reference_id: idpReferenceId,
        callback_url: config.IDP1_CALLBACK_URL,
        request_id: requestId,
        namespace: createRequestParams.namespace,
        identifier: createRequestParams.identifier,
        ial: 2.3,
        aal: 3,
        status: 'accept',
        signature: 'Some-Signature-For-Mode-1',
      });
      expect(response.status).to.equal(202);

      const responseResult = await responseResultPromise.promise;
      expect(responseResult).to.deep.include({
        reference_id: idpReferenceId,
        request_id: requestId,
        success: false,
      });
      expect(responseResult.error.code).to.equal(25009);
    });

    after(async function() {
      this.timeout(10000);
      await Promise.all([
        ndidApi.updateNode('ndid1', {
          node_id: 'idp1',
          max_aal: 3,
        }),
        rpApi.closeRequest('rp1', {
          reference_id: uuidv4(),
          callback_url: config.RP_CALLBACK_URL,
          request_id: requestId,
        }),
      ]);
      idp1EventEmitter.removeAllListeners('callback');
      rpEventEmitter.removeAllListeners('callback');
      await wait(3000);
    });
  });
});
