import crypto from 'crypto';
import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import * as idpApi from '../../../api/v6/idp';
import * as identityApi from '../../../api/v6/identity';
import * as commonApi from '../../../api/v6/common';
import { idp1EventEmitter } from '../../../callback_server';
import * as db from '../../../db';
import {
  createEventPromise,
  generateReferenceId,
  hash,
  wait,
  createResponseSignature,
} from '../../../utils';
import { randomThaiIdNumber } from '../../../utils/thai_id';
import * as config from '../../../config';
import { getAndVerifyRequestMessagePaddedHashTest } from '../_fragments/request_flow_fragments/idp';

describe('Revoke accessor with duplicate reference id test', function() {
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

  before(function() {
    idp1EventEmitter.on('callback', function(callbackData) {
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

    idp1EventEmitter.on('accessor_encrypt_callback', function(callbackData) {
      if (callbackData.request_id === requestIdAddAccessor) {
        accessorEncryptPromise.resolve(callbackData);
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

  it('Should add accessor successfully', async function() {
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

    const addAccessorRequestResult = await addAccessorRequestResultPromise.promise;
    expect(addAccessorRequestResult).to.deep.include({
      reference_id: referenceId,
      request_id: requestIdAddAccessor,
      accessor_id: accessorId2,
      success: true,
    });
    expect(addAccessorRequestResult.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight = addAccessorRequestResult.creation_block_height.split(
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
      request_id: requestIdAddAccessor,
      accessor_id: accessorId2,
    });
  });

  it('idp1 should receive add accessor request', async function() {
    this.timeout(15000);
    const incomingRequest = await incomingRequestPromise.promise;
    expect(incomingRequest).to.deep.include({
      mode: 3,
      request_id: requestIdAddAccessor,
      reference_group_code: referenceGroupCode,
      request_message: addAccessorRequestMessage,
      request_message_hash: hash(
        addAccessorRequestMessage + incomingRequest.request_message_salt,
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
        identity.namespace === namespace && identity.identifier === identifier,
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

  it('IdP (idp1) should create response (accept) successfully', async function() {
    this.timeout(10000);

    let accessorPrivateKey =
      identityForResponse.accessors[0].accessorPrivateKey;

    const signature = createResponseSignature(
      accessorPrivateKey,
      requestMessagePaddedHash,
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

  it('IdP should receive callback create response result with success = true', async function() {
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

  it('Accessor id should be added successfully', async function() {
    this.timeout(10000);
    const addAccessorResult = await addAccessorResultPromise.promise;
    expect(addAccessorResult).to.deep.include({
      reference_id: referenceId,
      request_id: requestIdAddAccessor,
      success: true,
    });

    const identity = db.idp1Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier,
    );

    identity.accessors.push({
      accessorId: accessorId2,
      accessorPrivateKey,
      accessorPublicKey,
    });
  });

  it('IdP should get response status code 404 when get request_id by reference_id after request is finished (closed)', async function() {
    this.timeout(10000);
    const response = await identityApi.getRequestIdByReferenceId('idp1', {
      reference_id: referenceId,
    });
    expect(response.status).to.equal(404);
  });

  after(function() {
    idp1EventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
  });

  describe('Revoke accessor with duplicate reference id', function() {
    const revokeAccessorRequestMessage =
      'Revoke accessor consent request custom message ข้อความสำหรับขอเพิกถอน accessor บนระบบ';

    const referenceId = generateReferenceId();
    const idp1ReferenceId = generateReferenceId();
    const idpReferenceIdCloseRevokeAccessor = generateReferenceId();
    const idpReferenceIdRevoke = generateReferenceId();

    const addAccessorRequestResultPromise = createEventPromise();
    const addAccessorResultPromise = createEventPromise();
    const incomingRequestPromise = createEventPromise();
    const responseResultPromise = createEventPromise();
    const accessorEncryptPromise = createEventPromise();
    const closeRevokeAccessorRequestResultPromise = createEventPromise();
    const IdPRevokeAccessorResultPromise = createEventPromise();
    const incomingRequestRevokeAccessorPromise = createEventPromise();

    let requestId2ndRevokeAccessor;

    let requestId;
    let accessorId;
    let requestMessageHash;
    let referenceGroupCode;
    let responseAccessorId;

    before(async function() {
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

      idp1EventEmitter.on('callback', function(callbackData) {
        if (
          callbackData.type === 'incoming_request' &&
          callbackData.request_id === requestId2ndRevokeAccessor
        ) {
          incomingRequestRevokeAccessorPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'close_request_result' &&
          callbackData.reference_id === idpReferenceIdCloseRevokeAccessor
        ) {
          closeRevokeAccessorRequestResultPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'revoke_accessor_result' &&
          callbackData.reference_id === idpReferenceIdRevoke
        ) {
          IdPRevokeAccessorResultPromise.resolve(callbackData);
        }
      });

      idp1EventEmitter.on('accessor_encrypt_callback', function(callbackData) {
        if (callbackData.request_id === requestId) {
          accessorEncryptPromise.resolve(callbackData);
        }
      });
    });

    it('IdP (idp1) should revoke accessor successfully', async function() {
      this.timeout(15000);

      const identity = db.idp1Identities.find(
        identity =>
          identity.namespace === namespace &&
          identity.identifier === identifier,
      );
      const latestAccessor = identity.accessors.length - 1;
      accessorId = identity.accessors[latestAccessor].accessorId;

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
      await wait(3000);
    });

    it('IdP (idp1) should revoke accessor with duplicate reference id unsuccessfully', async function() {
      this.timeout(15000);

      const identity = db.idp1Identities.find(
        identity =>
          identity.namespace === namespace &&
          identity.identifier === identifier,
      );

      const latestAccessor = identity.accessors.length - 1;
      accessorId = identity.accessors[latestAccessor].accessorId;

      const response = await identityApi.revokeAccessor('idp1', {
        reference_id: idpReferenceIdRevoke,
        callback_url: config.IDP1_CALLBACK_URL,
        namespace,
        identifier,
        accessor_id: accessorId,
        request_message: revokeAccessorRequestMessage,
      });
      expect(response.status).to.equal(400);
      const responseBody = await response.json();
      expect(responseBody.error.code).to.equal(20045);
    });

    it('IdP (idp1) should revoke accessor with duplicate reference id unsuccessfully', async function() {
      this.timeout(15000);

      const identity = db.idp1Identities.find(
        identity =>
          identity.namespace === namespace &&
          identity.identifier === identifier,
      );

      const latestAccessor = identity.accessors.length - 1;
      accessorId = identity.accessors[latestAccessor].accessorId;

      const response = await identityApi.revokeAccessor('idp1', {
        reference_id: idpReferenceIdRevoke,
        callback_url: config.IDP1_CALLBACK_URL,
        namespace,
        identifier,
        accessor_id: accessorId,
        request_message: revokeAccessorRequestMessage,
      });
      expect(response.status).to.equal(400);
      const responseBody = await response.json();
      expect(responseBody.error.code).to.equal(20045);
    });

    it('1st IdP should close revoke accessor request successfully', async function() {
      this.timeout(25000);
      const response = await identityApi.closeIdentityRequest('idp1', {
        request_id: requestId,
        callback_url: config.IDP1_CALLBACK_URL,
        reference_id: idpReferenceIdCloseRevokeAccessor,
      });

      expect(response.status).to.equal(202);

      const closeRevokeAccessorRequestResult = await closeRevokeAccessorRequestResultPromise.promise;
      expect(closeRevokeAccessorRequestResult).to.deep.include({
        success: true,
        reference_id: idpReferenceIdCloseRevokeAccessor,
        request_id: requestId,
      });

      const IdPRevokeAccessorResult = await IdPRevokeAccessorResultPromise.promise;
      expect(IdPRevokeAccessorResult).to.deep.include({
        node_id: 'idp1',
        type: 'revoke_accessor_result',
        success: false,
        reference_id: idpReferenceIdRevoke,
        request_id: requestId,
        error: { code: 20025, message: 'Request is already closed' },
      });
    });

    it('After request duplicate reference id is not in progress (closed) IdP (idp1) should revoke accessor successfully', async function() {
      this.timeout(15000);

      const identity = db.idp1Identities.find(
        identity =>
          identity.namespace === namespace &&
          identity.identifier === identifier,
      );
      const latestAccessor = identity.accessors.length - 1;
      accessorId = identity.accessors[latestAccessor].accessorId;

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
      requestId2ndRevokeAccessor = responseBody.request_id;
      await wait(3000);
    });

    it('Idp1 should get incoming request for revoke request', async function() {
      this.timeout(15000);
      const incomingRequest = await incomingRequestRevokeAccessorPromise.promise;
      expect(incomingRequest).to.deep.include({
        mode: 3,
        request_id: requestId2ndRevokeAccessor,
        requester_node_id: 'idp1',
        request_message: revokeAccessorRequestMessage,
        request_message_hash: hash(
          revokeAccessorRequestMessage + incomingRequest.request_message_salt,
        ),
      });
      expect(incomingRequest.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
        ':',
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
      requestMessageHash = incomingRequest.request_message_hash;
    });

    after(async function() {
      this.timeout(15000);
      await identityApi.closeIdentityRequest('idp1', {
        request_id: requestId2ndRevokeAccessor,
        callback_url: config.IDP1_CALLBACK_URL,
        reference_id: idpReferenceIdCloseRevokeAccessor,
      });
      await wait(2000);
      idp1EventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
    });
  });
});
