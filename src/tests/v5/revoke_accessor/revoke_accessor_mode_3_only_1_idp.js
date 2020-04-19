import crypto from 'crypto';
import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import * as rpApi from '../../../api/v5/rp';
import * as idpApi from '../../../api/v5/idp';
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
import {
  createIdpIdList,
  createDataRequestList,
  createRequestMessageHash,
} from '../_fragments/fragments_utils';
import { receivePendingRequestStatusTest } from '../_fragments/common';
import * as config from '../../../config';
import { getAndVerifyRequestMessagePaddedHashTest } from '../_fragments/request_flow_fragments/idp';

describe('IdP (idp1) revoke accessor (identity associated with one idp mode 3 is not last accessor id) test', function () {
  const addAccessorRequestMessage =
    'Add accessor consent request custom message ข้อความสำหรับขอเพิ่ม accessor บนระบบ';
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

  it('IdP should get request_message_padded_hash successfully', async function () {
    this.timeout(15000);
    identityForResponse = db.idp1Identities.find(
      (identity) =>
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

  it('IdP (idp1) should create response (accept) successfully', async function () {
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

  it('IdP shoud receive callback create response result with success = true', async function () {
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
        identity.namespace === namespace && identity.identifier === identifier,
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

  describe('IdP (idp1) should revoke accessor (mode 3) successfully', function () {
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
    let responseAccessorId;
    let identityForResponse;

    before(async function () {
      this.timeout(10000);

      accessorIdForRevoke = accessorId;
      responseAccessorId = accessorId2;

      idp1EventEmitter.on('callback', function (callbackData) {
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

      idp1EventEmitter.on('accessor_encrypt_callback', function (callbackData) {
        if (callbackData.request_id === requestId) {
          accessorEncryptPromise.resolve(callbackData);
        }
      });
    });

    it('Should revoke accessor successfully', async function () {
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

    it('IdP should get request_id by reference_id while request is unfinished (not closed or timed out) successfully', async function () {
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

    it('idp1 should receive revoke accessor request', async function () {
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

    it('IdP should get request_message_padded_hash successfully', async function () {
      this.timeout(15000);

      identityForResponse = db.idp1Identities.find(
        (identity) =>
          identity.namespace === namespace &&
          identity.identifier === identifier,
      );

      const accessor = identityForResponse.accessors.find(
        (accessor) => accessor.accessorId === responseAccessorId,
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

    it('IdP should create response (accept) successfully', async function () {
      this.timeout(10000);

      const accessor = identityForResponse.accessors.find(
        (accessor) => accessor.accessorId === responseAccessorId,
      );

      let accessorPrivateKey = accessor.accessorPrivateKey;

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

    it('IdP should receive callback create response result with success = true', async function () {
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

    it('Accessor id should be revoked successfully', async function () {
      this.timeout(10000);
      const revokeAccessorResult = await revokeAccessorResultPromise.promise;
      expect(revokeAccessorResult).to.deep.include({
        reference_id: referenceId,
        success: true,
      });

      let identity = db.idp1Identities.find(
        (identity) =>
          identity.namespace === namespace &&
          identity.identifier === identifier,
      );

      let indexAccessor = identity.accessors.findIndex(
        (accessor) => accessor.accessorId === accessorIdForRevoke,
      );

      identity.accessors[indexAccessor] = {
        ...identity.accessors[indexAccessor],
        revoked: true,
      };
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
      idp2EventEmitter.removeAllListeners('identity_notification_callback');
    });
  });

  describe('Add duplicate accessor id that is revoked unsuccessfully', function () {
    const addAccessorRequestMessage =
      'Add accessor consent request custom message ข้อความสำหรับขอเพิ่ม accessor บนระบบ';
    const keypair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    // const accessorPrivateKey = keypair.privateKey.export({
    //   type: 'pkcs8',
    //   format: 'pem',
    // });
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

    it('Should add accessor successfully', async function () {
      this.timeout(10000);

      let identity = db.idp1Identities.find(
        (identity) =>
          identity.namespace === namespace &&
          identity.identifier === identifier,
      );

      let accessor = identity.accessors.find((accessor) => accessor.revoked);

      const response = await identityApi.addAccessor('idp1', {
        namespace: namespace,
        identifier: identifier,
        reference_id: referenceId,
        callback_url: config.IDP1_CALLBACK_URL,
        accessor_type: 'RSA',
        accessor_public_key: accessorPublicKey,
        accessor_id: accessor.accessorId,
        request_message: addAccessorRequestMessage,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;

      requestIdAddAccessor = responseBody.request_id;
      accessorId = responseBody.accessor_id;

      const addAccessorRequestResult = await addAccessorRequestResultPromise.promise;
      expect(addAccessorRequestResult).to.deep.include({
        reference_id: referenceId,
        request_id: requestIdAddAccessor,
        accessor_id: accessorId,
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

    it('IdP should get request_id by reference_id while request is unfinished (not closed or timed out) successfully', async function () {
      this.timeout(10000);
      const response = await identityApi.getRequestIdByReferenceId('idp1', {
        reference_id: referenceId,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.deep.equal({
        request_id: requestIdAddAccessor,
        accessor_id: accessorId,
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

    it('IdP should get request_message_padded_hash successfully', async function () {
      this.timeout(15000);
      identityForResponse = db.idp1Identities.find(
        (identity) =>
          identity.namespace === namespace &&
          identity.identifier === identifier,
      );

      let identity = identityForResponse.accessors.find(
        (accessor) => !accessor.revoked,
      );

      responseAccessorId = identity.accessorId;

      let accessorPublicKey = identity.accessorPublicKey;

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

      let identity = identityForResponse.accessors.find(
        (accessor) => !accessor.revoked,
      );

      let accessorPrivateKey = identity.accessorPrivateKey;

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

    //   expect(accessorEncryptParams.request_message_padded_hash).to.be.a(
    //     'string',
    //   ).that.is.not.empty;
    // });

    it('IdP shoud receive callback create response result with success = true', async function () {
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

    it('Accessor id should be added unsuccessfully', async function () {
      this.timeout(10000);
      const addAccessorResult = await addAccessorResultPromise.promise;
      expect(addAccessorResult).to.deep.include({
        reference_id: referenceId,
        request_id: requestIdAddAccessor,
        success: false,
      });
    });

    after(function () {
      idp1EventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
    });
  });

  describe('IdP (idp1) should response with revoked accessor id (mode 3) unsuccessfully', function () {
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
    let initialSalt;
    let identityForResponse;
    let responseAccessorId;

    const requestStatusUpdates = [];
    const idp_requestStatusUpdates = [];
    const as_requestStatusUpdates = [];
    let lastStatusUpdateBlockHeight;

    let rp_node_id = 'rp1';
    let idpIdList;
    let dataRequestList;
    let requestMessageHash;

    before(function () {
      if (db.idp1Identities[0] == null) {
        throw new Error('No created identity to use');
      }

      const identity = db.idp1Identities.find(
        (identity) =>
          identity.namespace === namespace &&
          identity.identifier === identifier,
      );

      namespace = identity.namespace;
      identifier = identity.identifier;

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
          requestStatusUpdates.push(callbackData);
          if (callbackData.status === 'pending') {
            requestStatusPendingPromise.resolve(callbackData);
          } else if (callbackData.status === 'confirmed') {
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
        } else if (
          callbackData.type === 'request_status' &&
          callbackData.request_id === requestId
        ) {
          idp_requestStatusUpdates.push(callbackData);
          if (callbackData.status === 'pending') {
            idp_requestStatusPendingPromise.resolve(callbackData);
          } else if (callbackData.status === 'confirmed') {
            if (callbackData.data_request_list[0].response_list.length > 0) {
              if (callbackData.data_request_list[0].response_list[0].signed) {
                idp_requestStatusSignedDataPromise.resolve(callbackData);
              }
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
        } else if (
          callbackData.type === 'request_status' &&
          callbackData.request_id === requestId
        ) {
          as_requestStatusUpdates.push(callbackData);
          if (callbackData.status === 'confirmed') {
            if (callbackData.data_request_list[0].response_list.length > 0) {
              if (callbackData.data_request_list[0].response_list[0].signed) {
                as_requestStatusSignedDataPromise.resolve(callbackData);
              }
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

    it('RP should create a request successfully', async function () {
      this.timeout(10000);
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
      const splittedCreationBlockHeight = createRequestResult.creation_block_height.split(
        ':',
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
      lastStatusUpdateBlockHeight = parseInt(splittedCreationBlockHeight[1]);
    });

    it('RP should receive pending request status', async function () {
      this.timeout(20000);

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

      await receivePendingRequestStatusTest({
        nodeId: rp_node_id,
        createRequestParams,
        requestId,
        idpIdList,
        dataRequestList,
        requestMessageHash,
        lastStatusUpdateBlockHeight,
        requestStatusPendingPromise,
        requesterNodeId: rp_node_id,
      });

      // const requestStatus = await requestStatusPendingPromise.promise;
      // expect(requestStatus).to.deep.include({
      //   request_id: requestId,
      //   status: 'pending',
      //   mode: createRequestParams.mode,
      //   min_idp: createRequestParams.min_idp,
      //   answered_idp_count: 0,
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
      //   response_valid_list: [],
      // });
      // expect(requestStatus).to.have.property('block_height');
      // expect(requestStatus.block_height).is.a('string');
      // const splittedBlockHeight = requestStatus.block_height.split(':');
      // expect(splittedBlockHeight).to.have.lengthOf(2);
      // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
      // expect(parseInt(splittedBlockHeight[1])).to.equal(
      //   lastStatusUpdateBlockHeight
      // );
      // lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
    });

    it('IdP should receive incoming request callback', async function () {
      this.timeout(15000);
      const incomingRequest = await incomingRequestPromise.promise;

      const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
        (dataRequest) => {
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
      expect(incomingRequest.reference_group_code).to.be.a('string').that.is.not
        .empty;
      expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
        .empty;
      expect(incomingRequest.creation_time).to.be.a('number');
      expect(incomingRequest.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
        ':',
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('IdP should get request_message_padded_hash successfully', async function () {
      this.timeout(15000);

      identityForResponse = db.idp1Identities.find(
        (identity) =>
          identity.namespace === namespace &&
          identity.identifier === identifier,
      );

      const revokedAccessor = identityForResponse.accessors.find(
        (accessor) => accessor.revoked === true,
      );

      responseAccessorId = revokedAccessor.accessorId;
      // let accessorPublicKey = revokedAccessor.accessorPublicKey;

      // const testResult = await getAndVerifyRequestMessagePaddedHashTest({
      //   callApiAtNodeId: 'idp1',
      //   idpNodeId: 'idp1',
      //   requestId,
      //   incomingRequestPromise,
      //   accessorPublicKey,
      //   accessorId: responseAccessorId,
      // });
      // requestMessagePaddedHash = testResult.verifyRequestMessagePaddedHash;

      const response = await idpApi.getRequestMessagePaddedHash('idp1', {
        request_id: requestId,
        accessor_id: responseAccessorId,
      });
      expect(response.status).to.equal(400);
      const responseBody = await response.json();
      expect(responseBody.error.code).to.equal(20011);
    });

    // it('IdP should create response (accept) unsuccessfully', async function() {
    //   this.timeout(10000);

    //   const revokedAccessor = identityForResponse.accessors.find(
    //     accessor => accessor.revoked === true,
    //   );

    //   let accessorPrivateKey = revokedAccessor.accessorPrivateKey;

    //   const signature = createResponseSignature(
    //     accessorPrivateKey,
    //     requestMessagePaddedHash,
    //   );

    //   const response = await idpApi.createResponse('idp1', {
    //     reference_id: idpReferenceId,
    //     callback_url: config.IDP1_CALLBACK_URL,
    //     request_id: requestId,
    //     ial: 2.3,
    //     aal: 3,
    //     status: 'accept',
    //     accessor_id: revokedAccessor.accessorId,
    //     signature,
    //   });
    //   expect(response.status).to.equal(400);
    //   const responseBody = await response.json();
    //   expect(responseBody.error.code).to.equal(20011);
    // });

    after(function () {
      let identityIndex = db.idp1Identities.findIndex(
        (identity) =>
          identity.namespace === namespace &&
          identity.identifier === identifier,
      );
      db.idp1Identities.splice(identityIndex, 1);
      rpEventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
      as1EventEmitter.removeAllListeners('callback');
      idp2EventEmitter.removeAllListeners('callback');
    });
  });
});
