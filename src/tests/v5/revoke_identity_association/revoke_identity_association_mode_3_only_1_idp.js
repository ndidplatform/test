import { expect } from 'chai';
import forge from 'node-forge';
import uuidv4 from 'uuid/v4';

import { idp2Available } from '../..';
import * as rpApi from '../../../api/v5/rp';
import * as idpApi from '../../../api/v5/idp';
import * as asApi from '../../../api/v5/as';
import * as commonApi from '../../../api/v5/common';
import * as identityApi from '../../../api/v5/identity';
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

describe('IdP (idp1) revoke identity association (identity associated with one idp mode 3) test', function() {
  let namespace = 'citizen_id';
  let identifier = uuidv4();
  const keypair = forge.pki.rsa.generateKeyPair(2048);
  const accessorPrivateKey = forge.pki.privateKeyToPem(keypair.privateKey);
  const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);

  const referenceId = generateReferenceId();

  const createIdentityResultPromise = createEventPromise();

  let accessorId;
  let referenceGroupCode;

  before(function() {
    idp1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'create_identity_result' &&
        callbackData.reference_id === referenceId
      ) {
        createIdentityResultPromise.resolve(callbackData);
      }
    });
  });

  it('Before create identity this sid should not exist on platform ', async function() {
    const response = await identityApi.getIdentityInfo('idp1', {
      namespace,
      identifier,
    });
    expect(response.status).to.equal(404);
  });

  it('Before create identity this sid should not associated with idp1 ', async function() {
    const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
      namespace,
      identifier,
    });
    const idpNodes = await response.json();
    const idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
    expect(idpNode).to.be.an.undefined;
  });

  it('Before create identity should not get identity ial', async function() {
    const response = await identityApi.getIdentityIal('idp1', {
      namespace,
      identifier,
    });
    expect(response.status).to.equal(404);
  });

  it('Should create identity request (mode 3) successfully', async function() {
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
    expect(responseBody).not.include.keys('request_id');
    expect(responseBody.exist).to.equal(false);

    accessorId = responseBody.accessor_id;
  });

  it('Identity should be created successfully', async function() {
    this.timeout(15000);
    const createIdentityResult = await createIdentityResultPromise.promise;
    expect(createIdentityResult).to.deep.include({
      reference_id: referenceId,
      success: true,
    });

    expect(createIdentityResult.reference_group_code).to.be.a('string').that.is
      .not.empty;

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

  it('After create identity this sid should be existing on platform ', async function() {
    const response = await identityApi.getIdentityInfo('idp1', {
      namespace,
      identifier,
    });
    expect(response.status).to.equal(200);
    const responseBody = await response.json();
    expect(responseBody.reference_group_code).to.equal(referenceGroupCode);
  });

  it('After create identity should get identity ial successfully', async function() {
    const response = await identityApi.getIdentityIal('idp1', {
      namespace,
      identifier,
    });
    expect(response.status).to.equal(200);
    const responseBody = await response.json();
    expect(responseBody.ial).to.equal(2.3);
  });

  after(function() {
    idp1EventEmitter.removeAllListeners('callback');
  });

  describe('IdP (idp1) revoke identity association (mode 3) test', function() {
    const requestMessage =
      'revoke identity association consent request custom message ข้อความสำหรับขอเพิกถอนความสัมพันธ์กับ idp1 บนระบบ';

    const referenceId = generateReferenceId();
    const idp1ReferenceId = generateReferenceId();

    const incomingRequestPromise = createEventPromise();
    const responseResultPromise = createEventPromise();
    const accessorEncryptPromise = createEventPromise();
    const revokeIdentityAssociationResultPromise = createEventPromise();
    const revokeIdentityAssociationRequestResultPromise = createEventPromise();

    let requestId;
    let identityForResponse;
    let responseAccessorId;
    let requestMessagePaddedHash;

    before(function() {
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
          callbackData.type === 'revoke_identity_association_request_result' &&
          callbackData.reference_id === referenceId
        ) {
          revokeIdentityAssociationRequestResultPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'revoke_identity_association_result' &&
          callbackData.reference_id === referenceId
        ) {
          revokeIdentityAssociationResultPromise.resolve(callbackData);
        }
      });

      idp1EventEmitter.on('accessor_encrypt_callback', function(callbackData) {
        if (callbackData.request_id === requestId) {
          accessorEncryptPromise.resolve(callbackData);
        }
      });
    });

    it('IdP (idp1) should revoke identity association successfully', async function() {
      this.timeout(10000);
      const response = await identityApi.revokeIdentityAssociation('idp1', {
        namespace: namespace,
        identifier: identifier,
        reference_id: referenceId,
        callback_url: config.IDP1_CALLBACK_URL,
        request_message: requestMessage,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.request_id).to.be.a('string').that.is.not.empty;

      requestId = responseBody.request_id;

      const revokeIdentityAssociationRequestResult = await revokeIdentityAssociationRequestResultPromise.promise;
      expect(revokeIdentityAssociationRequestResult).to.deep.include({
        reference_id: referenceId,
        request_id: requestId,
        success: true,
      });
      expect(
        revokeIdentityAssociationRequestResult.creation_block_height,
      ).to.be.a('string');
      const splittedCreationBlockHeight = revokeIdentityAssociationRequestResult.creation_block_height.split(
        ':',
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('IdP should get request_id by reference_id while request is unfinished (not closed or timed out) successfully', async function() {
      this.timeout(10000);
      const response = await identityApi.getRequestIdByReferenceId('idp1', {
        reference_id: referenceId,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.deep.equal({
        request_id: requestId,
      });
    });

    it('idp1 should receive revoke identity association request', async function() {
      this.timeout(15000);
      const incomingRequest = await incomingRequestPromise.promise;
      expect(incomingRequest).to.deep.include({
        mode: 3,
        request_id: requestId,
        reference_group_code: referenceGroupCode,
        request_message: requestMessage,
        request_message_hash: hash(
          requestMessage + incomingRequest.request_message_salt,
        ),
        requester_node_id: 'idp1',
        min_ial: 1.1,
        min_aal: 1,
        data_request_list: [],
      });
      expect(incomingRequest.creation_time).to.be.a('number');
      expect(incomingRequest.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
        ':',
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
      expect(incomingRequest.request_timeout).to.be.a('number');
    });

    it('IdP should get request_message_padded_hash successfully', async function() {
      this.timeout(15000);

      identityForResponse = db.idp1Identities.find(
        identity =>
          identity.namespace === namespace &&
          identity.identifier === identifier &&
          identity.mode === 3,
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

    it('IdP should create response (accept) successfully', async function() {
      this.timeout(10000);

      let accessorPrivateKey =
        identityForResponse.accessors[0].accessorPrivateKey;

      const signature = createResponseSignature(
        accessorPrivateKey,
        requestMessagePaddedHash,
      );

      const response = await idpApi.createResponse('idp1', {
        reference_id: idp1ReferenceId,
        callback_url: config.IDP1_CALLBACK_URL,
        request_id: requestId,
        ial: 2.3,
        aal: 3,
        status: 'accept',
        accessor_id: accessorId,
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
    //     accessor_id: accessorId,
    //     key_type: 'RSA',
    //     padding: 'none',
    //     reference_id: idp1ReferenceId,
    //     request_id: requestId,
    //   });

    //   expect(accessorEncryptParams.request_message_padded_hash).to.be.a(
    //     'string'
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

    it('Identity association should be revoked successfully', async function() {
      this.timeout(10000);
      const revokeIdentityAssociationResult = await revokeIdentityAssociationResultPromise.promise;
      expect(revokeIdentityAssociationResult).to.deep.include({
        reference_id: referenceId,
        success: true,
      });
      await wait(3000);
    });

    it('IdP should get response status code 404 when get request_id by reference_id after request is finished (closed)', async function() {
      this.timeout(10000);
      const response = await identityApi.getRequestIdByReferenceId('idp1', {
        reference_id: referenceId,
      });
      expect(response.status).to.equal(404);
    });

    it('After revoked identity association should query idp that associate with this sid not found', async function() {
      const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
        namespace,
        identifier,
      });
      expect(response.status).equal(200);
      const idpNodes = await response.json();
      const idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
      expect(idpNode).to.be.undefined;
    });

    after(function() {
      idp1EventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
      idp2EventEmitter.removeAllListeners('identity_notification_callback');
    });

    describe('RP create request (mode 3) to idp that revoked identity association', function() {
      const rpReferenceId = generateReferenceId();

      const createRequestResultPromise = createEventPromise(); // RP
      const requestStatusPendingPromise = createEventPromise(); // RP

      const requestStatusConfirmedPromise = createEventPromise(); // RP
      const requestStatusSignedDataPromise = createEventPromise(); // RP
      const requestStatusCompletedPromise = createEventPromise(); // RP
      const requestClosedPromise = createEventPromise(); // RP

      let createRequestParams;

      let requestId;

      const requestStatusUpdates = [];

      before(async function() {
        this.timeout(20000);
        createRequestParams = {
          reference_id: rpReferenceId,
          callback_url: config.RP_CALLBACK_URL,
          mode: 3,
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
          request_message: 'Test request message (data request) (mode 3)',
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
            requestStatusUpdates.push(callbackData);
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
      });

      it('RP should create a request unsuccessfully', async function() {
        this.timeout(10000);
        const response = await rpApi.createRequest('rp1', createRequestParams);
        const responseBody = await response.json();
        expect(response.status).to.equal(400);
        expect(responseBody.error.code).to.equal(20005);
      });

      after(function() {
        let identityIndex = db.idp1Identities.findIndex(
          identity =>
            identity.namespace === namespace &&
            identity.identifier === identifier,
        );
        db.idp1Identities.splice(identityIndex, 1);

        rpEventEmitter.removeAllListeners('callback');
      });
    });
  });

  describe('IdP (idp1) create identity after revoke identity association (provide old accessor id) test', function() {
    const keypair = forge.pki.rsa.generateKeyPair(2048);
    const accessorPrivateKey = forge.pki.privateKeyToPem(keypair.privateKey);
    const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);

    const referenceId = generateReferenceId();

    const createIdentityResultPromise = createEventPromise();

    let referenceGroupCode;

    before(function() {
      idp1EventEmitter.on('callback', function(callbackData) {
        if (
          callbackData.type === 'create_identity_result' &&
          callbackData.reference_id === referenceId
        ) {
          createIdentityResultPromise.resolve(callbackData);
        }
      });
    });

    it('Before create identity this sid should exist on platform ', async function() {
      const response = await identityApi.getIdentityInfo('idp1', {
        namespace,
        identifier,
      });
      expect(response.status).to.equal(200);
    });

    it('Before create identity this sid should not associated with idp1 ', async function() {
      const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
        namespace,
        identifier,
      });
      const idpNodes = await response.json();
      const idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
      expect(idpNode).to.be.an.undefined;
    });

    it('Before create identity should not get identity ial', async function() {
      const response = await identityApi.getIdentityIal('idp1', {
        namespace,
        identifier,
      });
      expect(response.status).to.equal(404);
    });

    it('Should create identity request (mode 3) successfully', async function() {
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
        accessor_id: accessorId,
        ial: 2.3,
        mode: 3,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;
      expect(responseBody).not.include.keys('request_id');
      expect(responseBody.exist).to.equal(true);

      //accessorId = responseBody.accessor_id;
    });

    it('Identity should be created successfully', async function() {
      this.timeout(15000);
      const createIdentityResult = await createIdentityResultPromise.promise;
      expect(createIdentityResult).to.deep.include({
        reference_id: referenceId,
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
      await wait(3000);
    });

    it('After create identity this sid should be existing on platform ', async function() {
      const response = await identityApi.getIdentityInfo('idp1', {
        namespace,
        identifier,
      });
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      expect(responseBody.reference_group_code).to.equal(referenceGroupCode);
    });

    it('After create identity should get identity ial successfully', async function() {
      const response = await identityApi.getIdentityIal('idp1', {
        namespace,
        identifier,
      });
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      expect(responseBody.ial).to.equal(2.3);
    });

    after(function() {
      idp1EventEmitter.removeAllListeners('callback');
    });

    describe('Create request after create identity at idp that is revoked identity association before test', function() {
      const rpReferenceId = generateReferenceId();
      const idpReferenceId = generateReferenceId();
      const asReferenceId = generateReferenceId();

      const createRequestResultPromise = createEventPromise(); // RP
      const requestStatusPendingPromise = createEventPromise(); // RP
      const incomingRequestPromise = createEventPromise(); // IDP
      const responseResultPromise = createEventPromise(); // IDP
      const accessorEncryptPromise = createEventPromise(); // IDP
      const requestStatusConfirmedPromise = createEventPromise(); // RP
      const dataRequestReceivedPromise = createEventPromise(); // AS
      const sendDataResultPromise = createEventPromise(); // AS
      const requestStatusSignedDataPromise = createEventPromise(); // RP
      const requestStatusCompletedPromise = createEventPromise(); // RP
      const requestClosedPromise = createEventPromise(); // RP

      const idp_requestStatusPendingPromise = createEventPromise();
      const idp_requestStatusConfirmedPromise = createEventPromise();
      const idp_requestStatusSignedDataPromise = createEventPromise();
      const idp_requestStatusCompletedPromise = createEventPromise();
      const idp_requestClosedPromise = createEventPromise();

      const as_requestStatusConfirmedPromise = createEventPromise();
      const as_requestStatusSignedDataPromise = createEventPromise();
      const as_requestStatusCompletedPromise = createEventPromise();
      const as_requestClosedPromise = createEventPromise();

      let createRequestParams;
      const data = JSON.stringify({
        test: 'test',
        withEscapedChar: 'test|fff||ss\\|NN\\\\|',
        arr: [1, 2, 3],
      });

      let requestId;
      let requestMessageSalt;
      let requestMessageHash;
      let responseAccessorId;
      let identityForResponse;
      let requestMessagePaddedHash;

      const requestStatusUpdates = [];
      const idp_requestStatusUpdates = [];
      const as_requestStatusUpdates = [];
      let lastStatusUpdateBlockHeight;

      before(function() {
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
          request_message: 'Test request message (data request) (mode 2)',
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
            requestStatusUpdates.push(callbackData);
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
            callbackData.type === 'incoming_request' &&
            callbackData.request_id === requestId
          ) {
            incomingRequestPromise.resolve(callbackData);
          } else if (
            callbackData.type === 'response_result' &&
            callbackData.reference_id === idpReferenceId
          ) {
            responseResultPromise.resolve(callbackData);
          } else if (
            callbackData.type === 'request_status' &&
            callbackData.request_id === requestId
          ) {
            idp_requestStatusUpdates.push(callbackData);
            if (callbackData.status === 'pending') {
              idp_requestStatusPendingPromise.resolve(callbackData);
            } else if (callbackData.status === 'confirmed') {
              if (callbackData.service_list[0].signed_data_count === 1) {
                idp_requestStatusSignedDataPromise.resolve(callbackData);
              } else {
                idp_requestStatusConfirmedPromise.resolve(callbackData);
              }
            } else if (callbackData.status === 'completed') {
              if (callbackData.closed) {
                idp_requestClosedPromise.resolve(callbackData);
              } else {
                idp_requestStatusCompletedPromise.resolve(callbackData);
              }
            }
          }
        });

        idp1EventEmitter.on('accessor_encrypt_callback', function(
          callbackData,
        ) {
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
          } else if (
            callbackData.type === 'request_status' &&
            callbackData.request_id === requestId
          ) {
            as_requestStatusUpdates.push(callbackData);
            if (callbackData.status === 'confirmed') {
              if (callbackData.service_list[0].signed_data_count === 1) {
                as_requestStatusSignedDataPromise.resolve(callbackData);
              } else {
                as_requestStatusConfirmedPromise.resolve(callbackData);
              }
            } else if (callbackData.status === 'completed') {
              if (callbackData.closed) {
                as_requestClosedPromise.resolve(callbackData);
              } else {
                as_requestStatusCompletedPromise.resolve(callbackData);
              }
            }
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
        expect(createRequestResult.creation_block_height).to.be.a('string');
        const splittedCreationBlockHeight = createRequestResult.creation_block_height.split(
          ':',
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
          lastStatusUpdateBlockHeight,
        );
        lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
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
          },
        );
        expect(incomingRequest).to.deep.include({
          node_id: 'idp1',
          type: 'incoming_request',
          mode: createRequestParams.mode,
          request_id: requestId,
          request_message: createRequestParams.request_message,
          request_message_hash: hash(
            createRequestParams.request_message +
              incomingRequest.request_message_salt,
          ),
          requester_node_id: 'rp1',
          min_ial: createRequestParams.min_ial,
          min_aal: createRequestParams.min_aal,
          data_request_list: dataRequestListWithoutParams,
          request_timeout: createRequestParams.request_timeout,
        });
        expect(incomingRequest.reference_group_code).to.be.a('string').that.is
          .not.empty;
        expect(incomingRequest.request_message_salt).to.be.a('string').that.is
          .not.empty;
        expect(incomingRequest.creation_time).to.be.a('number');
        expect(incomingRequest.creation_block_height).to.be.a('string');
        const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
          ':',
        );
        expect(splittedCreationBlockHeight).to.have.lengthOf(2);
        expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
        expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);

        requestMessageSalt = incomingRequest.request_message_salt;
        requestMessageHash = incomingRequest.request_message_hash;
      });

      it('IdP should get request_message_padded_hash successfully', async function() {
        this.timeout(15000);
        identityForResponse = db.idp1Identities.find(
          identity =>
            identity.namespace === namespace &&
            identity.identifier === identifier,
        );

        let identity = identityForResponse.accessors.find(
          accessor => accessor.accessorId === accessorId,
        );

        responseAccessorId = identity.accessorId;
        let accessorPublicKey = identity.accessorPublicKey;

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

      it('IdP should create response (accept) successfully', async function() {
        this.timeout(10000);

        let identity = identityForResponse.accessors.find(
          accessor => accessor.accessorId === accessorId,
        );

        let accessorPrivateKey = identity.accessorPrivateKey;

        const signature = createResponseSignature(
          accessorPrivateKey,
          requestMessagePaddedHash,
        );

        const response = await idpApi.createResponse('idp1', {
          reference_id: idpReferenceId,
          callback_url: config.IDP1_CALLBACK_URL,
          request_id: requestId,
          ial: 2.3,
          aal: 3,
          status: 'accept',
          accessor_id: accessorId,
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
      //     accessor_id: accessorId,
      //     key_type: 'RSA',
      //     padding: 'none',
      //     reference_id: idpReferenceId,
      //     request_id: requestId,
      //   });

      //   expect(accessorEncryptParams.request_message_padded_hash).to.be.a(
      //     'string',
      //   ).that.is.not.empty;
      // });

      it('IdP shoud receive callback create response result with success = true', async function() {
        const responseResult = await responseResultPromise.promise;
        expect(responseResult).to.deep.include({
          node_id: 'idp1',
          type: 'response_result',
          reference_id: idpReferenceId,
          request_id: requestId,
          success: true,
        });
      });

      it('RP should receive confirmed request status with valid proofs', async function() {
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
              idp_id: 'idp1',
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
          lastStatusUpdateBlockHeight,
        );
        lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
      });

      it('AS should receive data request', async function() {
        this.timeout(15000);
        const dataRequest = await dataRequestReceivedPromise.promise;
        expect(dataRequest).to.deep.include({
          type: 'data_request',
          request_id: requestId,
          mode: createRequestParams.mode,
          namespace,
          identifier,
          service_id: createRequestParams.data_request_list[0].service_id,
          request_params:
            createRequestParams.data_request_list[0].request_params,
          requester_node_id: 'rp1',
          max_ial: 2.3,
          max_aal: 3,

          request_timeout: createRequestParams.request_timeout,
        });
        expect(dataRequest.response_signature_list).to.have.lengthOf(1);
        expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is
          .not.empty;
        expect(dataRequest.creation_time).to.be.a('number');
        expect(dataRequest.creation_block_height).to.be.a('string');
        const splittedCreationBlockHeight = dataRequest.creation_block_height.split(
          ':',
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
          node_id: 'as1',
          type: 'send_data_result',
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
          lastStatusUpdateBlockHeight,
        );
        lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
      });

      it('IdP should receive request status with signed data count = 1', async function() {
        this.timeout(15000);
        const requestStatus = await idp_requestStatusSignedDataPromise.promise;
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
        expect(parseInt(splittedBlockHeight[1])).to.equal(
          lastStatusUpdateBlockHeight,
        );
      });

      it('AS should receive request status with signed data count = 1', async function() {
        this.timeout(15000);
        const requestStatus = await as_requestStatusSignedDataPromise.promise;
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
        expect(parseInt(splittedBlockHeight[1])).to.equal(
          lastStatusUpdateBlockHeight,
        );
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
          lastStatusUpdateBlockHeight,
        );
        lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
      });

      it('IdP should receive completed request status with received data count = 1', async function() {
        this.timeout(15000);
        const requestStatus = await idp_requestStatusCompletedPromise.promise;
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
        expect(parseInt(splittedBlockHeight[1])).to.equal(
          lastStatusUpdateBlockHeight,
        );
      });

      it('AS should receive completed request status with received data count = 1', async function() {
        this.timeout(15000);
        const requestStatus = await as_requestStatusCompletedPromise.promise;
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
        expect(parseInt(splittedBlockHeight[1])).to.equal(
          lastStatusUpdateBlockHeight,
        );
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
          lastStatusUpdateBlockHeight,
        );
        lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
      });

      it('IdP should receive request closed status', async function() {
        this.timeout(10000);
        const requestStatus = await idp_requestClosedPromise.promise;
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
        expect(parseInt(splittedBlockHeight[1])).to.equal(
          lastStatusUpdateBlockHeight,
        );
      });

      it('AS should receive request closed status', async function() {
        this.timeout(10000);
        const requestStatus = await as_requestClosedPromise.promise;
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
        expect(parseInt(splittedBlockHeight[1])).to.equal(
          lastStatusUpdateBlockHeight,
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

      it('RP should receive 5 request status updates', function() {
        expect(requestStatusUpdates).to.have.lengthOf(5);
      });

      it('IdP should receive 4 or 5 request status updates', function() {
        expect(idp_requestStatusUpdates).to.have.length.within(4, 5);
      });

      it('AS should receive 3 or 4 request status updates', function() {
        expect(as_requestStatusUpdates).to.have.length.within(3, 4);
      });

      it('RP should remove data requested from AS successfully', async function() {
        const response = await rpApi.removeDataRequestedFromAS('rp1', {
          request_id: requestId,
        });
        expect(response.status).to.equal(204);
      });

      it('RP should have no saved data requested from AS left after removal', async function() {
        const response = await rpApi.getDataFromAS('rp1', {
          requestId,
        });
        const responseBody = await response.json();
        expect(response.status).to.equal(200);
        expect(responseBody).to.be.an('array').that.is.empty;
      });

      it('RP should have and able to get saved private messages', async function() {
        const response = await commonApi.getPrivateMessages('rp1', {
          request_id: requestId,
        });
        const responseBody = await response.json();
        expect(response.status).to.equal(200);
        expect(responseBody).to.be.an('array').that.is.not.empty;
      });

      it('RP should remove saved private messages successfully', async function() {
        const response = await commonApi.removePrivateMessages('rp1', {
          request_id: requestId,
        });
        expect(response.status).to.equal(204);
      });

      it('RP should have no saved private messages left after removal', async function() {
        const response = await commonApi.getPrivateMessages('rp1', {
          request_id: requestId,
        });
        const responseBody = await response.json();
        expect(response.status).to.equal(200);
        expect(responseBody).to.be.an('array').that.is.empty;
      });

      it('IdP should have and able to get saved private messages', async function() {
        const response = await commonApi.getPrivateMessages('idp1', {
          request_id: requestId,
        });
        const responseBody = await response.json();
        expect(response.status).to.equal(200);
        expect(responseBody).to.be.an('array').that.is.not.empty;
      });

      it('IdP should remove saved private messages successfully', async function() {
        const response = await commonApi.removePrivateMessages('idp1', {
          request_id: requestId,
        });
        expect(response.status).to.equal(204);
      });

      it('IdP should have no saved private messages left after removal', async function() {
        const response = await commonApi.getPrivateMessages('idp1', {
          request_id: requestId,
        });
        const responseBody = await response.json();
        expect(response.status).to.equal(200);
        expect(responseBody).to.be.an('array').that.is.empty;
      });

      it('AS should have and able to get saved private messages', async function() {
        const response = await commonApi.getPrivateMessages('as1', {
          request_id: requestId,
        });
        const responseBody = await response.json();
        expect(response.status).to.equal(200);
        expect(responseBody).to.be.an('array').that.is.not.empty;
      });

      it('AS should remove saved private messages successfully', async function() {
        const response = await commonApi.removePrivateMessages('as1', {
          request_id: requestId,
        });
        expect(response.status).to.equal(204);
      });

      it('AS should have no saved private messages left after removal', async function() {
        const response = await commonApi.getPrivateMessages('as1', {
          request_id: requestId,
        });
        const responseBody = await response.json();
        expect(response.status).to.equal(200);
        expect(responseBody).to.be.an('array').that.is.empty;
      });

      after(function() {
        // let identityIndex = db.idp1Identities.findIndex(
        //   identity =>
        //     identity.namespace === namespace &&
        //     identity.identifier === identifier
        // );
        // db.idp1Identities.splice(identityIndex, 1);

        rpEventEmitter.removeAllListeners('callback');
        idp1EventEmitter.removeAllListeners('callback');
        idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
        as1EventEmitter.removeAllListeners('callback');
      });
    });
  });

  describe('IdP (idp1) revoke identity association (mode 3) test', function() {
    const requestMessage =
      'revoke identity association consent request custom message ข้อความสำหรับขอเพิกถอนความสัมพันธ์กับ idp1 บนระบบ';

    const referenceId = generateReferenceId();
    const idp1ReferenceId = generateReferenceId();

    const incomingRequestPromise = createEventPromise();
    const responseResultPromise = createEventPromise();
    const accessorEncryptPromise = createEventPromise();
    const revokeIdentityAssociationResultPromise = createEventPromise();
    const revokeIdentityAssociationRequestResultPromise = createEventPromise();

    let requestId;
    let identityForResponse;
    let responseAccessorId;
    let requestMessagePaddedHash;

    before(function() {
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
          callbackData.type === 'revoke_identity_association_request_result' &&
          callbackData.reference_id === referenceId
        ) {
          revokeIdentityAssociationRequestResultPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'revoke_identity_association_result' &&
          callbackData.reference_id === referenceId
        ) {
          revokeIdentityAssociationResultPromise.resolve(callbackData);
        }
      });

      idp1EventEmitter.on('accessor_encrypt_callback', function(callbackData) {
        if (callbackData.request_id === requestId) {
          accessorEncryptPromise.resolve(callbackData);
        }
      });
    });

    it('IdP (idp1) should revoke identity association successfully', async function() {
      this.timeout(10000);
      const response = await identityApi.revokeIdentityAssociation('idp1', {
        namespace: namespace,
        identifier: identifier,
        reference_id: referenceId,
        callback_url: config.IDP1_CALLBACK_URL,
        request_message: requestMessage,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.request_id).to.be.a('string').that.is.not.empty;

      requestId = responseBody.request_id;

      const revokeIdentityAssociationRequestResult = await revokeIdentityAssociationRequestResultPromise.promise;
      expect(revokeIdentityAssociationRequestResult).to.deep.include({
        reference_id: referenceId,
        request_id: requestId,
        success: true,
      });
      expect(
        revokeIdentityAssociationRequestResult.creation_block_height,
      ).to.be.a('string');
      const splittedCreationBlockHeight = revokeIdentityAssociationRequestResult.creation_block_height.split(
        ':',
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('IdP should get request_id by reference_id while request is unfinished (not closed or timed out) successfully', async function() {
      this.timeout(10000);
      const response = await identityApi.getRequestIdByReferenceId('idp1', {
        reference_id: referenceId,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.deep.equal({
        request_id: requestId,
      });
    });

    it('idp1 should receive revoke identity association request', async function() {
      this.timeout(15000);
      const incomingRequest = await incomingRequestPromise.promise;
      expect(incomingRequest).to.deep.include({
        mode: 3,
        request_id: requestId,
        reference_group_code: referenceGroupCode,
        request_message: requestMessage,
        request_message_hash: hash(
          requestMessage + incomingRequest.request_message_salt,
        ),
        requester_node_id: 'idp1',
        min_ial: 1.1,
        min_aal: 1,
        data_request_list: [],
      });
      expect(incomingRequest.creation_time).to.be.a('number');
      expect(incomingRequest.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
        ':',
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
      expect(incomingRequest.request_timeout).to.be.a('number');
    });

    it('IdP should get request_message_padded_hash successfully', async function() {
      this.timeout(15000);
      identityForResponse = db.idp1Identities.find(
        identity =>
          identity.namespace === namespace &&
          identity.identifier === identifier &&
          identity.mode === 3,
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

    it('IdP should create response (accept) successfully', async function() {
      this.timeout(10000);

      let accessorPrivateKey =
        identityForResponse.accessors[0].accessorPrivateKey;

      const signature = createResponseSignature(
        accessorPrivateKey,
        requestMessagePaddedHash,
      );

      const response = await idpApi.createResponse('idp1', {
        reference_id: idp1ReferenceId,
        callback_url: config.IDP1_CALLBACK_URL,
        request_id: requestId,
        ial: 2.3,
        aal: 3,
        status: 'accept',
        accessor_id: accessorId,
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
    //     accessor_id: accessorId,
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

    it('Identity association should be revoked successfully', async function() {
      this.timeout(10000);
      const revokeIdentityAssociationResult = await revokeIdentityAssociationResultPromise.promise;
      expect(revokeIdentityAssociationResult).to.deep.include({
        reference_id: referenceId,
        success: true,
      });
      await wait(3000);
    });

    it('IdP should get response status code 404 when get request_id by reference_id after request is finished (closed)', async function() {
      this.timeout(10000);
      const response = await identityApi.getRequestIdByReferenceId('idp1', {
        reference_id: referenceId,
      });
      expect(response.status).to.equal(404);
    });

    it('After revoked identity association should query idp that associate with this sid not found', async function() {
      const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
        namespace,
        identifier,
      });
      expect(response.status).equal(200);
      const idpNodes = await response.json();
      const idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
      expect(idpNode).to.be.undefined;
    });

    after(function() {
      idp1EventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
      idp2EventEmitter.removeAllListeners('identity_notification_callback');
    });

    describe('RP create request (mode 3) to idp that revoked identity association', function() {
      const rpReferenceId = generateReferenceId();

      const createRequestResultPromise = createEventPromise(); // RP
      const requestStatusPendingPromise = createEventPromise(); // RP

      const requestStatusConfirmedPromise = createEventPromise(); // RP
      const requestStatusSignedDataPromise = createEventPromise(); // RP
      const requestStatusCompletedPromise = createEventPromise(); // RP
      const requestClosedPromise = createEventPromise(); // RP

      let createRequestParams;

      let requestId;

      const requestStatusUpdates = [];

      before(async function() {
        this.timeout(20000);
        createRequestParams = {
          reference_id: rpReferenceId,
          callback_url: config.RP_CALLBACK_URL,
          mode: 3,
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
          request_message: 'Test request message (data request) (mode 2)',
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
            requestStatusUpdates.push(callbackData);
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
      });

      it('RP should create a request unsuccessfully', async function() {
        this.timeout(10000);
        const response = await rpApi.createRequest('rp1', createRequestParams);
        const responseBody = await response.json();
        expect(response.status).to.equal(400);
        expect(responseBody.error.code).to.equal(20005);
      });

      after(function() {
        // let identityIndex = db.idp1Identities.findIndex(
        //   identity =>
        //     identity.namespace === namespace &&
        //     identity.identifier === identifier
        // );
        // db.idp1Identities.splice(identityIndex, 1);

        rpEventEmitter.removeAllListeners('callback');
      });
    });
  });

  describe('IdP (idp1) create identity after revoke identity association (provide new accessor id) test', function() {
    const keypair = forge.pki.rsa.generateKeyPair(2048);
    const accessorPrivateKey = forge.pki.privateKeyToPem(keypair.privateKey);
    const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);

    const referenceId = generateReferenceId();

    const createIdentityResultPromise = createEventPromise();

    let referenceGroupCode;
    let revokedAccessorId;
    let accessorId;

    before(function() {
      let identityIndex = db.idp1Identities.findIndex(
        identity =>
          identity.namespace === namespace &&
          identity.identifier === identifier,
      );

      revokedAccessorId =
        db.idp1Identities[identityIndex].accessors[0].accessorId;

      db.idp1Identities.splice(identityIndex, 1);

      idp1EventEmitter.on('callback', function(callbackData) {
        if (
          callbackData.type === 'create_identity_result' &&
          callbackData.reference_id === referenceId
        ) {
          createIdentityResultPromise.resolve(callbackData);
        }
      });
    });

    it('Before create identity this sid should exist on platform ', async function() {
      const response = await identityApi.getIdentityInfo('idp1', {
        namespace,
        identifier,
      });
      expect(response.status).to.equal(200);
    });

    it('Before create identity this sid should not associated with idp1 ', async function() {
      const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
        namespace,
        identifier,
      });
      const idpNodes = await response.json();
      const idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
      expect(idpNode).to.be.an.undefined;
    });

    it('Before create identity should not get identity ial', async function() {
      const response = await identityApi.getIdentityIal('idp1', {
        namespace,
        identifier,
      });
      expect(response.status).to.equal(404);
    });

    it('Should create identity request (mode 3) successfully', async function() {
      this.timeout(15000);
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
      expect(responseBody).not.include.keys('request_id');
      expect(responseBody.exist).to.equal(true);

      accessorId = responseBody.accessor_id;
    });

    it('Identity should be created successfully', async function() {
      this.timeout(15000);
      const createIdentityResult = await createIdentityResultPromise.promise;
      expect(createIdentityResult).to.deep.include({
        reference_id: referenceId,
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
      await wait(3000);
    });

    it('After create identity this sid should be existing on platform ', async function() {
      const response = await identityApi.getIdentityInfo('idp1', {
        namespace,
        identifier,
      });
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      expect(responseBody.reference_group_code).to.equal(referenceGroupCode);
    });

    it('After create identity should get identity ial successfully', async function() {
      const response = await identityApi.getIdentityIal('idp1', {
        namespace,
        identifier,
      });
      expect(response.status).to.equal(200);
      const responseBody = await response.json();
      expect(responseBody.ial).to.equal(2.3);
    });

    after(function() {
      idp1EventEmitter.removeAllListeners('callback');
    });

    describe('Create request after create identity at idp that is revoked identity association before test', function() {
      const rpReferenceId = generateReferenceId();
      const idpReferenceId = generateReferenceId();
      const asReferenceId = generateReferenceId();

      const createRequestResultPromise = createEventPromise(); // RP
      const requestStatusPendingPromise = createEventPromise(); // RP
      const incomingRequestPromise = createEventPromise(); // IDP
      const responseResultPromise = createEventPromise(); // IDP
      const accessorEncryptPromise = createEventPromise(); // IDP
      const requestStatusConfirmedPromise = createEventPromise(); // RP
      const dataRequestReceivedPromise = createEventPromise(); // AS
      const sendDataResultPromise = createEventPromise(); // AS
      const requestStatusSignedDataPromise = createEventPromise(); // RP
      const requestStatusCompletedPromise = createEventPromise(); // RP
      const requestClosedPromise = createEventPromise(); // RP

      const idp_requestStatusPendingPromise = createEventPromise();
      const idp_requestStatusConfirmedPromise = createEventPromise();
      const idp_requestStatusSignedDataPromise = createEventPromise();
      const idp_requestStatusCompletedPromise = createEventPromise();
      const idp_requestClosedPromise = createEventPromise();

      const as_requestStatusConfirmedPromise = createEventPromise();
      const as_requestStatusSignedDataPromise = createEventPromise();
      const as_requestStatusCompletedPromise = createEventPromise();
      const as_requestClosedPromise = createEventPromise();

      let createRequestParams;
      const data = JSON.stringify({
        test: 'test',
        withEscapedChar: 'test|fff||ss\\|NN\\\\|',
        arr: [1, 2, 3],
      });

      let requestId;
      let requestMessageSalt;
      let requestMessageHash;
      let responseAccessorId;
      let identityForResponse;
      let requestMessagePaddedHash;

      const requestStatusUpdates = [];
      const idp_requestStatusUpdates = [];
      const as_requestStatusUpdates = [];
      let lastStatusUpdateBlockHeight;

      before(function() {
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
          request_message: 'Test request message (data request) (mode 2)',
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
            requestStatusUpdates.push(callbackData);
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
            callbackData.type === 'incoming_request' &&
            callbackData.request_id === requestId
          ) {
            incomingRequestPromise.resolve(callbackData);
          } else if (
            callbackData.type === 'response_result' &&
            callbackData.reference_id === idpReferenceId
          ) {
            responseResultPromise.resolve(callbackData);
          } else if (
            callbackData.type === 'request_status' &&
            callbackData.request_id === requestId
          ) {
            idp_requestStatusUpdates.push(callbackData);
            if (callbackData.status === 'pending') {
              idp_requestStatusPendingPromise.resolve(callbackData);
            } else if (callbackData.status === 'confirmed') {
              if (callbackData.service_list[0].signed_data_count === 1) {
                idp_requestStatusSignedDataPromise.resolve(callbackData);
              } else {
                idp_requestStatusConfirmedPromise.resolve(callbackData);
              }
            } else if (callbackData.status === 'completed') {
              if (callbackData.closed) {
                idp_requestClosedPromise.resolve(callbackData);
              } else {
                idp_requestStatusCompletedPromise.resolve(callbackData);
              }
            }
          }
        });

        idp1EventEmitter.on('accessor_encrypt_callback', function(
          callbackData,
        ) {
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
          } else if (
            callbackData.type === 'request_status' &&
            callbackData.request_id === requestId
          ) {
            as_requestStatusUpdates.push(callbackData);
            if (callbackData.status === 'confirmed') {
              if (callbackData.service_list[0].signed_data_count === 1) {
                as_requestStatusSignedDataPromise.resolve(callbackData);
              } else {
                as_requestStatusConfirmedPromise.resolve(callbackData);
              }
            } else if (callbackData.status === 'completed') {
              if (callbackData.closed) {
                as_requestClosedPromise.resolve(callbackData);
              } else {
                as_requestStatusCompletedPromise.resolve(callbackData);
              }
            }
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
        expect(createRequestResult.creation_block_height).to.be.a('string');
        const splittedCreationBlockHeight = createRequestResult.creation_block_height.split(
          ':',
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
          lastStatusUpdateBlockHeight,
        );
        lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
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
          },
        );
        expect(incomingRequest).to.deep.include({
          node_id: 'idp1',
          type: 'incoming_request',
          mode: createRequestParams.mode,
          request_id: requestId,
          request_message: createRequestParams.request_message,
          request_message_hash: hash(
            createRequestParams.request_message +
              incomingRequest.request_message_salt,
          ),
          requester_node_id: 'rp1',
          min_ial: createRequestParams.min_ial,
          min_aal: createRequestParams.min_aal,
          data_request_list: dataRequestListWithoutParams,
          request_timeout: createRequestParams.request_timeout,
        });
        expect(incomingRequest.reference_group_code).to.be.a('string').that.is
          .not.empty;
        expect(incomingRequest.request_message_salt).to.be.a('string').that.is
          .not.empty;
        expect(incomingRequest.creation_time).to.be.a('number');
        expect(incomingRequest.creation_block_height).to.be.a('string');
        const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
          ':',
        );
        expect(splittedCreationBlockHeight).to.have.lengthOf(2);
        expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
        expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);

        requestMessageSalt = incomingRequest.request_message_salt;
        requestMessageHash = incomingRequest.request_message_hash;
      });

      it('IdP should get request_message_padded_hash successfully', async function() {
        this.timeout(15000);
        identityForResponse = db.idp1Identities.find(
          identity =>
            identity.namespace === namespace &&
            identity.identifier === identifier,
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

      it('IdP should create response with revoked accessor unsuccessfully', async function() {
        this.timeout(10000);

        const response = await idpApi.createResponse('idp1', {
          reference_id: idpReferenceId,
          callback_url: config.IDP1_CALLBACK_URL,
          request_id: requestId,
          ial: 2.3,
          aal: 3,
          status: 'accept',
          accessor_id: revokedAccessorId,
          signature: 'Test signature',
        });
        expect(response.status).to.equal(400);
        const responseBody = await response.json();
        expect(responseBody.error.code).to.equal(20011);
      });

      it('IdP should create response (accept) successfully', async function() {
        this.timeout(10000);

        let accessorPrivateKey =
          identityForResponse.accessors[0].accessorPrivateKey;

        const signature = createResponseSignature(
          accessorPrivateKey,
          requestMessagePaddedHash,
        );

        const response = await idpApi.createResponse('idp1', {
          reference_id: idpReferenceId,
          callback_url: config.IDP1_CALLBACK_URL,
          request_id: requestId,
          ial: 2.3,
          aal: 3,
          status: 'accept',
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
      //     reference_id: idpReferenceId,
      //     request_id: requestId,
      //   });

      //   expect(accessorEncryptParams.request_message_padded_hash).to.be.a(
      //     'string',
      //   ).that.is.not.empty;
      // });

      it('IdP shoud receive callback create response result with success = true', async function() {
        const responseResult = await responseResultPromise.promise;
        expect(responseResult).to.deep.include({
          node_id: 'idp1',
          type: 'response_result',
          reference_id: idpReferenceId,
          request_id: requestId,
          success: true,
        });
      });

      it('RP should receive confirmed request status with valid proofs', async function() {
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
              idp_id: 'idp1',
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
          lastStatusUpdateBlockHeight,
        );
        lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
      });

      it('AS should receive data request', async function() {
        this.timeout(15000);
        const dataRequest = await dataRequestReceivedPromise.promise;
        expect(dataRequest).to.deep.include({
          type: 'data_request',
          request_id: requestId,
          mode: createRequestParams.mode,
          namespace,
          identifier,
          service_id: createRequestParams.data_request_list[0].service_id,
          request_params:
            createRequestParams.data_request_list[0].request_params,
          requester_node_id: 'rp1',
          max_ial: 2.3,
          max_aal: 3,

          request_timeout: createRequestParams.request_timeout,
        });
        expect(dataRequest.response_signature_list).to.have.lengthOf(1);
        expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is
          .not.empty;
        expect(dataRequest.creation_time).to.be.a('number');
        expect(dataRequest.creation_block_height).to.be.a('string');
        const splittedCreationBlockHeight = dataRequest.creation_block_height.split(
          ':',
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
          node_id: 'as1',
          type: 'send_data_result',
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
          lastStatusUpdateBlockHeight,
        );
        lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
      });

      it('IdP should receive request status with signed data count = 1', async function() {
        this.timeout(15000);
        const requestStatus = await idp_requestStatusSignedDataPromise.promise;
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
        expect(parseInt(splittedBlockHeight[1])).to.equal(
          lastStatusUpdateBlockHeight,
        );
      });

      it('AS should receive request status with signed data count = 1', async function() {
        this.timeout(15000);
        const requestStatus = await as_requestStatusSignedDataPromise.promise;
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
        expect(parseInt(splittedBlockHeight[1])).to.equal(
          lastStatusUpdateBlockHeight,
        );
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
          lastStatusUpdateBlockHeight,
        );
        lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
      });

      it('IdP should receive completed request status with received data count = 1', async function() {
        this.timeout(15000);
        const requestStatus = await idp_requestStatusCompletedPromise.promise;
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
        expect(parseInt(splittedBlockHeight[1])).to.equal(
          lastStatusUpdateBlockHeight,
        );
      });

      it('AS should receive completed request status with received data count = 1', async function() {
        this.timeout(15000);
        const requestStatus = await as_requestStatusCompletedPromise.promise;
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
        expect(parseInt(splittedBlockHeight[1])).to.equal(
          lastStatusUpdateBlockHeight,
        );
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
          lastStatusUpdateBlockHeight,
        );
        lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
      });

      it('IdP should receive request closed status', async function() {
        this.timeout(10000);
        const requestStatus = await idp_requestClosedPromise.promise;
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
        expect(parseInt(splittedBlockHeight[1])).to.equal(
          lastStatusUpdateBlockHeight,
        );
      });

      it('AS should receive request closed status', async function() {
        this.timeout(10000);
        const requestStatus = await as_requestClosedPromise.promise;
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
        expect(parseInt(splittedBlockHeight[1])).to.equal(
          lastStatusUpdateBlockHeight,
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

      it('RP should receive 5 request status updates', function() {
        expect(requestStatusUpdates).to.have.lengthOf(5);
      });

      it('IdP should receive 4 or 5 request status updates', function() {
        expect(idp_requestStatusUpdates).to.have.length.within(4, 5);
      });

      it('AS should receive 3 or 4 request status updates', function() {
        expect(as_requestStatusUpdates).to.have.length.within(3, 4);
      });

      it('RP should remove data requested from AS successfully', async function() {
        const response = await rpApi.removeDataRequestedFromAS('rp1', {
          request_id: requestId,
        });
        expect(response.status).to.equal(204);
      });

      it('RP should have no saved data requested from AS left after removal', async function() {
        const response = await rpApi.getDataFromAS('rp1', {
          requestId,
        });
        const responseBody = await response.json();
        expect(response.status).to.equal(200);
        expect(responseBody).to.be.an('array').that.is.empty;
      });

      it('RP should have and able to get saved private messages', async function() {
        const response = await commonApi.getPrivateMessages('rp1', {
          request_id: requestId,
        });
        const responseBody = await response.json();
        expect(response.status).to.equal(200);
        expect(responseBody).to.be.an('array').that.is.not.empty;
      });

      it('RP should remove saved private messages successfully', async function() {
        const response = await commonApi.removePrivateMessages('rp1', {
          request_id: requestId,
        });
        expect(response.status).to.equal(204);
      });

      it('RP should have no saved private messages left after removal', async function() {
        const response = await commonApi.getPrivateMessages('rp1', {
          request_id: requestId,
        });
        const responseBody = await response.json();
        expect(response.status).to.equal(200);
        expect(responseBody).to.be.an('array').that.is.empty;
      });

      it('IdP should have and able to get saved private messages', async function() {
        const response = await commonApi.getPrivateMessages('idp1', {
          request_id: requestId,
        });
        const responseBody = await response.json();
        expect(response.status).to.equal(200);
        expect(responseBody).to.be.an('array').that.is.not.empty;
      });

      it('IdP should remove saved private messages successfully', async function() {
        const response = await commonApi.removePrivateMessages('idp1', {
          request_id: requestId,
        });
        expect(response.status).to.equal(204);
      });

      it('IdP should have no saved private messages left after removal', async function() {
        const response = await commonApi.getPrivateMessages('idp1', {
          request_id: requestId,
        });
        const responseBody = await response.json();
        expect(response.status).to.equal(200);
        expect(responseBody).to.be.an('array').that.is.empty;
      });

      it('AS should have and able to get saved private messages', async function() {
        const response = await commonApi.getPrivateMessages('as1', {
          request_id: requestId,
        });
        const responseBody = await response.json();
        expect(response.status).to.equal(200);
        expect(responseBody).to.be.an('array').that.is.not.empty;
      });

      it('AS should remove saved private messages successfully', async function() {
        const response = await commonApi.removePrivateMessages('as1', {
          request_id: requestId,
        });
        expect(response.status).to.equal(204);
      });

      it('AS should have no saved private messages left after removal', async function() {
        const response = await commonApi.getPrivateMessages('as1', {
          request_id: requestId,
        });
        const responseBody = await response.json();
        expect(response.status).to.equal(200);
        expect(responseBody).to.be.an('array').that.is.empty;
      });

      after(function() {
        let identityIndex = db.idp1Identities.findIndex(
          identity =>
            identity.namespace === namespace &&
            identity.identifier === identifier,
        );
        db.idp1Identities.splice(identityIndex, 1);

        rpEventEmitter.removeAllListeners('callback');
        idp1EventEmitter.removeAllListeners('callback');
        idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
        as1EventEmitter.removeAllListeners('callback');
      });
    });
  });
});
