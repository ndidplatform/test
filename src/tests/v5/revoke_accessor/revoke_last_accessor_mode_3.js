import crypto from 'crypto';
import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import { idp2Available } from '../..';
import * as idpApi from '../../../api/v5/idp';
import * as commonApi from '../../../api/v5/common';
import * as identityApi from '../../../api/v5/identity';
import { idp1EventEmitter, idp2EventEmitter } from '../../../callback_server';
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

describe('IdP (idp1) revoke last accessor (identity associated with one idp mode 3) test', function() {
  let namespace = 'citizen_id';
  let identifier = uuidv4();
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
    await wait(1500);
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

  describe('IdP (idp1) should revoke last accessor (mode 3) unsuccessfully', function() {
    const revokeAccessorRequestMessage =
      'Revoke accessor consent request custom message ข้อความสำหรับขอเพิกถอน accessor บนระบบ';

    const referenceId = generateReferenceId();
    const idp1ReferenceId = generateReferenceId();

    const incomingRequestPromise = createEventPromise();
    const responseResultPromise = createEventPromise();
    const accessorEncryptPromise = createEventPromise();
    const revokeAccessorResultPromise = createEventPromise();
    const revokeAccessorRequestResultPromise = createEventPromise();

    let requestId;
    let accessorIdForRevoke;
    let identityForResponse;
    let responseAccessorId;
    let requestMessagePaddedHash;

    before(function() {
      accessorIdForRevoke = accessorId;

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
          callbackData.type === 'revoke_accessor_request_result' &&
          callbackData.reference_id === referenceId
        ) {
          revokeAccessorRequestResultPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'revoke_accessor_result' &&
          callbackData.reference_id === referenceId
        ) {
          revokeAccessorResultPromise.resolve(callbackData);
        }
      });

      idp1EventEmitter.on('accessor_encrypt_callback', function(callbackData) {
        if (callbackData.request_id === requestId) {
          accessorEncryptPromise.resolve(callbackData);
        }
      });
    });

    it('Should revoke accessor unsuccessfully', async function() {
      this.timeout(10000);
      const response = await identityApi.revokeAccessor('idp1', {
        namespace: namespace,
        identifier: identifier,
        reference_id: referenceId,
        callback_url: config.IDP1_CALLBACK_URL,
        accessor_id: accessorIdForRevoke,
        request_message: revokeAccessorRequestMessage,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.request_id).to.be.a('string').that.is.not.empty;

      requestId = responseBody.request_id;

      const revokeAccessorRequestResult = await revokeAccessorRequestResultPromise.promise;
      expect(revokeAccessorRequestResult).to.deep.include({
        reference_id: referenceId,
        request_id: requestId,
        accessor_id: accessorId,
        success: true,
      });
      expect(revokeAccessorRequestResult.creation_block_height).to.be.a(
        'string',
      );
      const splittedCreationBlockHeight = revokeAccessorRequestResult.creation_block_height.split(
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
        accessor_id: accessorId,
      });
    });

    it('idp1 should receive revoke accessor request', async function() {
      this.timeout(15000);
      const incomingRequest = await incomingRequestPromise.promise;
      expect(incomingRequest).to.deep.include({
        mode: 3,
        request_id: requestId,
        reference_group_code: referenceGroupCode,
        request_message: revokeAccessorRequestMessage,
        request_message_hash: hash(
          revokeAccessorRequestMessage + incomingRequest.request_message_salt,
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
          identity.identifier === identifier,
      );

      const identity = identityForResponse.accessors.find(
        accessor => accessor.accessorId === accessorIdForRevoke,
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
        accessor_id: accessorIdForRevoke,
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
    //     accessor_id: accessorIdForRevoke,
    //     key_type: 'RSA',
    //     padding: 'none',
    //     reference_id: idp1ReferenceId,
    //     request_id: requestId,
    //   });

    //   expect(accessorEncryptParams.request_message_padded_hash).to.be.a(
    //     'string',
    //   ).that.is.not.empty;
    // });

    it('IdP should receive callback create response result with success = true', async function() {
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

    it('Accessor id should be revoked unsuccessfully', async function() {
      this.timeout(10000);
      const revokeAccessorResult = await revokeAccessorResultPromise.promise;
      expect(revokeAccessorResult.error.code).to.equal(25070);
      expect(revokeAccessorResult).to.deep.include({
        reference_id: referenceId,
        request_id: requestId,
        accessor_id: accessorIdForRevoke,
        success: false,
      });
      //TODO: Expect error code
    });

    it('IdP should get response status code 404 when get request_id by reference_id after request is finished (closed)', async function() {
      this.timeout(10000);
      const response = await identityApi.getRequestIdByReferenceId('idp1', {
        reference_id: referenceId,
      });
      expect(response.status).to.equal(404);
    });

    after(function() {
      let identityIndex = db.idp1Identities.findIndex(
        identity =>
          identity.namespace === namespace &&
          identity.identifier === identifier,
      );
      db.idp1Identities.splice(identityIndex, 1);

      idp1EventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
      idp2EventEmitter.removeAllListeners('identity_notification_callback');
    });
  });
});

describe('IdP (idp1) revoke last accessor (identity associated with many idp mode 3) test', function() {
  let namespace = 'citizen_id';
  let identifier = uuidv4();
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
  const idp2CreateIdentityResultPromise = createEventPromise();

  let idp1AccessorId;
  let idp2AccessorId;
  let referenceGroupCode;

  before(function() {
    if (!idp2Available) {
      this.test.pending = true;
      this.skip();
    }
    idp1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'create_identity_result' &&
        callbackData.reference_id === referenceId
      ) {
        createIdentityResultPromise.resolve(callbackData);
      }
    });

    idp2EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'create_identity_result' &&
        callbackData.reference_id === referenceId
      ) {
        idp2CreateIdentityResultPromise.resolve(callbackData);
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

    idp1AccessorId = responseBody.accessor_id;
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
          accessorId: idp1AccessorId,
          accessorPrivateKey,
          accessorPublicKey,
        },
      ],
    });
    await wait(1500);
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

  it('Should create identity request (mode 2) successfully', async function() {
    this.timeout(10000);
    const response = await identityApi.createIdentity('idp2', {
      reference_id: referenceId,
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
      lial: false,
      laal: false,
      mode: 2,
    });

    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.exist).to.equal(true);

    idp2AccessorId = responseBody.accessor_id;
  });

  it('Identity should be created successfully', async function() {
    this.timeout(15000);
    const createIdentityResult = await idp2CreateIdentityResultPromise.promise;
    expect(createIdentityResult).to.deep.include({
      reference_id: referenceId,
      success: true,
    });

    expect(createIdentityResult.reference_group_code).to.be.a('string').that.is
      .not.empty;

    const response = await commonApi.getRelevantIdpNodesBySid('idp2', {
      namespace,
      identifier,
    });

    const idpNodes = await response.json();
    const idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp2');
    expect(idpNode).to.not.be.undefined;
    expect(idpNode.mode_list)
      .to.be.an('array')
      .that.include(2);

    db.idp2Identities.push({
      referenceGroupCode,
      mode: 2,
      namespace,
      identifier,
      accessors: [
        {
          accessorId: idp2AccessorId,
          accessorPrivateKey,
          accessorPublicKey,
        },
      ],
    });
    await wait(1500);
  });

  after(function() {
    idp1EventEmitter.removeAllListeners('callback');
    idp2EventEmitter.removeAllListeners('callback');
  });

  describe('IdP (idp1) should revoke last accessor (mode 3) unsuccessfully', function() {
    const revokeAccessorRequestMessage =
      'Revoke accessor consent request custom message ข้อความสำหรับขอเพิกถอน accessor บนระบบ';

    const referenceId = generateReferenceId();
    const idp1ReferenceId = generateReferenceId();

    const incomingRequestPromise = createEventPromise();
    const responseResultPromise = createEventPromise();
    const accessorEncryptPromise = createEventPromise();
    const revokeAccessorResultPromise = createEventPromise();
    const revokeAccessorRequestResultPromise = createEventPromise();

    let requestId;
    let accessorIdForRevoke;
    let identityForResponse;
    let responseAccessorId;
    let requestMessagePaddedHash;

    before(function() {
      if (!idp2Available) {
        this.test.parent.pending = true;
        this.skip();
      }
      accessorIdForRevoke = idp1AccessorId;

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
          callbackData.type === 'revoke_accessor_request_result' &&
          callbackData.reference_id === referenceId
        ) {
          revokeAccessorRequestResultPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'revoke_accessor_result' &&
          callbackData.reference_id === referenceId
        ) {
          revokeAccessorResultPromise.resolve(callbackData);
        }
      });

      idp1EventEmitter.on('accessor_encrypt_callback', function(callbackData) {
        if (callbackData.request_id === requestId) {
          accessorEncryptPromise.resolve(callbackData);
        }
      });
    });

    it('Should revoke accessor unsuccessfully', async function() {
      this.timeout(10000);
      const response = await identityApi.revokeAccessor('idp1', {
        namespace: namespace,
        identifier: identifier,
        reference_id: referenceId,
        callback_url: config.IDP1_CALLBACK_URL,
        accessor_id: accessorIdForRevoke,
        request_message: revokeAccessorRequestMessage,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.request_id).to.be.a('string').that.is.not.empty;

      requestId = responseBody.request_id;

      const revokeAccessorRequestResult = await revokeAccessorRequestResultPromise.promise;
      expect(revokeAccessorRequestResult).to.deep.include({
        reference_id: referenceId,
        request_id: requestId,
        accessor_id: accessorIdForRevoke,
        success: true,
      });
      expect(revokeAccessorRequestResult.creation_block_height).to.be.a(
        'string',
      );
      const splittedCreationBlockHeight = revokeAccessorRequestResult.creation_block_height.split(
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
        accessor_id: accessorIdForRevoke,
      });
    });

    it('idp1 should receive revoke accessor request', async function() {
      this.timeout(15000);
      const incomingRequest = await incomingRequestPromise.promise;
      expect(incomingRequest).to.deep.include({
        mode: 3,
        request_id: requestId,
        reference_group_code: referenceGroupCode,
        request_message: revokeAccessorRequestMessage,
        request_message_hash: hash(
          revokeAccessorRequestMessage + incomingRequest.request_message_salt,
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
          identity.identifier === identifier,
      );

      const identity = identityForResponse.accessors.find(
        accessor => accessor.accessorId === accessorIdForRevoke,
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

      const identity = identityForResponse.accessors.find(
        accessor => accessor.accessorId === accessorIdForRevoke,
      );

      let accessorPrivateKey = identity.accessorPrivateKey;

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
        accessor_id: accessorIdForRevoke,
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
    //     accessor_id: accessorIdForRevoke,
    //     key_type: 'RSA',
    //     padding: 'none',
    //     reference_id: idp1ReferenceId,
    //     request_id: requestId,
    //   });

    //   expect(accessorEncryptParams.request_message_padded_hash).to.be.a(
    //     'string',
    //   ).that.is.not.empty;
    // });

    it('IdP should receive callback create response result with success = true', async function() {
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

    it('Accessor id should be revoked unsuccessfully', async function() {
      this.timeout(10000);
      const revokeAccessorResult = await revokeAccessorResultPromise.promise;
      expect(revokeAccessorResult.error.code).to.equal(25070)
      expect(revokeAccessorResult).to.deep.include({
        reference_id: referenceId,
        request_id: requestId,
        accessor_id: accessorIdForRevoke,
        success: false,
      });
      //TODO: Expect error code
    });

    it('IdP should get response status code 404 when get request_id by reference_id after request is finished (closed)', async function() {
      this.timeout(10000);
      const response = await identityApi.getRequestIdByReferenceId('idp1', {
        reference_id: referenceId,
      });
      expect(response.status).to.equal(404);
    });

    after(function() {
      let identityIndex = db.idp1Identities.findIndex(
        identity =>
          identity.namespace === namespace &&
          identity.identifier === identifier,
      );
      db.idp1Identities.splice(identityIndex, 1);

      let idp2IdentityIndex = db.idp2Identities.findIndex(
        identity =>
          identity.namespace === namespace &&
          identity.identifier === identifier,
      );
      db.idp2Identities.splice(idp2IdentityIndex, 1);

      idp1EventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
    });
  });
});
