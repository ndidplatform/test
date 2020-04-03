import crypto from 'crypto';
import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import { as1Available, idp2Available } from '../..';
import * as rpApi from '../../../api/v5/rp';
import * as idpApi from '../../../api/v5/idp';
import * as identityApi from '../../../api/v5/identity';
import * as commonApi from '../../../api/v5/common';
import {
  idp1EventEmitter,
  rpEventEmitter,
  as1EventEmitter,
  idp2EventEmitter,
} from '../../../callback_server';
import * as db from '../../../db';
import {
  createEventPromise,
  generateReferenceId,
  hash,
  wait,
  createResponseSignature,
} from '../../../utils';
import * as config from '../../../config';
import { getAndVerifyRequestMessagePaddedHashTest } from '../_fragments/request_flow_fragments/idp';
describe('Reject IdP add accessor (mode 3) test', function() {
  let accessorId;
  let namespace;
  let identifier;
  let referenceGroupCode;

  describe('IdP (idp1) add accessor method (providing custom request_message and without providing accessor_id) and 1st IdP (idp1) reject consent test', function() {
    const addAccessorRequestMessage =
      'Add accessor consent request custom message ข้อความสำหรับขอเพิ่ม accessor บนระบบ';
    const keypair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const accessorPrivateKey = keypair.privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    });
    const accessorPublicKey = keypair.publicKey.export({
      type: 'spki',
      format: 'pem',
    });

    const referenceId = generateReferenceId();
    const idp1ReferenceId = generateReferenceId();

    const addAccessorRequestResultPromise = createEventPromise();
    const addAccessorResultPromise = createEventPromise();
    const incomingRequestPromise = createEventPromise();
    const idp2IncomingRequestPromise = createEventPromise();
    const responseResultPromise = createEventPromise();
    const accessorEncryptPromise = createEventPromise();

    let requestId;
    let requestMessageHash;
    let responseAccessorId;
    let identityForResponse;
    let requestMessagePaddedHash;

    before(function() {
      if (db.idp1Identities[0] == null) {
        throw new Error('No created identity to use');
      }

      const identity = db.idp1Identities.find(
        (identity) => identity.mode === 3
      );

      namespace = identity.namespace;
      identifier = identity.identifier;
      referenceGroupCode = identity.referenceGroupCode;

      idp1EventEmitter.on('callback', function(callbackData) {
        if (
          callbackData.type === 'incoming_request' &&
          callbackData.request_id === requestId
        ) {
          incomingRequestPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'response_result' &&
          callbackData.reference_id === idp1ReferenceId
        ) {
          responseResultPromise.resolve(callbackData);
        }
        if (
          callbackData.type === 'add_accessor_request_result' &&
          callbackData.reference_id === referenceId
        ) {
          addAccessorRequestResultPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'add_accessor_result' &&
          callbackData.reference_id === referenceId
        ) {
          addAccessorResultPromise.resolve(callbackData);
        }
      });

      idp1EventEmitter.on('accessor_encrypt_callback', function(callbackData) {
        if (callbackData.request_id === requestId) {
          accessorEncryptPromise.resolve(callbackData);
        }
      });

      idp2EventEmitter.on('callback', function(callbackData) {
        if (
          callbackData.type === 'incoming_request' &&
          callbackData.request_id === requestId
        ) {
          idp2IncomingRequestPromise.resolve(callbackData);
        }
      });
    });

    it('Idp (idp1) should add accessor successfully', async function() {
      this.timeout(10000);
      const response = await identityApi.addAccessor('idp1', {
        namespace: namespace,
        identifier: identifier,
        reference_id: referenceId,
        callback_url: config.IDP1_CALLBACK_URL,
        accessor_type: 'RSA',
        accessor_public_key: accessorPublicKey,
        //accessor_id: accessorId,
        request_message: addAccessorRequestMessage,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;

      requestId = responseBody.request_id;
      accessorId = responseBody.accessor_id;

      const addAccessorRequestResult = await addAccessorRequestResultPromise.promise;
      expect(addAccessorRequestResult).to.deep.include({
        reference_id: referenceId,
        request_id: requestId,
        accessor_id: accessorId,
        success: true,
      });
      expect(addAccessorRequestResult.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = addAccessorRequestResult.creation_block_height.split(
        ':'
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);

      accessorId = addAccessorRequestResult.accessor_id;
    });

    it('IdP (idp1) should get request_id by reference_id while request is unfinished (not closed or timed out) successfully', async function() {
      this.timeout(10000);
      const response = await identityApi.getRequestIdByReferenceId('idp1', {
        reference_id: referenceId,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.deep.equal({
        request_id: requestId,
        accessor_id: accessorId,
      });
    });

    it('IdP (idp1) should receive add accessor request', async function() {
      this.timeout(15000);
      const incomingRequest = await incomingRequestPromise.promise;
      expect(incomingRequest).to.deep.include({
        mode: 3,
        request_id: requestId,
        reference_group_code: referenceGroupCode,
        request_message: addAccessorRequestMessage,
        request_message_hash: hash(
          addAccessorRequestMessage + incomingRequest.request_message_salt
        ),
        requester_node_id: 'idp1',
        min_ial: 1.1,
        min_aal: 1,
        data_request_list: [],
      });
      expect(incomingRequest.creation_time).to.be.a('number');
      expect(incomingRequest.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
        ':'
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
      expect(incomingRequest.request_timeout).to.be.a('number');

      requestMessageHash = incomingRequest.request_message_hash;
    });

    it('IdP (idp2) should receive add accessor request', async function() {
      this.timeout(15000);
      if (!idp2Available) this.skip();
      const incomingRequest = await idp2IncomingRequestPromise.promise;
      expect(incomingRequest).to.deep.include({
        mode: 3,
        request_id: requestId,
        reference_group_code: referenceGroupCode,
        request_message: addAccessorRequestMessage,
        request_message_hash: hash(
          addAccessorRequestMessage + incomingRequest.request_message_salt
        ),
        requester_node_id: 'idp1',
        min_ial: 1.1,
        min_aal: 1,
        data_request_list: [],
      });
      expect(incomingRequest.creation_time).to.be.a('number');
      expect(incomingRequest.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
        ':'
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
      expect(incomingRequest.request_timeout).to.be.a('number');
    });

    it('IdP should get request_message_padded_hash successfully', async function() {
      this.timeout(15000);
      identityForResponse = db.idp1Identities.find(
        (identity) =>
          identity.namespace === namespace && identity.identifier === identifier
      );

      responseAccessorId = identityForResponse.accessors[0].accessorId;
      let accessorPublicKey =
        identityForResponse.accessors[0].accessorPublicKey;

      const testResult = await getAndVerifyRequestMessagePaddedHashTest({
        callApiAtNodeId: 'idp1',
        idpNodeId: 'idp1',
        requestId,
        incomingRequestPromise,
        accessorPublicKey,
        accessorId: responseAccessorId,
      });
      requestMessagePaddedHash = testResult.verifyRequestMessagePaddedHash;
    });

    it('IdP (idp1) should create response (reject) successfully', async function() {
      this.timeout(10000);

      let accessorPrivateKey =
        identityForResponse.accessors[0].accessorPrivateKey;

      const signature = createResponseSignature(
        accessorPrivateKey,
        requestMessagePaddedHash
      );

      const response = await idpApi.createResponse('idp1', {
        reference_id: idp1ReferenceId,
        callback_url: config.IDP1_CALLBACK_URL,
        request_id: requestId,
        ial: 2.3,
        aal: 3,
        status: 'reject',
        accessor_id: responseAccessorId,
        signature,
      });
      expect(response.status).to.equal(202);
    });

    // it('IdP should receive accessor encrypt callback with correct data', async function() {
    //   this.timeout(15000);

    //   const accessorEncryptParams = await accessorEncryptPromise.promise;
    //   expect(accessorEncryptParams).to.deep.include({
    //     node_id: 'idp1',
    //     type: 'accessor_encrypt',
    //     accessor_id: responseAccessorId,
    //     key_type: 'RSA',
    //     padding: 'none',
    //     reference_id: idp1ReferenceId,
    //     request_id: requestId,
    //   });

    //   expect(accessorEncryptParams.request_message_padded_hash).to.be.a(
    //     'string',
    //   ).that.is.not.empty;
    // });

    it('IdP shoud receive callback create response result with success = true', async function() {
      this.timeout(15000);
      const responseResult = await responseResultPromise.promise;
      expect(responseResult).to.deep.include({
        node_id: 'idp1',
        type: 'response_result',
        reference_id: idp1ReferenceId,
        request_id: requestId,
        success: true,
      });
    });

    it('IdP (idp1) should receive add accessor result with success false', async function() {
      this.timeout(10000);
      const addAccessorResult = await addAccessorResultPromise.promise;
      expect(addAccessorResult).to.deep.include({
        reference_id: referenceId,
        request_id: requestId,
        success: false,
      });
      expect(addAccessorResult.error.code).to.equal(10016);
    });

    it('Special request status for add accessor method should be rejected and closed', async function() {
      this.timeout(10000);
      //wait for api close request
      await wait(3000);
      const response = await commonApi.getRequest('idp1', { requestId });
      const responseBody = await response.json();
      expect(responseBody).to.deep.include({
        request_id: requestId,
        min_idp: 1,
        min_aal: 1,
        min_ial: 1.1,
        request_timeout: 86400,
        data_request_list: [],
        closed: true,
        timed_out: false,
        mode: 3,
        status: 'rejected',
        requester_node_id: 'idp1',
      });
      expect(responseBody.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = responseBody.creation_block_height.split(
        ':'
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
      await wait(3000); //wait for api clean up reference
    });

    it('1st IdP should get response status code 404 when get request_id by reference_id after request is finished (closed)', async function() {
      this.timeout(10000);
      const response = await identityApi.getRequestIdByReferenceId('idp1', {
        reference_id: referenceId,
      });
      expect(response.status).to.equal(404);
    });

    after(function() {
      idp1EventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
      idp2EventEmitter.removeAllListeners('callback');
    });
  });

  describe('IdP (idp1) response with new accessor id was rejected test', function() {
    const rpReferenceId = generateReferenceId();
    const idpReferenceId = generateReferenceId();
    const asReferenceId = generateReferenceId();

    const createRequestResultPromise = createEventPromise(); // RP
    const incomingRequestPromise = createEventPromise(); // IDP
    const responseResultPromise = createEventPromise(); // IDP
    const requestStatusConfirmedPromise = createEventPromise(); // RP
    const dataRequestReceivedPromise = createEventPromise(); // AS
    const sendDataResultPromise = createEventPromise(); // AS
    const requestStatusSignedDataPromise = createEventPromise(); // RP
    const requestStatusCompletedPromise = createEventPromise(); // RP
    const requestClosedPromise = createEventPromise(); // RP

    let createRequestParams;
    const data = JSON.stringify({
      test: 'test',
      withEscapedChar: 'test|fff||ss\\|NN\\\\|',
      arr: [1, 2, 3],
    });

    let requestId;
    let requestMessageSalt;
    let requestMessageHash;

    before(function() {
      if (!as1Available) {
        this.test.parent.pending = true;
        this.skip();
      }
      if (db.idp1Identities[0] == null) {
        throw new Error('No created identity to use');
      }

      createRequestParams = {
        reference_id: rpReferenceId,
        callback_url: config.RP_CALLBACK_URL,
        mode: 3,
        namespace,
        identifier,
        idp_id_list: [],
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
          'Test request message (idp1 response with new accessor id) (mode 3)',
        min_ial: 1.1,
        min_aal: 1,
        min_idp: 1,
        request_timeout: 86400,
        bypass_identity_check: false,
      };

      rpEventEmitter.on('callback', function(callbackData) {
        if (
          callbackData.type === 'create_request_result' &&
          callbackData.reference_id === rpReferenceId
        ) {
          createRequestResultPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'request_status' &&
          callbackData.request_id === requestId
        ) {
          if (callbackData.status === 'confirmed') {
            if (callbackData.service_list[0].signed_data_count === 1) {
              requestStatusSignedDataPromise.resolve(callbackData);
            } else {
              requestStatusConfirmedPromise.resolve(callbackData);
            }
          } else if (callbackData.status === 'completed') {
            if (callbackData.closed) {
              requestClosedPromise.resolve(callbackData);
            } else {
              requestStatusCompletedPromise.resolve(callbackData);
            }
          }
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
          callbackData.reference_id === idpReferenceId
        ) {
          responseResultPromise.resolve(callbackData);
        }
      });

      as1EventEmitter.on('callback', function(callbackData) {
        if (
          callbackData.type === 'data_request' &&
          callbackData.request_id === requestId
        ) {
          dataRequestReceivedPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'send_data_result' &&
          callbackData.reference_id === asReferenceId
        ) {
          sendDataResultPromise.resolve(callbackData);
        }
      });
    });

    it('RP should create a request successfully', async function() {
      this.timeout(10000);
      const response = await rpApi.createRequest('rp1', createRequestParams);
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

      requestId = responseBody.request_id;

      const createRequestResult = await createRequestResultPromise.promise;
      expect(createRequestResult.success).to.equal(true);
    });

    it('IdP should receive incoming request callback', async function() {
      this.timeout(15000);
      const incomingRequest = await incomingRequestPromise.promise;

      const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
        (dataRequest) => {
          const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
          return {
            ...dataRequestWithoutParams,
          };
        }
      );
      expect(incomingRequest).to.deep.include({
        mode: createRequestParams.mode,
        request_id: requestId,
        reference_group_code: referenceGroupCode,
        request_message: createRequestParams.request_message,
        request_message_hash: hash(
          createRequestParams.request_message +
            incomingRequest.request_message_salt
        ),
        requester_node_id: 'rp1',
        min_ial: createRequestParams.min_ial,
        min_aal: createRequestParams.min_aal,
        data_request_list: dataRequestListWithoutParams,
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

    it('IdP should create response (accept) with new accessor id was rejected unsuccessfully', async function() {
      this.timeout(15000);

      const response = await idpApi.createResponse('idp1', {
        reference_id: idpReferenceId,
        callback_url: config.IDP1_CALLBACK_URL,
        request_id: requestId,
        ial: 2.3,
        aal: 3,
        status: 'accept',
        accessor_id: accessorId,
        signature: 'Test signature',
      });
      expect(response.status).to.equal(400);
      const responseBody = await response.json();
      //expect(responseBody.error.code).to.equal(20011);
      expect(responseBody.error.code).to.equal(20077);
    });

    after(async function() {
      this.timeout(15000);
      await rpApi.closeRequest('rp1', {
        reference_id: uuidv4(),
        callback_url: config.RP_CALLBACK_URL,
        request_id: requestId,
      });
      rpEventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('callback');
      as1EventEmitter.removeAllListeners('callback');
      await wait(2000);
    });
  });
});
