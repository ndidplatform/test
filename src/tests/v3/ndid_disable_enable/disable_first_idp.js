import { expect } from 'chai';
import forge from 'node-forge';
import uuidv4 from 'uuid/v4';

import * as ndidApi from '../../../api/v3/ndid';
import * as rpApi from '../../../api/v3/rp';
import * as idpApi from '../../../api/v3/idp';
import * as identityApi from '../../../api/v3/identity';
import * as asApi from '../../../api/v3/as';
import * as commonApi from '../../../api/v3/common';
import * as db from '../../../db';
import { ndidAvailable, idp2Available } from '../..';
import {
  createEventPromise,
  generateReferenceId,
  hash,
  wait,
} from '../../../utils';
import {
  as1EventEmitter,
  idp1EventEmitter,
  rpEventEmitter,
  idp2EventEmitter,
} from '../../../callback_server';
import * as config from '../../../config';

describe('NDID disable first IdP and following IdP create identity tests', function() {
  describe('Disable first IdP and following IdP create identity (mode 2) test', function() {
    const namespace = 'citizen_id';
    const identifier = uuidv4();
    const keypair = forge.pki.rsa.generateKeyPair(2048);
    const accessorPrivateKey = forge.pki.privateKeyToPem(keypair.privateKey);
    const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);

    const referenceId = generateReferenceId();
    const rpReferenceIdAfterEnableNode = generateReferenceId();
    const referenceIdIdp2 = generateReferenceId();
    const rpReferenceId = generateReferenceId();
    const idpReferenceId = generateReferenceId();
    const asReferenceId = generateReferenceId();

    const createIdentityRequestResultPromise = createEventPromise();
    //const accessorSignPromise = createEventPromise();
    const createIdentityResultPromise = createEventPromise();
    const notificationCreateIdentityPromise = createEventPromise();

    const createIdentityRequestResultIdp2Promise = createEventPromise();
    //const accessorSignIdp2Promise = createEventPromise();
    const createIdentityResultIdp2Promise = createEventPromise();

    const createRequestResultPromise = createEventPromise(); // RP
    const createRequestResultAfterEnableNodePromise = createEventPromise(); // RP
    const requestStatusPendingPromise = createEventPromise(); // RP
    const requestStatusPendingAfterEnableNodePromise = createEventPromise(); // RP
    const incomingRequestPromise = createEventPromise(); // IDP
    const idp1IncomingRequestAfterEnableNodePromise = createEventPromise();
    const idp2IncomingRequestAfterEnableNodePromise = createEventPromise();
    const responseResultPromise = createEventPromise(); // IDP
    const accessorEncryptPromise = createEventPromise(); // IDP
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
    let accessorId;
    let accessorIdIdp2;
    let lastStatusUpdateBlockHeight;
    let requestMessageSalt;
    let requestMessageHash;
    let referenceGroupCode;
    let responseAccessorId;
    let requestIdAfterEnableNode;

    before(async function() {
      if (!ndidAvailable || !idp2Available) {
        this.test.parent.pending = true;
        this.skip();
      }

      createRequestParams = {
        reference_id: rpReferenceId,
        callback_url: config.RP_CALLBACK_URL,
        mode: 2,
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
          callbackData.type === 'create_request_result' &&
          callbackData.reference_id === rpReferenceIdAfterEnableNode
        ) {
          createRequestResultAfterEnableNodePromise.resolve(callbackData);
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
        } else if (
          callbackData.type === 'request_status' &&
          callbackData.request_id === requestIdAfterEnableNode
        ) {
          if (callbackData.status === 'pending') {
            requestStatusPendingAfterEnableNodePromise.resolve(callbackData);
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
        } else if (
          callbackData.type === 'incoming_request' &&
          callbackData.request_id === requestIdAfterEnableNode
        ) {
          idp1IncomingRequestAfterEnableNodePromise.resolve(callbackData);
        }
      });

      idp1EventEmitter.on('identity_notification_callback', function(
        callbackData
      ) {
        if (
          callbackData.type === 'identity_modification_notification' &&
          callbackData.reference_group_code === referenceGroupCode &&
          callbackData.action === 'create_identity'
        ) {
          notificationCreateIdentityPromise.resolve(callbackData);
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
        } else if (
          callbackData.type === 'incoming_request' &&
          callbackData.request_id === requestId
        ) {
          incomingRequestPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'incoming_request' &&
          callbackData.request_id === requestIdAfterEnableNode
        ) {
          idp2IncomingRequestAfterEnableNodePromise.resolve(callbackData);
        } else if (
          callbackData.type === 'response_result' &&
          callbackData.reference_id === idpReferenceId
        ) {
          responseResultPromise.resolve(callbackData);
        }
      });

      idp2EventEmitter.on('accessor_encrypt_callback', function(callbackData) {
        if (callbackData.request_id === requestId) {
          accessorEncryptPromise.resolve(callbackData);
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
      const response = await identityApi.createIdentity('idp1', {
        reference_id: referenceId,
        callback_url: config.IDP1_CALLBACK_URL,
        identity_list: [
          {
            namespace,
            identifier,
          },
        ],
        accessor_type: 'RSA',
        accessor_public_key: accessorPublicKey,
        //accessor_id,
        ial: 2.3,
        mode: 2,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;
      accessorId = responseBody.accessor_id;
    });

    it('Identity should be created successfully', async function() {
      this.timeout(15000);
      const createIdentityResult = await createIdentityResultPromise.promise;
      expect(createIdentityResult).to.deep.include({
        reference_id: referenceId,
        // request_id: createIdentityRequestId,
        success: true,
      });

      expect(createIdentityResult.reference_group_code).to.be.a('string').that
        .is.not.empty;

      referenceGroupCode = createIdentityResult.reference_group_code;

      const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
        namespace,
        identifier,
      });

      const idpNodes = await response.json();
      const idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
      expect(idpNode).to.not.be.undefined;
      expect(idpNode.mode_list)
        .to.be.an('array')
        .that.include(2);

      db.idp1Identities.push({
        referenceGroupCode,
        mode: 2,
        namespace,
        identifier,
        accessors: [
          {
            accessorId,
            accessorPrivateKey,
            accessorPublicKey,
          },
        ],
      });
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

    it('IdP (idp2) should create identity request (mode 2) for this namespace/identifier sunccessfully', async function() {
      this.timeout(10000);
      const response = await identityApi.createIdentity('idp2', {
        reference_id: referenceIdIdp2,
        callback_url: config.IDP2_CALLBACK_URL,
        identity_list: [
          {
            namespace,
            identifier,
          },
        ],
        accessor_type: 'RSA',
        accessor_public_key: accessorPublicKey,
        //accessor_id,
        ial: 2.3,
        mode: 2,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;
      accessorIdIdp2 = responseBody.accessor_id;
    });

    it('Identity should be created successfully', async function() {
      this.timeout(15000);
      const createIdentityIdp2Result = await createIdentityResultIdp2Promise.promise;
      expect(createIdentityIdp2Result).to.deep.include({
        reference_id: referenceIdIdp2,
        // request_id: createIdentityRequestIdIdp2,
        success: true,
      });

      expect(createIdentityIdp2Result.reference_group_code).to.equal(
        referenceGroupCode
      );
      const response = await commonApi.getRelevantIdpNodesBySid('idp2', {
        namespace,
        identifier,
      });
      const idpNodes = await response.json();
      let idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp2');
      expect(idpNode).to.not.be.undefined;
      expect(idpNodes)
        .to.be.an('array')
        .that.to.have.lengthOf(1);
      expect(idpNode.mode_list)
        .to.be.an('array')
        .that.include(2);

      idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
      expect(idpNode).to.be.undefined;
      expect(idpNodes)
        .to.be.an('array')
        .that.to.have.lengthOf(1);

      db.idp2Identities.push({
        referenceGroupCode,
        mode: 2,
        namespace,
        identifier,
        accessors: [
          {
            accessorId: accessorIdIdp2,
            accessorPrivateKey,
            accessorPublicKey,
          },
        ],
      });
    });

    it('After create identity IdP (idp1) that associated with this sid should receive identity notification callback', async function() {
      this.timeout(15000);
      const notificationCreateIdentity = await notificationCreateIdentityPromise.promise;
      //const IdP2notificationCreateIdentity = await notificationCreateIdentityPromise.promise;
      expect(notificationCreateIdentity).to.deep.include({
        node_id: 'idp1',
        type: 'identity_modification_notification',
        reference_group_code: referenceGroupCode,
        action: 'create_identity',
      });
    });

    it('After create identity this sid should be existing on platform ', async function() {
      const response = await identityApi.getIdentityInfo('idp2', {
        namespace,
        identifier,
      });
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      expect(responseBody.reference_group_code).to.equal(referenceGroupCode);
    });

    it('After create identity should get identity ial successfully', async function() {
      const response = await identityApi.getIdentityIal('idp2', {
        namespace,
        identifier,
      });
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      expect(responseBody.ial).to.equal(2.3);
    });

    it('RP should create a request (mode 2) successfully', async function() {
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
        request_message: createRequestParams.request_message,
        request_message_hash: hash(
          createRequestParams.request_message +
            incomingRequest.request_message_salt
        ),
        requester_node_id: 'rp1',
        min_ial: createRequestParams.min_ial,
        min_aal: createRequestParams.min_aal,
        data_request_list: dataRequestListWithoutParams,
        request_timeout: createRequestParams.request_timeout,
      });
      expect(incomingRequest.reference_group_code).to.be.a('string').that.is.not
        .empty;
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

    it('IdP should create response (accept) successfully', async function() {
      this.timeout(10000);

      const identity = db.idp2Identities.find(
        identity =>
          identity.namespace === namespace && identity.identifier === identifier
      );

      responseAccessorId = identity.accessors[0].accessorId;

      const response = await idpApi.createResponse('idp2', {
        reference_id: idpReferenceId,
        callback_url: config.IDP2_CALLBACK_URL,
        request_id: requestId,
        ial: 2.3,
        aal: 3,
        status: 'accept',
        accessor_id: responseAccessorId,
      });

      expect(response.status).to.equal(202);
    });

    it('IdP should receive accessor encrypt callback with correct data', async function() {
      this.timeout(15000);

      const accessorEncryptParams = await accessorEncryptPromise.promise;
      expect(accessorEncryptParams).to.deep.include({
        node_id: 'idp2',
        type: 'accessor_encrypt',
        accessor_id: responseAccessorId,
        key_type: 'RSA',
        padding: 'none',
        reference_id: idpReferenceId,
        request_id: requestId,
      });

      expect(accessorEncryptParams.request_message_padded_hash).to.be.a(
        'string'
      ).that.is.not.empty;
    });

    it('IdP shoud receive callback create response result with success = true', async function() {
      const responseResult = await responseResultPromise.promise;
      expect(responseResult).to.deep.include({
        node_id: 'idp2',
        type: 'response_result',
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
            valid_signature: true,
            valid_ial: true,
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
      expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is
        .not.empty;
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
            idp_id: 'idp2',
            valid_signature: true,
            valid_ial: true,
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
            idp_id: 'idp2',
            valid_signature: true,
            valid_ial: true,
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
            idp_id: 'idp2',
            valid_signature: true,
            valid_ial: true,
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

    it('NDID should enable node IdP (idp1) successfully', async function() {
      this.timeout(10000);

      const response = await ndidApi.enableNode('ndid1', {
        node_id: 'idp1',
      });
      expect(response.status).to.equal(200);
      await wait(5000);
    });

    it('After enable node idp1 should query IdP node relevant to this namespace/identifier found', async function() {
      this.timeout(15000);
      const response = await commonApi.getRelevantIdpNodesBySid('rp1', {
        namespace,
        identifier,
      });

      const idpNodes = await response.json();
      let idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp2');
      expect(idpNode).to.not.be.undefined;
      expect(idpNodes)
        .to.be.an('array')
        .that.to.have.lengthOf(2);
      expect(idpNode.mode_list)
        .to.be.an('array')
        .that.include(2);

      idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
      expect(idpNode).to.not.be.undefined;
      expect(idpNodes)
        .to.be.an('array')
        .that.to.have.lengthOf(2);
      expect(idpNode.mode_list)
        .to.be.an('array')
        .that.include(2);
    });

    it('After enable node RP should create a request (mode 2) successfully', async function() {
      this.timeout(10000);

      createRequestParams = {
        ...createRequestParams,
        reference_id: rpReferenceIdAfterEnableNode,
      };

      const response = await rpApi.createRequest('rp1', createRequestParams);
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

      requestIdAfterEnableNode = responseBody.request_id;

      const createRequestResult = await createRequestResultAfterEnableNodePromise.promise;
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
      const requestStatus = await requestStatusPendingAfterEnableNodePromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: requestIdAfterEnableNode,
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

    it('IdP (idp1) should receive incoming request callback', async function() {
      this.timeout(15000);
      const incomingRequest = await idp1IncomingRequestAfterEnableNodePromise.promise;

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
        request_id: requestIdAfterEnableNode,
        request_message: createRequestParams.request_message,
        request_message_hash: hash(
          createRequestParams.request_message +
            incomingRequest.request_message_salt
        ),
        requester_node_id: 'rp1',
        min_ial: createRequestParams.min_ial,
        min_aal: createRequestParams.min_aal,
        data_request_list: dataRequestListWithoutParams,
        request_timeout: createRequestParams.request_timeout,
      });
      expect(incomingRequest.reference_group_code).to.be.a('string').that.is.not
        .empty;
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

    it('IdP (idp2) should receive incoming request callback', async function() {
      this.timeout(15000);
      const incomingRequest = await idp2IncomingRequestAfterEnableNodePromise.promise;

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
        request_id: requestIdAfterEnableNode,
        request_message: createRequestParams.request_message,
        request_message_hash: hash(
          createRequestParams.request_message +
            incomingRequest.request_message_salt
        ),
        requester_node_id: 'rp1',
        min_ial: createRequestParams.min_ial,
        min_aal: createRequestParams.min_aal,
        data_request_list: dataRequestListWithoutParams,
        request_timeout: createRequestParams.request_timeout,
      });
      expect(incomingRequest.reference_group_code).to.be.a('string').that.is.not
        .empty;
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

    after(async function() {
      this.timeout(10000);
      await ndidApi.enableNode('ndid1', {
        node_id: 'idp1',
      });
      await wait(5000);
      idp1EventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('identity_notification_callback');
      idp2EventEmitter.removeAllListeners('callback');
      idp2EventEmitter.removeAllListeners('accessor_encrypt_callback');
      rpEventEmitter.removeAllListeners('callback');
      as1EventEmitter.removeAllListeners('callback');
    });
  });

  describe('Disable first IdP and following IdP create identity (mode 3) test', function() {
    const namespace = 'citizen_id';
    const identifier = uuidv4();
    const keypair = forge.pki.rsa.generateKeyPair(2048);
    const accessorPrivateKey = forge.pki.privateKeyToPem(keypair.privateKey);
    const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);

    const referenceId = generateReferenceId();
    const rpReferenceIdAfterEnableNode = generateReferenceId();
    const referenceIdIdp2 = generateReferenceId();
    const rpReferenceId = generateReferenceId();
    const idpReferenceId = generateReferenceId();
    const asReferenceId = generateReferenceId();

    const createIdentityRequestResultPromise = createEventPromise();
    //const accessorSignPromise = createEventPromise();
    const createIdentityResultPromise = createEventPromise();
    const notificationCreateIdentityPromise = createEventPromise();

    const createIdentityRequestResultIdp2Promise = createEventPromise();
    //const accessorSignIdp2Promise = createEventPromise();
    const createIdentityResultIdp2Promise = createEventPromise();

    const createRequestResultPromise = createEventPromise(); // RP
    const createRequestResultAfterEnableNodePromise = createEventPromise(); // RP
    const requestStatusPendingPromise = createEventPromise(); // RP
    const requestStatusPendingAfterEnableNodePromise = createEventPromise(); // RP
    const incomingRequestPromise = createEventPromise(); // IDP
    const idp1IncomingRequestAfterEnableNodePromise = createEventPromise();
    const idp2IncomingRequestAfterEnableNodePromise = createEventPromise();
    const responseResultPromise = createEventPromise(); // IDP
    const accessorEncryptPromise = createEventPromise(); // IDP
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
    let accessorId;
    let accessorIdIdp2;
    let lastStatusUpdateBlockHeight;
    let requestMessageSalt;
    let requestMessageHash;
    let referenceGroupCode;
    let responseAccessorId;
    let requestIdAfterEnableNode;

    before(async function() {
      if (!ndidAvailable || !idp2Available) {
        this.test.parent.pending = true;
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
          callbackData.type === 'create_request_result' &&
          callbackData.reference_id === rpReferenceIdAfterEnableNode
        ) {
          createRequestResultAfterEnableNodePromise.resolve(callbackData);
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
        } else if (
          callbackData.type === 'request_status' &&
          callbackData.request_id === requestIdAfterEnableNode
        ) {
          if (callbackData.status === 'pending') {
            requestStatusPendingAfterEnableNodePromise.resolve(callbackData);
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
        } else if (
          callbackData.type === 'incoming_request' &&
          callbackData.request_id === requestIdAfterEnableNode
        ) {
          idp1IncomingRequestAfterEnableNodePromise.resolve(callbackData);
        }
      });

      idp1EventEmitter.on('identity_notification_callback', function(
        callbackData
      ) {
        if (
          callbackData.type === 'identity_modification_notification' &&
          callbackData.reference_group_code === referenceGroupCode &&
          callbackData.action === 'create_identity'
        ) {
          notificationCreateIdentityPromise.resolve(callbackData);
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
        } else if (
          callbackData.type === 'incoming_request' &&
          callbackData.request_id === requestId
        ) {
          incomingRequestPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'incoming_request' &&
          callbackData.request_id === requestIdAfterEnableNode
        ) {
          idp2IncomingRequestAfterEnableNodePromise.resolve(callbackData);
        } else if (
          callbackData.type === 'response_result' &&
          callbackData.reference_id === idpReferenceId
        ) {
          responseResultPromise.resolve(callbackData);
        }
      });

      idp2EventEmitter.on('accessor_encrypt_callback', function(callbackData) {
        if (callbackData.request_id === requestId) {
          accessorEncryptPromise.resolve(callbackData);
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
      const response = await identityApi.createIdentity('idp1', {
        reference_id: referenceId,
        callback_url: config.IDP1_CALLBACK_URL,
        identity_list: [
          {
            namespace,
            identifier,
          },
        ],
        accessor_type: 'RSA',
        accessor_public_key: accessorPublicKey,
        //accessor_id,
        ial: 2.3,
        mode: 3,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;
      accessorId = responseBody.accessor_id;
    });

    it('Identity should be created successfully', async function() {
      this.timeout(15000);
      const createIdentityResult = await createIdentityResultPromise.promise;
      expect(createIdentityResult).to.deep.include({
        reference_id: referenceId,
        // request_id: createIdentityRequestId,
        success: true,
      });

      expect(createIdentityResult.reference_group_code).to.be.a('string').that
        .is.not.empty;

      referenceGroupCode = createIdentityResult.reference_group_code;

      const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
        namespace,
        identifier,
      });

      const idpNodes = await response.json();
      const idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
      expect(idpNode).to.not.be.undefined;
      expect(idpNode.mode_list)
        .to.be.an('array')
        .that.include(2, 3);

      db.idp1Identities.push({
        referenceGroupCode,
        mode: 3,
        namespace,
        identifier,
        accessors: [
          {
            accessorId,
            accessorPrivateKey,
            accessorPublicKey,
          },
        ],
      });
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

    it('IdP (idp2) should create identity request (mode 3) for this namespace/identifier sunccessfully', async function() {
      this.timeout(10000);
      const response = await identityApi.createIdentity('idp2', {
        reference_id: referenceIdIdp2,
        callback_url: config.IDP2_CALLBACK_URL,
        identity_list: [
          {
            namespace,
            identifier,
          },
        ],
        accessor_type: 'RSA',
        accessor_public_key: accessorPublicKey,
        //accessor_id,
        ial: 2.3,
        mode: 3,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;
      accessorIdIdp2 = responseBody.accessor_id;
    });

    it('Identity should be created successfully', async function() {
      this.timeout(15000);
      const createIdentityIdp2Result = await createIdentityResultIdp2Promise.promise;
      expect(createIdentityIdp2Result).to.deep.include({
        reference_id: referenceIdIdp2,
        // request_id: createIdentityRequestIdIdp2,
        success: true,
      });

      expect(createIdentityIdp2Result.reference_group_code).to.equal(
        referenceGroupCode
      );
      const response = await commonApi.getRelevantIdpNodesBySid('idp2', {
        namespace,
        identifier,
      });
      const idpNodes = await response.json();
      let idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp2');
      expect(idpNode).to.not.be.undefined;
      expect(idpNodes)
        .to.be.an('array')
        .that.to.have.lengthOf(1);
      expect(idpNode.mode_list)
        .to.be.an('array')
        .that.include(2, 3);

      idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
      expect(idpNode).to.be.undefined;
      expect(idpNodes)
        .to.be.an('array')
        .that.to.have.lengthOf(1);

      db.idp2Identities.push({
        referenceGroupCode,
        mode: 3,
        namespace,
        identifier,
        accessors: [
          {
            accessorId: accessorIdIdp2,
            accessorPrivateKey,
            accessorPublicKey,
          },
        ],
      });
    });

    it('After create identity IdP (idp1) that associated with this sid should receive identity notification callback', async function() {
      this.timeout(15000);
      const notificationCreateIdentity = await notificationCreateIdentityPromise.promise;
      //const IdP2notificationCreateIdentity = await notificationCreateIdentityPromise.promise;
      expect(notificationCreateIdentity).to.deep.include({
        node_id: 'idp1',
        type: 'identity_modification_notification',
        reference_group_code: referenceGroupCode,
        action: 'create_identity',
      });
    });

    it('After create identity this sid should be existing on platform ', async function() {
      const response = await identityApi.getIdentityInfo('idp2', {
        namespace,
        identifier,
      });
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      expect(responseBody.reference_group_code).to.equal(referenceGroupCode);
    });

    it('After create identity should get identity ial successfully', async function() {
      const response = await identityApi.getIdentityIal('idp2', {
        namespace,
        identifier,
      });
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      expect(responseBody.ial).to.equal(2.3);
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
        request_message: createRequestParams.request_message,
        request_message_hash: hash(
          createRequestParams.request_message +
            incomingRequest.request_message_salt
        ),
        requester_node_id: 'rp1',
        min_ial: createRequestParams.min_ial,
        min_aal: createRequestParams.min_aal,
        data_request_list: dataRequestListWithoutParams,
        request_timeout: createRequestParams.request_timeout,
      });
      expect(incomingRequest.reference_group_code).to.be.a('string').that.is.not
        .empty;
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

    it('IdP should create response (accept) successfully', async function() {
      this.timeout(10000);

      const identity = db.idp2Identities.find(
        identity =>
          identity.namespace === namespace && identity.identifier === identifier
      );

      responseAccessorId = identity.accessors[0].accessorId;

      const response = await idpApi.createResponse('idp2', {
        reference_id: idpReferenceId,
        callback_url: config.IDP2_CALLBACK_URL,
        request_id: requestId,
        ial: 2.3,
        aal: 3,
        status: 'accept',
        accessor_id: responseAccessorId,
      });

      expect(response.status).to.equal(202);
    });

    it('IdP should receive accessor encrypt callback with correct data', async function() {
      this.timeout(15000);

      const accessorEncryptParams = await accessorEncryptPromise.promise;
      expect(accessorEncryptParams).to.deep.include({
        node_id: 'idp2',
        type: 'accessor_encrypt',
        accessor_id: responseAccessorId,
        key_type: 'RSA',
        padding: 'none',
        reference_id: idpReferenceId,
        request_id: requestId,
      });

      expect(accessorEncryptParams.request_message_padded_hash).to.be.a(
        'string'
      ).that.is.not.empty;
    });

    it('IdP shoud receive callback create response result with success = true', async function() {
      const responseResult = await responseResultPromise.promise;
      expect(responseResult).to.deep.include({
        node_id: 'idp2',
        type: 'response_result',
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
            valid_signature: true,
            valid_ial: true,
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
      expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is
        .not.empty;
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
            idp_id: 'idp2',
            valid_signature: true,
            valid_ial: true,
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
            idp_id: 'idp2',
            valid_signature: true,
            valid_ial: true,
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
            idp_id: 'idp2',
            valid_signature: true,
            valid_ial: true,
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

    it('NDID should enable node IdP (idp1) successfully', async function() {
      this.timeout(10000);

      const response = await ndidApi.enableNode('ndid1', {
        node_id: 'idp1',
      });
      expect(response.status).to.equal(200);
      await wait(5000);
    });

    it('After enable node idp1 should query IdP node relevant to this namespace/identifier found', async function() {
      this.timeout(15000);
      const response = await commonApi.getRelevantIdpNodesBySid('rp1', {
        namespace,
        identifier,
      });

      const idpNodes = await response.json();
      let idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp2');
      expect(idpNode).to.not.be.undefined;
      expect(idpNodes)
        .to.be.an('array')
        .that.to.have.lengthOf(2);
      expect(idpNode.mode_list)
        .to.be.an('array')
        .that.include(2, 3);

      idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
      expect(idpNode).to.not.be.undefined;
      expect(idpNodes)
        .to.be.an('array')
        .that.to.have.lengthOf(2);
      expect(idpNode.mode_list)
        .to.be.an('array')
        .that.include(2, 3);
    });

    it('After enable node RP should create a request (mode 2) successfully', async function() {
      this.timeout(10000);

      createRequestParams = {
        ...createRequestParams,
        reference_id: rpReferenceIdAfterEnableNode,
      };

      const response = await rpApi.createRequest('rp1', createRequestParams);
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

      requestIdAfterEnableNode = responseBody.request_id;

      const createRequestResult = await createRequestResultAfterEnableNodePromise.promise;
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
      const requestStatus = await requestStatusPendingAfterEnableNodePromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: requestIdAfterEnableNode,
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

    it('IdP (idp1) should receive incoming request callback', async function() {
      this.timeout(15000);
      const incomingRequest = await idp1IncomingRequestAfterEnableNodePromise.promise;

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
        request_id: requestIdAfterEnableNode,
        request_message: createRequestParams.request_message,
        request_message_hash: hash(
          createRequestParams.request_message +
            incomingRequest.request_message_salt
        ),
        requester_node_id: 'rp1',
        min_ial: createRequestParams.min_ial,
        min_aal: createRequestParams.min_aal,
        data_request_list: dataRequestListWithoutParams,
        request_timeout: createRequestParams.request_timeout,
      });
      expect(incomingRequest.reference_group_code).to.be.a('string').that.is.not
        .empty;
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

    it('IdP (idp2) should receive incoming request callback', async function() {
      this.timeout(15000);
      const incomingRequest = await idp2IncomingRequestAfterEnableNodePromise.promise;

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
        request_id: requestIdAfterEnableNode,
        request_message: createRequestParams.request_message,
        request_message_hash: hash(
          createRequestParams.request_message +
            incomingRequest.request_message_salt
        ),
        requester_node_id: 'rp1',
        min_ial: createRequestParams.min_ial,
        min_aal: createRequestParams.min_aal,
        data_request_list: dataRequestListWithoutParams,
        request_timeout: createRequestParams.request_timeout,
      });
      expect(incomingRequest.reference_group_code).to.be.a('string').that.is.not
        .empty;
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

    after(async function() {
      this.timeout(10000);
      await ndidApi.enableNode('ndid1', {
        node_id: 'idp1',
      });
      await wait(5000);
      idp1EventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('identity_notification_callback');
      idp2EventEmitter.removeAllListeners('callback');
      idp2EventEmitter.removeAllListeners('accessor_encrypt_callback');
      rpEventEmitter.removeAllListeners('callback');
      as1EventEmitter.removeAllListeners('callback');
    });
  });

  describe('Disable first IdP (mode 2) and following IdP create identity (mode 3) test', function() {
    const namespace = 'citizen_id';
    const identifier = uuidv4();
    const keypair = forge.pki.rsa.generateKeyPair(2048);
    const accessorPrivateKey = forge.pki.privateKeyToPem(keypair.privateKey);
    const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);

    const referenceId = generateReferenceId();
    const rpReferenceIdAfterEnableNode = generateReferenceId();
    const referenceIdIdp2 = generateReferenceId();
    const rpReferenceId = generateReferenceId();
    const idpReferenceId = generateReferenceId();
    const asReferenceId = generateReferenceId();

    const createIdentityRequestResultPromise = createEventPromise();
    //const accessorSignPromise = createEventPromise();
    const createIdentityResultPromise = createEventPromise();
    const notificationCreateIdentityPromise = createEventPromise();

    const createIdentityRequestResultIdp2Promise = createEventPromise();
    //const accessorSignIdp2Promise = createEventPromise();
    const createIdentityResultIdp2Promise = createEventPromise();

    const createRequestResultPromise = createEventPromise(); // RP
    const createRequestResultAfterEnableNodePromise = createEventPromise(); // RP
    const requestStatusPendingPromise = createEventPromise(); // RP
    const requestStatusPendingAfterEnableNodePromise = createEventPromise(); // RP
    const incomingRequestPromise = createEventPromise(); // IDP
    const idp1IncomingRequestAfterEnableNodePromise = createEventPromise();
    const idp2IncomingRequestAfterEnableNodePromise = createEventPromise();
    const responseResultPromise = createEventPromise(); // IDP
    const accessorEncryptPromise = createEventPromise(); // IDP
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
    let accessorId;
    let accessorIdIdp2;
    let lastStatusUpdateBlockHeight;
    let requestMessageSalt;
    let requestMessageHash;
    let referenceGroupCode;
    let responseAccessorId;
    let requestIdAfterEnableNode;

    before(async function() {
      if (!ndidAvailable || !idp2Available) {
        this.test.parent.pending = true;
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
          callbackData.type === 'create_request_result' &&
          callbackData.reference_id === rpReferenceIdAfterEnableNode
        ) {
          createRequestResultAfterEnableNodePromise.resolve(callbackData);
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
        } else if (
          callbackData.type === 'request_status' &&
          callbackData.request_id === requestIdAfterEnableNode
        ) {
          if (callbackData.status === 'pending') {
            requestStatusPendingAfterEnableNodePromise.resolve(callbackData);
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
        } else if (
          callbackData.type === 'incoming_request' &&
          callbackData.request_id === requestIdAfterEnableNode
        ) {
          idp1IncomingRequestAfterEnableNodePromise.resolve(callbackData);
        }
      });

      idp1EventEmitter.on('identity_notification_callback', function(
        callbackData
      ) {
        if (
          callbackData.type === 'identity_modification_notification' &&
          callbackData.reference_group_code === referenceGroupCode &&
          callbackData.action === 'create_identity'
        ) {
          notificationCreateIdentityPromise.resolve(callbackData);
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
        } else if (
          callbackData.type === 'incoming_request' &&
          callbackData.request_id === requestId
        ) {
          incomingRequestPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'incoming_request' &&
          callbackData.request_id === requestIdAfterEnableNode
        ) {
          idp2IncomingRequestAfterEnableNodePromise.resolve(callbackData);
        } else if (
          callbackData.type === 'response_result' &&
          callbackData.reference_id === idpReferenceId
        ) {
          responseResultPromise.resolve(callbackData);
        }
      });

      idp2EventEmitter.on('accessor_encrypt_callback', function(callbackData) {
        if (callbackData.request_id === requestId) {
          accessorEncryptPromise.resolve(callbackData);
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
      const response = await identityApi.createIdentity('idp1', {
        reference_id: referenceId,
        callback_url: config.IDP1_CALLBACK_URL,
        identity_list: [
          {
            namespace,
            identifier,
          },
        ],
        accessor_type: 'RSA',
        accessor_public_key: accessorPublicKey,
        //accessor_id,
        ial: 2.3,
        mode: 2,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;
      accessorId = responseBody.accessor_id;
    });

    it('Identity should be created successfully', async function() {
      this.timeout(15000);
      const createIdentityResult = await createIdentityResultPromise.promise;
      expect(createIdentityResult).to.deep.include({
        reference_id: referenceId,
        // request_id: createIdentityRequestId,
        success: true,
      });

      expect(createIdentityResult.reference_group_code).to.be.a('string').that
        .is.not.empty;

      referenceGroupCode = createIdentityResult.reference_group_code;

      const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
        namespace,
        identifier,
      });

      const idpNodes = await response.json();
      const idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
      expect(idpNode).to.not.be.undefined;
      expect(idpNode.mode_list)
        .to.be.an('array')
        .that.include(2);

      db.idp1Identities.push({
        referenceGroupCode,
        mode: 2,
        namespace,
        identifier,
        accessors: [
          {
            accessorId,
            accessorPrivateKey,
            accessorPublicKey,
          },
        ],
      });
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

    it('IdP (idp2) should create identity request (mode 3) for this namespace/identifier sunccessfully', async function() {
      this.timeout(10000);
      const response = await identityApi.createIdentity('idp2', {
        reference_id: referenceIdIdp2,
        callback_url: config.IDP2_CALLBACK_URL,
        identity_list: [
          {
            namespace,
            identifier,
          },
        ],
        accessor_type: 'RSA',
        accessor_public_key: accessorPublicKey,
        //accessor_id,
        ial: 2.3,
        mode: 3,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;
      accessorIdIdp2 = responseBody.accessor_id;
    });

    it('Identity should be created successfully', async function() {
      this.timeout(15000);
      const createIdentityIdp2Result = await createIdentityResultIdp2Promise.promise;
      expect(createIdentityIdp2Result).to.deep.include({
        reference_id: referenceIdIdp2,
        // request_id: createIdentityRequestIdIdp2,
        success: true,
      });

      expect(createIdentityIdp2Result.reference_group_code).to.equal(
        referenceGroupCode
      );
      const response = await commonApi.getRelevantIdpNodesBySid('idp2', {
        namespace,
        identifier,
      });
      const idpNodes = await response.json();
      let idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp2');
      expect(idpNode).to.not.be.undefined;
      expect(idpNodes)
        .to.be.an('array')
        .that.to.have.lengthOf(1);
      expect(idpNode.mode_list)
        .to.be.an('array')
        .that.include(2, 3);

      idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
      expect(idpNode).to.be.undefined;
      expect(idpNodes)
        .to.be.an('array')
        .that.to.have.lengthOf(1);

      db.idp2Identities.push({
        referenceGroupCode,
        mode: 3,
        namespace,
        identifier,
        accessors: [
          {
            accessorId: accessorIdIdp2,
            accessorPrivateKey,
            accessorPublicKey,
          },
        ],
      });
    });

    it('After create identity IdP (idp1) that associated with this sid should receive identity notification callback', async function() {
      this.timeout(15000);
      const notificationCreateIdentity = await notificationCreateIdentityPromise.promise;
      //const IdP2notificationCreateIdentity = await notificationCreateIdentityPromise.promise;
      expect(notificationCreateIdentity).to.deep.include({
        node_id: 'idp1',
        type: 'identity_modification_notification',
        reference_group_code: referenceGroupCode,
        action: 'create_identity',
      });
    });

    it('After create identity this sid should be existing on platform ', async function() {
      const response = await identityApi.getIdentityInfo('idp2', {
        namespace,
        identifier,
      });
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      expect(responseBody.reference_group_code).to.equal(referenceGroupCode);
    });

    it('After create identity should get identity ial successfully', async function() {
      const response = await identityApi.getIdentityIal('idp2', {
        namespace,
        identifier,
      });
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      expect(responseBody.ial).to.equal(2.3);
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
        request_message: createRequestParams.request_message,
        request_message_hash: hash(
          createRequestParams.request_message +
            incomingRequest.request_message_salt
        ),
        requester_node_id: 'rp1',
        min_ial: createRequestParams.min_ial,
        min_aal: createRequestParams.min_aal,
        data_request_list: dataRequestListWithoutParams,
        request_timeout: createRequestParams.request_timeout,
      });
      expect(incomingRequest.reference_group_code).to.be.a('string').that.is.not
        .empty;
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

    it('IdP should create response (accept) successfully', async function() {
      this.timeout(10000);

      const identity = db.idp2Identities.find(
        identity =>
          identity.namespace === namespace && identity.identifier === identifier
      );

      responseAccessorId = identity.accessors[0].accessorId;

      const response = await idpApi.createResponse('idp2', {
        reference_id: idpReferenceId,
        callback_url: config.IDP2_CALLBACK_URL,
        request_id: requestId,
        ial: 2.3,
        aal: 3,
        status: 'accept',
        accessor_id: responseAccessorId,
      });

      expect(response.status).to.equal(202);
    });

    it('IdP should receive accessor encrypt callback with correct data', async function() {
      this.timeout(15000);

      const accessorEncryptParams = await accessorEncryptPromise.promise;
      expect(accessorEncryptParams).to.deep.include({
        node_id: 'idp2',
        type: 'accessor_encrypt',
        accessor_id: responseAccessorId,
        key_type: 'RSA',
        padding: 'none',
        reference_id: idpReferenceId,
        request_id: requestId,
      });

      expect(accessorEncryptParams.request_message_padded_hash).to.be.a(
        'string'
      ).that.is.not.empty;
    });

    it('IdP shoud receive callback create response result with success = true', async function() {
      const responseResult = await responseResultPromise.promise;
      expect(responseResult).to.deep.include({
        node_id: 'idp2',
        type: 'response_result',
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
            valid_signature: true,
            valid_ial: true,
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
      expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is
        .not.empty;
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
            idp_id: 'idp2',
            valid_signature: true,
            valid_ial: true,
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
            idp_id: 'idp2',
            valid_signature: true,
            valid_ial: true,
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
            idp_id: 'idp2',
            valid_signature: true,
            valid_ial: true,
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

    it('NDID should enable node IdP (idp1) successfully', async function() {
      this.timeout(10000);

      const response = await ndidApi.enableNode('ndid1', {
        node_id: 'idp1',
      });
      expect(response.status).to.equal(200);
      await wait(5000);
    });

    it('After enable node idp1 should query IdP node relevant to this namespace/identifier found', async function() {
      this.timeout(15000);
      const response = await commonApi.getRelevantIdpNodesBySid('rp1', {
        namespace,
        identifier,
      });

      const idpNodes = await response.json();
      let idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp2');
      expect(idpNode).to.not.be.undefined;
      expect(idpNodes)
        .to.be.an('array')
        .that.to.have.lengthOf(2);
      expect(idpNode.mode_list)
        .to.be.an('array')
        .that.include(2, 3);

      idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
      expect(idpNode).to.not.be.undefined;
      expect(idpNodes)
        .to.be.an('array')
        .that.to.have.lengthOf(2);
      expect(idpNode.mode_list)
        .to.be.an('array')
        .that.include(2);
    });

    it('After enable node RP should create a request (mode 2) successfully', async function() {
      this.timeout(10000);

      createRequestParams = {
        ...createRequestParams,
        reference_id: rpReferenceIdAfterEnableNode,
        mode: 2,
      };

      const response = await rpApi.createRequest('rp1', createRequestParams);
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

      requestIdAfterEnableNode = responseBody.request_id;

      const createRequestResult = await createRequestResultAfterEnableNodePromise.promise;
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
      const requestStatus = await requestStatusPendingAfterEnableNodePromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: requestIdAfterEnableNode,
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

    it('IdP (idp1) should receive incoming request callback', async function() {
      this.timeout(15000);
      const incomingRequest = await idp1IncomingRequestAfterEnableNodePromise.promise;

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
        request_id: requestIdAfterEnableNode,
        request_message: createRequestParams.request_message,
        request_message_hash: hash(
          createRequestParams.request_message +
            incomingRequest.request_message_salt
        ),
        requester_node_id: 'rp1',
        min_ial: createRequestParams.min_ial,
        min_aal: createRequestParams.min_aal,
        data_request_list: dataRequestListWithoutParams,
        request_timeout: createRequestParams.request_timeout,
      });
      expect(incomingRequest.reference_group_code).to.be.a('string').that.is.not
        .empty;
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

    it('IdP (idp2) should receive incoming request callback', async function() {
      this.timeout(15000);
      const incomingRequest = await idp2IncomingRequestAfterEnableNodePromise.promise;

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
        request_id: requestIdAfterEnableNode,
        request_message: createRequestParams.request_message,
        request_message_hash: hash(
          createRequestParams.request_message +
            incomingRequest.request_message_salt
        ),
        requester_node_id: 'rp1',
        min_ial: createRequestParams.min_ial,
        min_aal: createRequestParams.min_aal,
        data_request_list: dataRequestListWithoutParams,
        request_timeout: createRequestParams.request_timeout,
      });
      expect(incomingRequest.reference_group_code).to.be.a('string').that.is.not
        .empty;
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

    after(async function() {
      this.timeout(10000);
      await ndidApi.enableNode('ndid1', {
        node_id: 'idp1',
      });
      await wait(5000);

      idp1EventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('identity_notification_callback');
      idp2EventEmitter.removeAllListeners('callback');
      idp2EventEmitter.removeAllListeners('accessor_encrypt_callback');
      rpEventEmitter.removeAllListeners('callback');
      as1EventEmitter.removeAllListeners('callback');
    });
  });
});
