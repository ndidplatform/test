import { expect } from 'chai';
import forge from 'node-forge';
import uuidv4 from 'uuid/v4';

import * as ndidApi from '../../api/v2/ndid';
import * as rpApi from '../../api/v2/rp';
import * as idpApi from '../../api/v2/idp';
import * as asApi from '../../api/v2/as';
import * as commonApi from '../../api/v2/common';
import * as db from '../../db';
import { ndidAvailable, idp2Available } from '..';
import {
  createEventPromise,
  generateReferenceId,
  hash,
  wait,
  hashRequestMessageForConsent,
  createResponseSignature,
} from '../../utils';
import {
  as1EventEmitter,
  idp1EventEmitter,
  rpEventEmitter,
  idp2EventEmitter,
} from '../../callback_server';
import * as config from '../../config';

describe('NDID disable first IdP and following IdP create identity test', function() {
  const namespace = 'citizen_id';
  const identifier = uuidv4();
  const keypair = forge.pki.rsa.generateKeyPair(2048);
  const accessorPrivateKey = forge.pki.privateKeyToPem(keypair.privateKey);
  const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);

  const referenceId = generateReferenceId();
  const referenceIdIdp2 = generateReferenceId();
  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const asReferenceId = generateReferenceId();

  const createIdentityRequestResultPromise = createEventPromise();
  const accessorSignPromise = createEventPromise();
  const createIdentityResultPromise = createEventPromise();

  const createIdentityRequestResultIdp2Promise = createEventPromise();
  const accessorSignIdp2Promise = createEventPromise();
  const createIdentityResultIdp2Promise = createEventPromise();

  const createRequestResultPromise = createEventPromise(); // RP
  const requestStatusPendingPromise = createEventPromise(); // RP
  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise(); // IDP
  const requestStatusConfirmedPromise = createEventPromise(); // RP
  const dataRequestReceivedPromise = createEventPromise(); // AS
  const sendDataResultPromise = createEventPromise(); // AS
  const requestStatusSignedDataPromise = createEventPromise(); // RP
  const requestStatusCompletedPromise = createEventPromise(); // RP
  const requestClosedPromise = createEventPromise(); // RP

  const data = JSON.stringify({
    test: 'test',
    withEscapedChar: 'test|fff||ss\\|NN\\\\|',
    arr: [1, 2, 3],
  });

  let requestId;
  let createRequestParams;
  let createIdentityRequestId;
  let accessorId;
  let secret;
  let createIdentityRequestIdIdp2;
  let accessorIdIdp2;
  let secretIdp2;
  let lastStatusUpdateBlockHeight;
  let requestMessageSalt;
  let requestMessageHash;

  db.createIdentityReferences.push({
    referenceId,
    accessorPrivateKey,
  });

  db.createIdentityReferences.push({
    referenceId: referenceIdIdp2,
    accessorPrivateKey,
  });

  before(function() {
    before(async function() {
      if (!ndidAvailable || !idp2Available) {
        this.skip();
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
        request_message: 'Test request message (data request) (mode 3)',
        min_ial: 1.1,
        min_aal: 1,
        min_idp: 1,
        request_timeout: 86400,
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
          if (callbackData.status === 'pending') {
            requestStatusPendingPromise.resolve(callbackData);
          } else if (callbackData.status === 'confirmed') {
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
          callbackData.type === 'create_identity_request_result' &&
          callbackData.reference_id === referenceId
        ) {
          createIdentityRequestResultPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'create_identity_result' &&
          callbackData.reference_id === referenceId
        ) {
          createIdentityResultPromise.resolve(callbackData);
        }
      });

      idp1EventEmitter.on('accessor_sign_callback', function(callbackData) {
        if (callbackData.reference_id === referenceId) {
          accessorSignPromise.resolve(callbackData);
        }
      });

      idp2EventEmitter.on('callback', function(callbackData) {
        if (
          callbackData.type === 'create_identity_request_result' &&
          callbackData.reference_id === referenceIdIdp2
        ) {
          createIdentityRequestResultIdp2Promise.resolve(callbackData);
        } else if (
          callbackData.type === 'create_identity_result' &&
          callbackData.reference_id === referenceIdIdp2
        ) {
          createIdentityResultIdp2Promise.resolve(callbackData);
        }
      });

      idp2EventEmitter.on('accessor_sign_callback', function(callbackData) {
        if (callbackData.reference_id === referenceIdIdp2) {
          accessorSignIdp2Promise.resolve(callbackData);
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

    it('IdP (idp1) should create identity request successfully', async function() {
      this.timeout(10000);
      const response = await idpApi.createIdentity('idp1', {
        reference_id: referenceId,
        callback_url: config.IDP1_CALLBACK_URL,
        namespace,
        identifier,
        accessor_type: 'RSA',
        accessor_public_key: accessorPublicKey,
        //accessor_id,
        ial: 2.3,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;

      createIdentityRequestId = responseBody.request_id;
      accessorId = responseBody.accessor_id;

      const createIdentityRequestResult = await createIdentityRequestResultPromise.promise;
      expect(createIdentityRequestResult).to.deep.include({
        reference_id: referenceId,
        request_id: createIdentityRequestId,
        exist: false,
        accessor_id: accessorId,
        success: true,
      });
      expect(createIdentityRequestResult.creation_block_height).to.be.a(
        'string'
      );
      const splittedCreationBlockHeight = createIdentityRequestResult.creation_block_height.split(
        ':'
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('should receive accessor sign callback with correct data', async function() {
      this.timeout(15000);
      const sid = `${namespace}:${identifier}`;
      const sid_hash = hash(sid);

      const accessorSignParams = await accessorSignPromise.promise;
      expect(accessorSignParams).to.deep.equal({
        type: 'accessor_sign',
        node_id: 'idp1',
        reference_id: referenceId,
        accessor_id: accessorId,
        sid,
        sid_hash,
        hash_method: 'SHA256',
        key_type: 'RSA',
        sign_method: 'RSA-SHA256',
        padding: 'PKCS#1v1.5',
      });
    });

    it('Identity should be created successfully', async function() {
      this.timeout(15000);
      const createIdentityResult = await createIdentityResultPromise.promise;
      expect(createIdentityResult).to.deep.include({
        reference_id: referenceId,
        request_id: createIdentityRequestId,
        success: true,
      });
      expect(createIdentityResult.secret).to.be.a('string').that.is.not.empty;

      secret = createIdentityResult.secret;

      const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
        namespace,
        identifier,
      });
      const idpNodes = await response.json();
      const idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
      expect(idpNode).to.exist;

      db.idp1Identities.push({
        namespace,
        identifier,
        accessors: [
          {
            accessorId,
            accessorPrivateKey,
            accessorPublicKey,
            secret,
          },
        ],
      });
    });

    it('Special request status for create identity should be completed and closed', async function() {
      this.timeout(10000);
      //wait for API close request
      await wait(3000);
      const response = await commonApi.getRequest('idp1', {
        createIdentityRequestId,
      });
      const responseBody = await response.json();
      expect(responseBody).to.deep.include({
        request_id: createIdentityRequestId,
        min_idp: 0,
        min_aal: 1,
        min_ial: 1.1,
        request_timeout: 86400,
        data_request_list: [],
        response_list: [],
        closed: true,
        timed_out: false,
        mode: 3,
        status: 'completed',
        requester_node_id: 'idp1',
      });
      expect(responseBody.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = responseBody.creation_block_height.split(
        ':'
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('NDID should disable node IdP (idp1) successfully', async function() {
      this.timeout(10000);

      const response = await ndidApi.disableNode('ndid1', {
        node_id: 'idp1',
      });
      expect(response.status).to.equal(200);
      await wait(5000);
    });

    it('should query IdP node relevant to this namespace/identifier not found', async function() {
      this.timeout(15000);
      const response = await commonApi.getRelevantIdpNodesBySid('rp1', {
        namespace,
        identifier,
      });
      const responseBody = await response.json();
      expect(responseBody).to.be.an('array').that.is.empty;
    });

    it('IdP (idp2) should create identity request for this namespace/identifier sunccessfully', async function() {
      this.timeout(10000);
      const response = await idpApi.createIdentity('idp2', {
        reference_id: referenceIdIdp2,
        callback_url: config.IDP2_CALLBACK_URL,
        namespace,
        identifier,
        accessor_type: 'RSA',
        accessor_public_key: accessorPublicKey,
        //accessor_id,
        ial: 2.3,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;

      createIdentityRequestIdIdp2 = responseBody.request_id;
      accessorIdIdp2 = responseBody.accessor_id;

      const createIdentityRequestIdp2Result = await createIdentityRequestResultIdp2Promise.promise;
      expect(createIdentityRequestIdp2Result).to.deep.include({
        reference_id: referenceIdIdp2,
        request_id: createIdentityRequestIdIdp2,
        exist: false,
        accessor_id: accessorIdIdp2,
        success: true,
      });
      expect(createIdentityRequestIdp2Result.creation_block_height).to.be.a(
        'string'
      );
      const splittedCreationBlockHeight = createIdentityRequestIdp2Result.creation_block_height.split(
        ':'
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('idp2 should receive accessor sign callback with correct data', async function() {
      this.timeout(15000);
      const sid = `${namespace}:${identifier}`;
      const sid_hash = hash(sid);

      const accessorSignIdp2Params = await accessorSignIdp2Promise.promise;
      expect(accessorSignIdp2Params).to.deep.equal({
        type: 'accessor_sign',
        node_id: 'idp2',
        reference_id: referenceIdIdp2,
        accessor_id: accessorIdIdp2,
        sid,
        sid_hash,
        hash_method: 'SHA256',
        key_type: 'RSA',
        sign_method: 'RSA-SHA256',
        padding: 'PKCS#1v1.5',
      });
    });

    it('Identity should be created successfully', async function() {
      this.timeout(15000);
      const createIdentityIdp2Result = await createIdentityResultIdp2Promise.promise;
      expect(createIdentityIdp2Result).to.deep.include({
        reference_id: referenceIdIdp2,
        request_id: createIdentityRequestIdIdp2,
        success: true,
      });
      expect(createIdentityIdp2Result.secret).to.be.a(
        'string'
      ).that.is.not.empty;

      secretIdp2 = createIdentityIdp2Result.secret;

      const response = await commonApi.getRelevantIdpNodesBySid('idp2', {
        namespace,
        identifier,
      });
      const idpNodes = await response.json();
      const idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp2');
      expect(idpNode).to.exist;

      db.idp2Identities.push({
        namespace,
        identifier,
        accessors: [
          {
            accessorIdIdp2,
            accessorPrivateKey,
            accessorPublicKey,
            secretIdp2,
          },
        ],
      });
    });

    it('Special request status for create identity should be completed and closed', async function() {
      this.timeout(10000);
      //wait for API close request
      await wait(3000);
      const response = await commonApi.getRequest('idp2', {
        createIdentityRequestIdIdp2,
      });
      const responseBody = await response.json();
      expect(responseBody).to.deep.include({
        request_id: createIdentityRequestIdIdp2,
        min_idp: 0,
        min_aal: 1,
        min_ial: 1.1,
        request_timeout: 86400,
        data_request_list: [],
        response_list: [],
        closed: true,
        timed_out: false,
        mode: 3,
        status: 'completed',
        requester_node_id: 'idp2',
      });
      expect(responseBody.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = responseBody.creation_block_height.split(
        ':'
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('RP should create a request (mode 3) successfully', async function() {
      this.timeout(10000);

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
      lastStatusUpdateBlockHeight = parseInt(splittedCreationBlockHeight[1]);
    });

    it('RP should receive pending request status', async function() {
      this.timeout(10000);
      const requestStatus = await requestStatusPendingPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: requestId,
        status: 'pending',
        mode: createRequestParams.mode,
        min_idp: createRequestParams.min_idp,
        answered_idp_count: 0,
        closed: false,
        timed_out: false,
        service_list: [
          {
            service_id: createRequestParams.data_request_list[0].service_id,
            min_as: createRequestParams.data_request_list[0].min_as,
            signed_data_count: 0,
            received_data_count: 0,
          },
        ],
        response_valid_list: [],
      });
      expect(requestStatus).to.have.property('block_height');
      expect(requestStatus.block_height).is.a('string');
      const splittedBlockHeight = requestStatus.block_height.split(':');
      expect(splittedBlockHeight).to.have.lengthOf(2);
      expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
      expect(parseInt(splittedBlockHeight[1])).to.equal(
        lastStatusUpdateBlockHeight
      );
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
      expect(incomingRequest.request_message_salt).to.be.a(
        'string'
      ).that.is.not.empty;
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

    it('IdP should create response (accept) successfully', async function() {
      this.timeout(10000);

      const identity = db.idp2Identities.find(
        identity =>
          identity.namespace === namespace && identity.identifier === identifier
      );

      const response = await idpApi.createResponse('idp2', {
        reference_id: idpReferenceId,
        callback_url: config.IDP1_CALLBACK_URL,
        request_id: requestId,
        namespace: createRequestParams.namespace,
        identifier: createRequestParams.identifier,
        ial: 2.3,
        aal: 3,
        status: 'accept',
        signature: createResponseSignature(
          identity.accessors[0].accessorPrivateKey,
          requestMessageHash
        ),
        accessor_id: identity.accessors[0].accessorId,
      });
      expect(response.status).to.equal(202);

      const responseResult = await responseResultPromise.promise;
      expect(responseResult).to.deep.include({
        reference_id: idpReferenceId,
        request_id: requestId,
        success: true,
      });
    });

    it('RP should receive confirmed request status', async function() {
      this.timeout(15000);
      const requestStatus = await requestStatusConfirmedPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: requestId,
        status: 'confirmed',
        mode: createRequestParams.mode,
        min_idp: createRequestParams.min_idp,
        answered_idp_count: 1,
        closed: false,
        timed_out: false,
        service_list: [
          {
            service_id: createRequestParams.data_request_list[0].service_id,
            min_as: createRequestParams.data_request_list[0].min_as,
            signed_data_count: 0,
            received_data_count: 0,
          },
        ],
        response_valid_list: [
          {
            idp_id: 'idp2',
            valid_signature: null,
            valid_proof: null,
            valid_ial: null,
          },
        ],
      });
      expect(requestStatus).to.have.property('block_height');
      expect(requestStatus.block_height).is.a('string');
      const splittedBlockHeight = requestStatus.block_height.split(':');
      expect(splittedBlockHeight).to.have.lengthOf(2);
      expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
      expect(parseInt(splittedBlockHeight[1])).to.be.above(
        lastStatusUpdateBlockHeight
      );
      lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
    });

    it('AS should receive data request', async function() {
      this.timeout(15000);
      const dataRequest = await dataRequestReceivedPromise.promise;
      expect(dataRequest).to.deep.include({
        request_id: requestId,
        mode: createRequestParams.mode,
        namespace,
        identifier,
        service_id: createRequestParams.data_request_list[0].service_id,
        request_params: createRequestParams.data_request_list[0].request_params,
        max_ial: 2.3,
        max_aal: 3,
        requester_node_id: 'rp1',
        request_timeout: createRequestParams.request_timeout,
      });
      expect(dataRequest.response_signature_list).to.have.lengthOf(1);
      expect(dataRequest.response_signature_list[0]).to.be.a(
        'string'
      ).that.is.not.empty;
      expect(dataRequest.creation_time).to.be.a('number');
      expect(dataRequest.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = dataRequest.creation_block_height.split(
        ':'
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('AS should send data successfully', async function() {
      this.timeout(15000);
      const response = await asApi.sendData('as1', {
        requestId,
        serviceId: createRequestParams.data_request_list[0].service_id,
        reference_id: asReferenceId,
        callback_url: config.AS1_CALLBACK_URL,
        data,
      });
      expect(response.status).to.equal(202);

      const sendDataResult = await sendDataResultPromise.promise;
      expect(sendDataResult).to.deep.include({
        reference_id: asReferenceId,
        success: true,
      });
    });

    it('RP should receive request status with signed data count = 1', async function() {
      this.timeout(15000);
      const requestStatus = await requestStatusSignedDataPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: requestId,
        status: 'confirmed',
        mode: createRequestParams.mode,
        min_idp: createRequestParams.min_idp,
        answered_idp_count: 1,
        closed: false,
        timed_out: false,
        service_list: [
          {
            service_id: createRequestParams.data_request_list[0].service_id,
            min_as: createRequestParams.data_request_list[0].min_as,
            signed_data_count: 1,
            received_data_count: 0,
          },
        ],
        response_valid_list: [
          {
            idp_id: 'idp1',
            valid_signature: null,
            valid_proof: null,
            valid_ial: null,
          },
        ],
      });
      expect(requestStatus).to.have.property('block_height');
      expect(requestStatus.block_height).is.a('string');
      const splittedBlockHeight = requestStatus.block_height.split(':');
      expect(splittedBlockHeight).to.have.lengthOf(2);
      expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
      expect(parseInt(splittedBlockHeight[1])).to.be.above(
        lastStatusUpdateBlockHeight
      );
      lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
    });

    it('RP should receive completed request status with received data count = 1', async function() {
      this.timeout(15000);
      const requestStatus = await requestStatusCompletedPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: requestId,
        status: 'completed',
        mode: createRequestParams.mode,
        min_idp: createRequestParams.min_idp,
        answered_idp_count: 1,
        closed: false,
        timed_out: false,
        service_list: [
          {
            service_id: createRequestParams.data_request_list[0].service_id,
            min_as: createRequestParams.data_request_list[0].min_as,
            signed_data_count: 1,
            received_data_count: 1,
          },
        ],
        response_valid_list: [
          {
            idp_id: 'idp1',
            valid_signature: null,
            valid_proof: null,
            valid_ial: null,
          },
        ],
      });
      expect(requestStatus).to.have.property('block_height');
      expect(requestStatus.block_height).is.a('string');
      const splittedBlockHeight = requestStatus.block_height.split(':');
      expect(splittedBlockHeight).to.have.lengthOf(2);
      expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
      expect(parseInt(splittedBlockHeight[1])).to.be.above(
        lastStatusUpdateBlockHeight
      );
      lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
    });

    it('RP should receive request closed status', async function() {
      this.timeout(10000);
      const requestStatus = await requestClosedPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: requestId,
        status: 'completed',
        mode: createRequestParams.mode,
        min_idp: createRequestParams.min_idp,
        answered_idp_count: 1,
        closed: true,
        timed_out: false,
        service_list: [
          {
            service_id: createRequestParams.data_request_list[0].service_id,
            min_as: createRequestParams.data_request_list[0].min_as,
            signed_data_count: 1,
            received_data_count: 1,
          },
        ],
        response_valid_list: [
          {
            idp_id: 'idp1',
            valid_signature: null,
            valid_proof: null,
            valid_ial: null,
          },
        ],
      });
      expect(requestStatus).to.have.property('block_height');
      expect(requestStatus.block_height).is.a('string');
      const splittedBlockHeight = requestStatus.block_height.split(':');
      expect(splittedBlockHeight).to.have.lengthOf(2);
      expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
      expect(parseInt(splittedBlockHeight[1])).to.be.above(
        lastStatusUpdateBlockHeight
      );
    });

    it('RP should get the correct data received from AS', async function() {
      const response = await rpApi.getDataFromAS('rp1', {
        requestId,
      });
      const dataArr = await response.json();
      expect(response.status).to.equal(200);

      expect(dataArr).to.have.lengthOf(1);
      expect(dataArr[0]).to.deep.include({
        source_node_id: 'as1',
        service_id: createRequestParams.data_request_list[0].service_id,
        signature_sign_method: 'RSA-SHA256',
        data,
      });
      expect(dataArr[0].source_signature).to.be.a('string').that.is.not.empty;
      expect(dataArr[0].data_salt).to.be.a('string').that.is.not.empty;
    });

    after(async function() {
      this.timeout(10000);
      await ndidApi.enableNode('ndid1', {
        node_id: 'idp1',
      });
      await wait(5000);
    });
  });
});
