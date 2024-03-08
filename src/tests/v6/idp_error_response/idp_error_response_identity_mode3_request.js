import crypto from 'crypto';
import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import * as identityApi from '../../../api/v6/identity';
import * as idpApi from '../../../api/v6/idp';
import * as commonApi from '../../../api/v6/common';
import {
  idp1EventEmitter,
  idp2EventEmitter,
  idp3EventEmitter,
} from '../../../callback_server';
import * as db from '../../../db';
import {
  createEventPromise,
  generateReferenceId,
  wait,
  hash,
} from '../../../utils';
import { idp2Available } from '../../';
import * as config from '../../../config';

describe('IdP error response create identity (mode 3) test', function () {
  let idp1Identity;

  describe('IdP (idp1) create identity (mode 3)', function () {
    const namespace = 'citizen_id';
    const identifier = uuidv4();
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
        lial: false,
        laal: false,
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

      idp1Identity = {
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
      };
    });
  });

  describe('IdP (idp2) create identity (mode 3) as 2nd IdP and idp1 response error request', function () {
    let namespace;
    let identifier;

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
    const createIdentityRequestMessage =
      'Create identity consent request custom message ข้อความสำหรับขอสร้างตัวตนบนระบบ';

    before(function () {
      if (!idp2Available) {
        this.test.parent.pending = true;
        this.skip();
      }

      namespace = idp1Identity.namespace;
      identifier = idp1Identity.identifier;
      referenceGroupCode = idp1Identity.referenceGroupCode;

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
        lial: false,
        laal: false,
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
    });

    it('1st IdP should create response (accept) successfully', async function () {
      this.timeout(10000);

      let idpResponse = {
        reference_id: idpReferenceId,
        callback_url: config.IDP1_CALLBACK_URL,
        request_id: requestId,
        error_code: 1000,
      };

      const response = await idpApi.createErrorResponse('idp1', idpResponse);
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
    it('Identity should be created unsuccessfully', async function () {
      this.timeout(15000);
      const createIdentityResult = await createIdentityResultPromise.promise;
      expect(createIdentityResult).to.deep.include({
        reference_id: referenceId,
        request_id: requestId,
        success: false,
      });
      await wait(3000);
    });

    it('Should not found idp2 when get relevant IdP nodes by sid that idp1 error response for create identity', async function () {
      this.timeout(15000);
      const response = await commonApi.getRelevantIdpNodesBySid('rp1', {
        namespace,
        identifier,
      });
      const idpNodes = await response.json();
      expect(idpNodes).to.not.be.undefined;
      expect(idpNodes).to.be.an('array').that.to.have.lengthOf(1);
      const idp2 = idpNodes.find((idp) => idp.node_id === 'idp2');
      expect(idp2).to.be.undefined;
    });
  });

  after(function () {
    idp1EventEmitter.removeAllListeners('callback');
    idp2EventEmitter.removeAllListeners('callback');
    idp3EventEmitter.removeAllListeners('callback');
  });
});
