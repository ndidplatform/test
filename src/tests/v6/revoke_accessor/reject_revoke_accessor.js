import crypto from 'crypto';
import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import * as rpApi from '../../../api/v6/rp';
import * as idpApi from '../../../api/v6/idp';
import * as identityApi from '../../../api/v6/identity';
import * as commonApi from '../../../api/v6/common';
import * as asApi from '../../../api/v6/as';
import {
  idp1EventEmitter,
  rpEventEmitter,
  as1EventEmitter,
} from '../../../callback_server';
import * as db from '../../../db';
import {
  createEventPromise,
  generateReferenceId,
  hash,
  wait,
  createResponseSignature,
} from '../../../utils';
import { randomThaiIdNumber } from '../../../utils/thai_id';
import {
  createIdpIdList,
  createDataRequestList,
  createRequestMessageHash,
  setDataReceived,
  setDataSigned,
} from '../_fragments/fragments_utils';
import {
  receivePendingRequestStatusTest,
  receiveConfirmedRequestStatusTest,
  receiveCompletedRequestStatusTest,
  receiveRequestClosedStatusTest,
} from '../_fragments/common';
import * as config from '../../../config';
import { getAndVerifyRequestMessagePaddedHashTest } from '../_fragments/request_flow_fragments/idp';

describe('Reject revoke accessor test', function () {
  const addAccessorRequestMessage =
    'Add accessor consent request custom message ข้อความสำหรับขอเพิ่ม accessor บนระบบ';

  let namespace = 'citizen_id';
  let identifier = randomThaiIdNumber();
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

  const createIdentityResultPromise = createEventPromise();
  const incomingRequestPromise = createEventPromise();
  const responseResultPromise = createEventPromise();
  const addAccessorRequestResultPromise = createEventPromise();
  const addAccessorResultPromise = createEventPromise();
  const accessorEncryptPromise = createEventPromise();

  let accessorId;
  let accessorId2;
  let requestIdAddAccessor;
  let referenceGroupCode;
  let responseAccessorId;
  let identityForResponse;
  let requestMessagePaddedHash;

  before(function () {
    idp1EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'create_identity_result' &&
        callbackData.reference_id === referenceId
      ) {
        createIdentityResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'add_accessor_request_result' &&
        callbackData.request_id === requestIdAddAccessor
      ) {
        addAccessorRequestResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'add_accessor_result' &&
        callbackData.request_id === requestIdAddAccessor
      ) {
        addAccessorResultPromise.resolve(callbackData);
      }
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestIdAddAccessor
      ) {
        incomingRequestPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.request_id === requestIdAddAccessor
      ) {
        responseResultPromise.resolve(callbackData);
      }
    });

    idp1EventEmitter.on('accessor_encrypt_callback', function (callbackData) {
      if (callbackData.request_id === requestIdAddAccessor) {
        accessorEncryptPromise.resolve(callbackData);
      }
    });
  });

  it('Before create identity this sid should not exist on platform ', async function () {
    const response = await identityApi.getIdentityInfo('idp1', {
      namespace,
      identifier,
    });
    expect(response.status).to.equal(404);
  });

  it('Before create identity this sid should not associated with idp1 ', async function () {
    const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
      namespace,
      identifier,
    });
    const idpNodes = await response.json();
    const idpNode = idpNodes.find((idpNode) => idpNode.node_id === 'idp1');
    expect(idpNode).to.be.an.undefined;
  });

  it('Before create identity should not get identity ial', async function () {
    const response = await identityApi.getIdentityIal('idp1', {
      namespace,
      identifier,
    });
    expect(response.status).to.equal(404);
  });

  it('Should create identity request (mode 3) successfully', async function () {
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
      lial: false,
      laal: false,
      mode: 3,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.exist).to.equal(false);

    accessorId = responseBody.accessor_id;
  });

  it('Identity should be created successfully', async function () {
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
    const idpNode = idpNodes.find((idpNode) => idpNode.node_id === 'idp1');
    expect(idpNode).to.not.be.undefined;
    expect(idpNode.mode_list).to.be.an('array').that.include(2, 3);

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

  it('After create identity this sid should be existing on platform ', async function () {
    const response = await identityApi.getIdentityInfo('idp1', {
      namespace,
      identifier,
    });
    expect(response.status).to.equal(200);
    const responseBody = await response.json();
    expect(responseBody.reference_group_code).to.equal(referenceGroupCode);
  });

  it('After create identity should get identity ial successfully', async function () {
    const response = await identityApi.getIdentityIal('idp1', {
      namespace,
      identifier,
    });
    expect(response.status).to.equal(200);
    const responseBody = await response.json();
    expect(responseBody.ial).to.equal(2.3);
  });

  it('Should add accessor successfully', async function () {
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

    requestIdAddAccessor = responseBody.request_id;
    accessorId2 = responseBody.accessor_id;

    const addAccessorRequestResult =
      await addAccessorRequestResultPromise.promise;
    expect(addAccessorRequestResult).to.deep.include({
      reference_id: referenceId,
      request_id: requestIdAddAccessor,
      accessor_id: accessorId2,
      success: true,
    });
    expect(addAccessorRequestResult.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight =
      addAccessorRequestResult.creation_block_height.split(':');
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('IdP should get request_id by reference_id while request is unfinished (not closed or timed out) successfully', async function () {
    this.timeout(10000);
    const response = await identityApi.getRequestIdByReferenceId('idp1', {
      reference_id: referenceId,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.deep.equal({
      request_id: requestIdAddAccessor,
      accessor_id: accessorId2,
    });
  });

  it('idp1 should receive add accessor request', async function () {
    this.timeout(15000);
    const incomingRequest = await incomingRequestPromise.promise;
    expect(incomingRequest).to.deep.include({
      mode: 3,
      request_id: requestIdAddAccessor,
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
    const splittedCreationBlockHeight =
      incomingRequest.creation_block_height.split(':');
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    expect(incomingRequest.request_timeout).to.be.a('number');
  });

  it('IdP should get request_message_padded_hash successfully', async function () {
    this.timeout(15000);
    identityForResponse = db.idp1Identities.find(
      (identity) =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    responseAccessorId = identityForResponse.accessors[0].accessorId;
    let accessorPublicKey = identityForResponse.accessors[0].accessorPublicKey;

    const testResult = await getAndVerifyRequestMessagePaddedHashTest({
      callApiAtNodeId: 'idp1',
      idpNodeId: 'idp1',
      requestId: requestIdAddAccessor,
      incomingRequestPromise,
      accessorPublicKey,
      accessorId: responseAccessorId,
    });
    requestMessagePaddedHash = testResult.verifyRequestMessagePaddedHash;
  });

  it('IdP (idp1) should create response (accept) successfully', async function () {
    this.timeout(10000);

    let accessorPrivateKey =
      identityForResponse.accessors[0].accessorPrivateKey;

    const signature = createResponseSignature(
      accessorPrivateKey,
      requestMessagePaddedHash
    );

    const response = await idpApi.createResponse('idp1', {
      reference_id: referenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestIdAddAccessor,
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
  //     reference_id: referenceId,
  //     request_id: requestIdAddAccessor,
  //   });

  //   expect(accessorEncryptParams.request_message_padded_hash).to.be.a('string')
  //     .that.is.not.empty;
  // });

  it('IdP should receive callback create response result with success = true', async function () {
    this.timeout(15000);
    const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      node_id: 'idp1',
      type: 'response_result',
      reference_id: referenceId,
      request_id: requestIdAddAccessor,
      success: true,
    });
  });

  it('Accessor id should be added successfully', async function () {
    this.timeout(10000);
    const addAccessorResult = await addAccessorResultPromise.promise;
    expect(addAccessorResult).to.deep.include({
      reference_id: referenceId,
      request_id: requestIdAddAccessor,
      success: true,
    });

    const identity = db.idp1Identities.find(
      (identity) =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    identity.accessors.push({
      accessorId: accessorId2,
      accessorPrivateKey,
      accessorPublicKey,
    });
  });

  it('IdP should get response status code 404 when get request_id by reference_id after request is finished (closed)', async function () {
    this.timeout(10000);
    const response = await identityApi.getRequestIdByReferenceId('idp1', {
      reference_id: referenceId,
    });
    expect(response.status).to.equal(404);
  });

  after(function () {
    idp1EventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
  });

  //revoke by idp1
  describe('Reject revoke accessor by the owner', function () {
    const revokeAccessorRequestMessage =
      'Revoke accessor consent request custom message ข้อความสำหรับขอเพิกถอน accessor บนระบบ';

    let requestId;

    const idpReferenceIdRevoke = generateReferenceId();
    const idpReferenceIdResponse = generateReferenceId();

    const incomingRequestPromise = createEventPromise(); // IDP
    const revokeResultPromise = createEventPromise(); // IDP
    const revokeRequestPromise = createEventPromise(); // IDP
    const responseResultPromise = createEventPromise(); // IDP
    const accessorEncryptPromise = createEventPromise(); // IDP

    let requestMessageHash;
    let identityForResponse;

    before(function () {
      idp1EventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'incoming_request' &&
          callbackData.request_id === requestId
        ) {
          incomingRequestPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'response_result' &&
          callbackData.reference_id === idpReferenceIdResponse
        ) {
          responseResultPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'revoke_accessor_request_result' &&
          callbackData.reference_id === idpReferenceIdRevoke
        ) {
          revokeRequestPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'revoke_accessor_result' &&
          callbackData.reference_id === idpReferenceIdRevoke
        ) {
          revokeResultPromise.resolve(callbackData);
        }
      });

      idp1EventEmitter.on('accessor_encrypt_callback', function (callbackData) {
        if (callbackData.request_id === requestId) {
          accessorEncryptPromise.resolve(callbackData);
        }
      });
    });

    it('Revoke accessor should success', async function () {
      const response = await identityApi.revokeAccessor('idp1', {
        reference_id: idpReferenceIdRevoke,
        callback_url: config.IDP1_CALLBACK_URL,
        namespace,
        identifier,
        accessor_id: accessorId,
        request_message: revokeAccessorRequestMessage,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      requestId = responseBody.request_id;
    });

    it('Idp1 should get callback for revoke request', async function () {
      this.timeout(15000);
      const revokeRequest = await revokeRequestPromise.promise;
      expect(revokeRequest).to.deep.include({
        reference_id: idpReferenceIdRevoke,
        request_id: requestId,
        accessor_id: accessorId,
        type: 'revoke_accessor_request_result',
        node_id: 'idp1',
        success: true,
      });
      expect(revokeRequest.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight =
        revokeRequest.creation_block_height.split(':');
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('1st IdP should get request_id by reference_id while request is unfinished (not closed or timed out) successfully', async function () {
      this.timeout(15000);
      const response = await identityApi.getRequestIdByReferenceId('idp1', {
        reference_id: idpReferenceIdRevoke,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.deep.equal({
        request_id: requestId,
        accessor_id: accessorId,
      });
    });

    it('Idp1 should get incoming request for revoke request', async function () {
      this.timeout(15000);
      const incomingRequest = await incomingRequestPromise.promise;
      expect(incomingRequest).to.deep.include({
        mode: 3,
        request_id: requestId,
        requester_node_id: 'idp1',
        request_message: revokeAccessorRequestMessage,
        request_message_hash: hash(
          revokeAccessorRequestMessage + incomingRequest.request_message_salt
        ),
      });
      expect(incomingRequest.reference_group_code).to.be.a('string').that.is.not
        .empty;
      expect(incomingRequest.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight =
        incomingRequest.creation_block_height.split(':');
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
      requestMessageHash = incomingRequest.request_message_hash;
    });

    it('IdP should get request_message_padded_hash successfully', async function () {
      this.timeout(15000);

      identityForResponse = db.idp1Identities.find(
        (identity) =>
          identity.namespace === namespace && identity.identifier === identifier
      );

      let accessor = identityForResponse.accessors.find(
        (accessor) => accessor.accessorId === accessorId
      );

      responseAccessorId = accessor.accessorId;
      let accessorPublicKey = accessor.accessorPublicKey;

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

    it('Idp1 should response (reject) successfully', async function () {
      this.timeout(15000);

      let accessor = identityForResponse.accessors.find(
        (accessor) => accessor.accessorId === accessorId
      );

      let accessorPrivateKey = accessor.accessorPrivateKey;

      const signature = createResponseSignature(
        accessorPrivateKey,
        requestMessagePaddedHash
      );

      const response = await idpApi.createResponse('idp1', {
        reference_id: idpReferenceIdResponse,
        callback_url: config.IDP1_CALLBACK_URL,
        request_id: requestId,
        ial: 2.3,
        aal: 3,
        status: 'reject',
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
    //     reference_id: idpReferenceIdResponse,
    //     request_id: requestId,
    //   });

    //   expect(accessorEncryptParams.request_message_padded_hash).to.be.a(
    //     'string',
    //   ).that.is.not.empty;
    // });

    it('IdP should receive callback create response result with success = true', async function () {
      const responseResult = await responseResultPromise.promise;
      expect(responseResult).to.deep.include({
        node_id: 'idp1',
        type: 'response_result',
        reference_id: idpReferenceIdResponse,
        request_id: requestId,
        success: true,
      });
    });

    it('Idp1 should receive callback revoke accessor result with success = false', async function () {
      this.timeout(30000);
      const revokeResult = await revokeResultPromise.promise;
      expect(revokeResult).to.deep.include({
        reference_id: idpReferenceIdRevoke,
        request_id: requestId,
        type: 'revoke_accessor_result',
        node_id: 'idp1',
        success: false,
      });
      expect(revokeResult.error.code).to.equal(10016);
    });

    it('Special request status for add accessor method should be rejected and closed', async function () {
      this.timeout(25000);
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
      const splittedCreationBlockHeight =
        responseBody.creation_block_height.split(':');
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
      await wait(3000); //wait for api clean up refernece_id
    });

    it('1st IdP should get response status code 404 when get request_id by reference_id after request is finished (closed)', async function () {
      this.timeout(10000);
      const response = await identityApi.getRequestIdByReferenceId('idp1', {
        reference_id: idpReferenceIdRevoke,
      });
      expect(response.status).to.equal(404);
    });
    after(function () {
      idp1EventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
    });
  });

  describe('Accessor must still be usable', function () {
    const rpReferenceId = generateReferenceId();
    const idpReferenceId = generateReferenceId();
    const asReferenceId = generateReferenceId();

    const createRequestResultPromise = createEventPromise(); // RP
    const incomingRequestPromise = createEventPromise(); // IDP
    const responseResultPromise = createEventPromise(); // IDP
    const accessorEncryptPromise = createEventPromise(); // IDP
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
    let initialSalt;
    let requestMessageSalt;
    let requestMessageHash;
    let identityForResponse;
    let lastStatusUpdateBlockHeight;

    let rp_node_id = 'rp1';
    let requester_node_id = 'rp1';
    let as_node_id = 'as1';
    let idpIdList;
    let dataRequestList;
    let idpResponseParams = [];

    before(function () {
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
        request_message:
          'Test request message (idp1 response with new accessor id) (mode 3)',
        min_ial: 1.1,
        min_aal: 1,
        min_idp: 1,
        request_timeout: 86400,
        bypass_identity_check: false,
      };

      rpEventEmitter.on('callback', function (callbackData) {
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
            if (callbackData.data_request_list[0].response_list.length > 0) {
              if (callbackData.data_request_list[0].response_list[0].signed) {
                requestStatusSignedDataPromise.resolve(callbackData);
              }
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

      idp1EventEmitter.on('callback', function (callbackData) {
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

      idp1EventEmitter.on('accessor_encrypt_callback', function (callbackData) {
        if (callbackData.request_id === requestId) {
          accessorEncryptPromise.resolve(callbackData);
        }
      });

      as1EventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'data_request' &&
          callbackData.request_id === requestId
        ) {
          dataRequestReceivedPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'response_result' &&
          callbackData.reference_id === asReferenceId
        ) {
          sendDataResultPromise.resolve(callbackData);
        }
      });
    });

    it('RP should create a request successfully', async function () {
      this.timeout(30000);
      const response = await rpApi.createRequest('rp1', createRequestParams);
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

      requestId = responseBody.request_id;
      initialSalt = responseBody.initial_salt;

      const createRequestResult = await createRequestResultPromise.promise;
      expect(createRequestResult.success).to.equal(true);
      expect(createRequestResult.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight =
        createRequestResult.creation_block_height.split(':');
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
      lastStatusUpdateBlockHeight = parseInt(splittedCreationBlockHeight[1]);

      [idpIdList, dataRequestList, requestMessageHash] = await Promise.all([
        createIdpIdList({
          createRequestParams,
          callRpApiAtNodeId: rp_node_id,
        }),
        createDataRequestList({
          createRequestParams,
          requestId,
          initialSalt,
          callRpApiAtNodeId: rp_node_id,
        }),
        createRequestMessageHash({
          createRequestParams,
          initialSalt,
        }),
      ]); // create idp_id_list, as_id_list, request_message_hash for test
    });

    it('IdP should receive incoming request callback', async function () {
      this.timeout(15000);
      const incomingRequest = await incomingRequestPromise.promise;

      const dataRequestListWithoutParams =
        createRequestParams.data_request_list.map((dataRequest) => {
          const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
          return {
            ...dataRequestWithoutParams,
          };
        });
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
      });
      expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
        .empty;
      expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
        .empty;
      expect(incomingRequest.creation_time).to.be.a('number');
      expect(incomingRequest.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight =
        incomingRequest.creation_block_height.split(':');
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);

      requestMessageSalt = incomingRequest.request_message_salt;
      requestMessageHash = incomingRequest.request_message_hash;
    });

    it('IdP should get request_message_padded_hash successfully', async function () {
      this.timeout(15000);

      identityForResponse = db.idp1Identities.find(
        (identity) =>
          identity.namespace === namespace && identity.identifier === identifier
      );

      let accessor = identityForResponse.accessors.find(
        (accessor) => accessor.accessorId === accessorId
      );

      responseAccessorId = accessor.accessorId;
      let accessorPublicKey = accessor.accessorPublicKey;

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

    it('IdP should create response (accept) with new accessor id successfully', async function () {
      this.timeout(15000);

      let accessor = identityForResponse.accessors.find(
        (accessor) => accessor.accessorId === accessorId
      );

      let accessorPrivateKey = accessor.accessorPrivateKey;

      const signature = createResponseSignature(
        accessorPrivateKey,
        requestMessagePaddedHash
      );

      let idpResponse = {
        reference_id: idpReferenceId,
        callback_url: config.IDP1_CALLBACK_URL,
        request_id: requestId,
        ial: 2.3,
        aal: 3,
        status: 'accept',
        accessor_id: accessorId,
        signature,
      };

      idpResponseParams.push({
        ...idpResponse,
        idp_id: 'idp1',
        valid_signature: true,
        valid_ial: true,
      });

      const response = await idpApi.createResponse('idp1', idpResponse);
      expect(response.status).to.equal(202);
    });

    it('IdP should receive callback create response result with success = true', async function () {
      const responseResult = await responseResultPromise.promise;
      expect(responseResult).to.deep.include({
        node_id: 'idp1',
        type: 'response_result',
        reference_id: idpReferenceId,
        request_id: requestId,
        success: true,
      });
    });

    it('RP should receive confirmed request status with valid proofs', async function () {
      this.timeout(15000);

      const testResult = await receiveConfirmedRequestStatusTest({
        nodeId: rp_node_id,
        requestStatusConfirmedPromise,
        requestId,
        createRequestParams,
        dataRequestList,
        idpResponse: idpResponseParams,
        requestMessageHash,
        idpIdList,
        lastStatusUpdateBlockHeight,
        requesterNodeId: requester_node_id,
      });
      lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;

      // const requestStatus = await requestStatusConfirmedPromise.promise;
      // expect(requestStatus).to.deep.include({
      //   request_id: requestId,
      //   status: 'confirmed',
      //   mode: createRequestParams.mode,
      //   min_idp: createRequestParams.min_idp,
      //   answered_idp_count: 1,
      //   closed: false,
      //   timed_out: false,
      //   service_list: [
      //     {
      //       service_id: createRequestParams.data_request_list[0].service_id,
      //       min_as: createRequestParams.data_request_list[0].min_as,
      //       signed_data_count: 0,
      //       received_data_count: 0,
      //     },
      //   ],
      //   response_valid_list: [
      //     {
      //       idp_id: 'idp1',
      //       valid_signature: true,
      //       valid_ial: true,
      //     },
      //   ],
      // });
      // expect(requestStatus).to.have.property('block_height');
      // expect(requestStatus.block_height).is.a('string');
      // const splittedBlockHeight = requestStatus.block_height.split(':');
      // expect(splittedBlockHeight).to.have.lengthOf(2);
      // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('AS should receive data request', async function () {
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
      });
      expect(dataRequest.response_signature_list).to.have.lengthOf(1);
      expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is
        .not.empty;
    });

    it('AS should send data successfully', async function () {
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

      dataRequestList = setDataSigned(
        dataRequestList,
        createRequestParams.data_request_list[0].service_id,
        as_node_id
      );
    });

    it('RP should receive request status with signed data count = 1', async function () {
      this.timeout(15000);

      const testResult = await receiveConfirmedRequestStatusTest({
        nodeId: rp_node_id,
        requestStatusConfirmedPromise: requestStatusSignedDataPromise,
        requestId,
        createRequestParams,
        dataRequestList,
        idpResponse: idpResponseParams,
        requestMessageHash,
        idpIdList,
        lastStatusUpdateBlockHeight,
        requesterNodeId: requester_node_id,
      });

      lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;

      dataRequestList = setDataReceived(
        dataRequestList,
        createRequestParams.data_request_list[0].service_id,
        as_node_id
      );

      // const requestStatus = await requestStatusSignedDataPromise.promise;
      // expect(requestStatus).to.deep.include({
      //   request_id: requestId,
      //   status: 'confirmed',
      //   mode: createRequestParams.mode,
      //   min_idp: createRequestParams.min_idp,
      //   answered_idp_count: 1,
      //   closed: false,
      //   timed_out: false,
      //   service_list: [
      //     {
      //       service_id: createRequestParams.data_request_list[0].service_id,
      //       min_as: createRequestParams.data_request_list[0].min_as,
      //       signed_data_count: 1,
      //       received_data_count: 0,
      //     },
      //   ],
      //   response_valid_list: [
      //     {
      //       idp_id: 'idp1',
      //       valid_signature: true,
      //       valid_ial: true,
      //     },
      //   ],
      // });
      // expect(requestStatus).to.have.property('block_height');
      // expect(requestStatus.block_height).is.a('string');
      // const splittedBlockHeight = requestStatus.block_height.split(':');
      // expect(splittedBlockHeight).to.have.lengthOf(2);
      // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('RP should receive completed request status with received data count = 1', async function () {
      this.timeout(15000);

      const testResult = await receiveCompletedRequestStatusTest({
        nodeId: rp_node_id,
        requestStatusCompletedPromise,
        requestId,
        createRequestParams,
        dataRequestList,
        idpResponse: idpResponseParams,
        requestMessageHash,
        idpIdList,
        lastStatusUpdateBlockHeight,
        requesterNodeId: requester_node_id,
      });

      lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;

      // const requestStatus = await requestStatusCompletedPromise.promise;
      // expect(requestStatus).to.deep.include({
      //   request_id: requestId,
      //   status: 'completed',
      //   mode: createRequestParams.mode,
      //   min_idp: createRequestParams.min_idp,
      //   answered_idp_count: 1,
      //   closed: false,
      //   timed_out: false,
      //   service_list: [
      //     {
      //       service_id: createRequestParams.data_request_list[0].service_id,
      //       min_as: createRequestParams.data_request_list[0].min_as,
      //       signed_data_count: 1,
      //       received_data_count: 1,
      //     },
      //   ],
      //   response_valid_list: [
      //     {
      //       idp_id: 'idp1',
      //       valid_signature: true,
      //       valid_ial: true,
      //     },
      //   ],
      // });
      // expect(requestStatus).to.have.property('block_height');
      // expect(requestStatus.block_height).is.a('string');
      // const splittedBlockHeight = requestStatus.block_height.split(':');
      // expect(splittedBlockHeight).to.have.lengthOf(2);
      // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('RP should receive request closed status', async function () {
      this.timeout(10000);

      const testResult = await receiveRequestClosedStatusTest({
        nodeId: rp_node_id,
        requestClosedPromise,
        requestId,
        createRequestParams,
        dataRequestList,
        idpResponse: idpResponseParams,
        requestMessageHash,
        idpIdList,
        lastStatusUpdateBlockHeight,
        requesterNodeId: requester_node_id,
      });
      lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;

      // const requestStatus = await requestClosedPromise.promise;
      // expect(requestStatus).to.deep.include({
      //   request_id: requestId,
      //   status: 'completed',
      //   mode: createRequestParams.mode,
      //   min_idp: createRequestParams.min_idp,
      //   answered_idp_count: 1,
      //   closed: true,
      //   timed_out: false,
      //   service_list: [
      //     {
      //       service_id: createRequestParams.data_request_list[0].service_id,
      //       min_as: createRequestParams.data_request_list[0].min_as,
      //       signed_data_count: 1,
      //       received_data_count: 1,
      //     },
      //   ],
      //   response_valid_list: [
      //     {
      //       idp_id: 'idp1',
      //       valid_signature: true,
      //       valid_ial: true,
      //     },
      //   ],
      // });
      // expect(requestStatus).to.have.property('block_height');
      // expect(requestStatus.block_height).is.a('string');
      // const splittedBlockHeight = requestStatus.block_height.split(':');
      // expect(splittedBlockHeight).to.have.lengthOf(2);
      // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('RP should get the correct data received from AS', async function () {
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

    after(function () {
      rpEventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
      as1EventEmitter.removeAllListeners('callback');
    });
  });
});
