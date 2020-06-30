import crypto from 'crypto';
import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import * as identityApi from '../../../api/v5/identity';
import * as idpApi from '../../../api/v5/idp';
import * as commonApi from '../../../api/v5/common';
import {
  idp1EventEmitter,
  idp2EventEmitter,
} from '../../../callback_server';
import * as db from '../../../db';
import {
  createEventPromise,
  generateReferenceId,
  wait,
  hash,
  createResponseSignature,
} from '../../../utils';
import { idp2Available } from '../../';
import * as config from '../../../config';
import { getAndVerifyRequestMessagePaddedHashTest } from '../_fragments/request_flow_fragments/idp';

//* This test file for create identity relevant with all IdP for test auto close config

describe('Create identity (mode 2) relevant with all IdP for test', function () {
  const namespace = 'citizen_id';
  const identifier = uuidv4();
  describe('IdP (idp1) create identity (mode 2)', function () {
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

    before(function () {
      idp1EventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'create_identity_result' &&
          callbackData.reference_id === referenceId
        ) {
          createIdentityResultPromise.resolve(callbackData);
        }
      });
    });

    it('Should create identity request (mode2) successfully', async function () {
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
      expect(responseBody).to.not.include.keys('request_id');
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
      expect(createIdentityResult.reference_group_code).to.be.a('string').that
        .is.not.empty;

      referenceGroupCode = createIdentityResult.reference_group_code;

      const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
        namespace,
        identifier,
      });

      const idpNodes = await response.json();
      const idpNode = idpNodes.find((idpNode) => idpNode.node_id === 'idp1');
      expect(idpNode).to.not.be.undefined;
      expect(idpNode.mode_list).to.be.an('array').that.include(2);
      await wait(3000);

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
        relevantAllIdP: true,
      });
    });
  });

  describe('IdP (idp2) create identity (mode 2) as 2nd IdP', function () {
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

    db.createIdentityReferences.push({
      referenceId,
      accessorPrivateKey,
    });

    before(function () {
      if (!idp2Available) {
        this.test.parent.pending = true;
        this.skip();
      }

      const identity = db.idp1Identities.find(
        (identity) => identity.namespace === namespace && identity.identifier === identifier
      );

      referenceGroupCode = identity.referenceGroupCode;

      idp2EventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'create_identity_result' &&
          callbackData.reference_id === referenceId
        ) {
          createIdentityResultPromise.resolve(callbackData);
        }
      });
    });

    it('Idp (idp2) should create identity request (mode 2) as 2nd IdP successfully', async function () {
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
        mode: 2,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody).to.not.include.keys('request_id');
      expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.exist).to.equal(true);

      accessorId = responseBody.accessor_id;
    });

    it('Identity should be created successfully', async function () {
      this.timeout(15000);
      const createIdentityResult = await createIdentityResultPromise.promise;
      expect(createIdentityResult).to.deep.include({
        reference_id: referenceId,
        success: true,
      });

      expect(createIdentityResult.reference_group_code).to.equal(
        referenceGroupCode,
      );

      //referenceGroupCode = createIdentityResult.reference_group_code;

      const response = await commonApi.getRelevantIdpNodesBySid('idp2', {
        namespace,
        identifier,
      });
      const idpNodes = await response.json();
      const idpNode = idpNodes.find((idpNode) => idpNode.node_id === 'idp2');
      expect(idpNode).to.not.be.undefined;
      expect(idpNodes).to.be.an('array').that.to.have.lengthOf(2);
      expect(idpNode.mode_list).to.be.an('array').that.include(2);
      await wait(3000);

      db.idp2Identities.push({
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
        relevantAllIdP: true,
      });
    });
  });

  after(function () {
    idp1EventEmitter.removeAllListeners('create_identity_result');
    idp2EventEmitter.removeAllListeners('create_identity_result');
  });
});

describe('Create identity (mode 3) relevant with all IdP for test', function () {
  const namespace = 'citizen_id';
  const identifier = uuidv4();
  describe('IdP (idp1) create identity (mode 3)', function () {
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

    before(function () {
      idp1EventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'create_identity_result' &&
          callbackData.reference_id === referenceId
        ) {
          createIdentityResultPromise.resolve(callbackData);
        }
      });
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
      expect(responseBody).to.not.include.keys('request_id');
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
      expect(createIdentityResult.reference_group_code).to.be.a('string').that
        .is.not.empty;

      referenceGroupCode = createIdentityResult.reference_group_code;
      await wait(3000);

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
        relevantAllIdP: true,
      });
    });
  });

  describe('IdP (idp2) create identity (mode 3) as 2nd IdP', function () {
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
    const idpReferenceId = generateReferenceId();

    const incomingRequestPromise = createEventPromise(); // idp1
    const responseResultPromise = createEventPromise(); // idp1

    const createIdentityRequestResultPromise = createEventPromise(); // idp2
    const createIdentityResultPromise = createEventPromise(); // idp2

    let requestId;
    let accessorId;
    let requestMessagePaddedHash;
    let referenceGroupCode;
    //   let requestMessageHash;
    const createIdentityRequestMessage =
      'Create identity consent request custom message ข้อความสำหรับขอสร้างตัวตนบนระบบ';
    let identityForResponse;
    let responseAccessorId;

    before(function () {
      if (!idp2Available) {
        this.test.parent.pending = true;
        this.skip();
      }

      const identity = db.idp1Identities.find(
        (identity) => identity.mode === 3 && identity.namespace === namespace && identity.identifier === identifier,
      );
      referenceGroupCode = identity.referenceGroupCode;

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

      idp2EventEmitter.on('callback', function (callbackData) {
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
    });

    it('Idp (idp2) should create identity request (mode 3) as 2nd IdP successfully', async function () {
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
        mode: 3,
        request_message: createIdentityRequestMessage,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.exist).to.equal(true);

      requestId = responseBody.request_id;
      accessorId = responseBody.accessor_id;

      const createIdentityRequestResult = await createIdentityRequestResultPromise.promise;
      expect(createIdentityRequestResult).to.deep.include({
        reference_id: referenceId,
        request_id: requestId,
        exist: true,
        accessor_id: accessorId,
        success: true,
      });
      expect(createIdentityRequestResult.creation_block_height).to.be.a(
        'string',
      );
      const splittedCreationBlockHeight = createIdentityRequestResult.creation_block_height.split(
        ':',
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('1st IdP should receive create identity request', async function () {
      this.timeout(15000);
      const incomingRequest = await incomingRequestPromise.promise;
      expect(incomingRequest).to.deep.include({
        mode: 3,
        request_id: requestId,
        reference_group_code: referenceGroupCode,
        request_message: createIdentityRequestMessage,
        request_message_hash: hash(
          createIdentityRequestMessage + incomingRequest.request_message_salt,
        ),
        requester_node_id: 'idp2',
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

      // requestMessageHash = incomingRequest.request_message_hash;
    });

    it('IdP should get request_message_padded_hash successfully', async function () {
      identityForResponse = db.idp1Identities.find(
        (identity) =>
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

    it('1st IdP should create response (accept) successfully', async function () {
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

    it('IdP shoud receive callback create response result with success = true', async function () {
      const responseResult = await responseResultPromise.promise;
      expect(responseResult).to.deep.include({
        node_id: 'idp1',
        type: 'response_result',
        reference_id: idpReferenceId,
        request_id: requestId,
        success: true,
      });
    });

    it('Identity should be created successfully', async function () {
      this.timeout(15000);
      const createIdentityResult = await createIdentityResultPromise.promise;
      expect(createIdentityResult).to.deep.include({
        reference_id: referenceId,
        request_id: requestId,
        success: true,
      });
      await wait(3000);

      db.idp2Identities.push({
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
        relevantAllIdP: true,
      });
    });
  });

  after(function () {
    idp1EventEmitter.removeAllListeners('callback');
    idp2EventEmitter.removeAllListeners('callback');
  });
});
