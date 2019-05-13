import { expect } from 'chai';
import forge from 'node-forge';
import uuidv4 from 'uuid/v4';

import * as identityApi from '../../../api/v3/identity';
import * as idpApi from '../../../api/v3/idp';
import * as commonApi from '../../../api/v3/common';
import { idp1EventEmitter } from '../../../callback_server';
import * as db from '../../../db';
import {
  createEventPromise,
  generateReferenceId,
  wait,
  hash,
} from '../../../utils';
import * as config from '../../../config';

describe('Upgrade identity mode 2 to mode 3 (user has only idp mode 2) tests', function() {
  const upgradeIdentityModeRequestMessage =
    'upgrade identity mode consent request custom message';
  const namespace = 'citizen_id';
  const identifier = uuidv4();
  const keypair = forge.pki.rsa.generateKeyPair(2048);
  const accessorPrivateKey = forge.pki.privateKeyToPem(keypair.privateKey);
  const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);

  const referenceId = generateReferenceId();
  const idpResponseReferenceId = generateReferenceId();
  const upgradeIdentityReferenceId = generateReferenceId();

  const createIdentityResultPromise = createEventPromise();
  const incomingRequestPromise = createEventPromise();
  const accessorEncryptPromise = createEventPromise();
  const responseResultPromise = createEventPromise();
  const upgradeIdentityModeResultPromise = createEventPromise();
  const upgradeIdentityModeRequestResultPromise = createEventPromise();

  let accessorId;
  let referenceGroupCode;

  let requestId;
  let responseAccessorId;

  before(function() {
    idp1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'create_identity_result' &&
        callbackData.reference_id === referenceId
      ) {
        createIdentityResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'upgrade_identity_mode_request_result' &&
        callbackData.reference_id === upgradeIdentityReferenceId
      ) {
        upgradeIdentityModeRequestResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'upgrade_identity_mode_result' &&
        callbackData.request_id === requestId
      ) {
        upgradeIdentityModeResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId
      ) {
        incomingRequestPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.request_id === requestId
      ) {
        responseResultPromise.resolve(callbackData);
      }
    });

    idp1EventEmitter.on('accessor_encrypt_callback', function(callbackData) {
      if (callbackData.request_id === requestId) {
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

  it('Should create identity request (mode2) successfully', async function() {
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
    this.timeout(10000);
    const response = await identityApi.getIdentityIal('idp1', {
      namespace,
      identifier,
    });
    expect(response.status).to.equal(200);
    const responseBody = await response.json();
    expect(responseBody.ial).to.equal(2.3);

    await wait(2000);
  });

  it('Should upgrade identity mode 2 to mode 3 successfully', async function() {
    this.timeout(25000);
    const response = await identityApi.upgradeIdentityMode('idp1', {
      //node_id: 'idp1',
      reference_id: upgradeIdentityReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      namespace,
      identifier,
      request_message: upgradeIdentityModeRequestMessage,
    });
    expect(response.status).to.equal(202);
    const responseBody = await response.json();
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;

    requestId = responseBody.request_id;

    const upgradeIdentityModeRequestResult = await upgradeIdentityModeRequestResultPromise.promise;
    expect(upgradeIdentityModeRequestResult).to.deep.include({
      reference_id: upgradeIdentityReferenceId,
      request_id: requestId,
      success: true,
    });
    expect(upgradeIdentityModeRequestResult.creation_block_height).to.be.a(
      'string'
    );
    const splittedCreationBlockHeight = upgradeIdentityModeRequestResult.creation_block_height.split(
      ':'
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('1st IdP should receive upgrade identity request', async function() {
    this.timeout(15000);
    const incomingRequest = await incomingRequestPromise.promise;
    expect(incomingRequest).to.deep.include({
      mode: 2,
      request_id: requestId,
      reference_group_code: referenceGroupCode,
      request_message: upgradeIdentityModeRequestMessage,
      request_message_hash: hash(
        upgradeIdentityModeRequestMessage + incomingRequest.request_message_salt
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

    // requestMessageHash = incomingRequest.request_message_hash;
  });

  it('1st IdP should create response (accept) successfully', async function() {
    this.timeout(15000);
    const identity = db.idp1Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    responseAccessorId = identity.accessors[0].accessorId;

    const response = await idpApi.createResponse('idp1', {
      reference_id: idpResponseReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
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
      node_id: 'idp1',
      type: 'accessor_encrypt',
      accessor_id: responseAccessorId,
      key_type: 'RSA',
      padding: 'none',
      reference_id: idpResponseReferenceId,
      request_id: requestId,
    });

    expect(accessorEncryptParams.request_message_padded_hash).to.be.a('string')
      .that.is.not.empty;
  });

  it('IdP shoud receive callback create response result with success = true', async function() {
    const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      node_id: 'idp1',
      type: 'response_result',
      reference_id: idpResponseReferenceId,
      request_id: requestId,
      success: true,
    });
  });

  it('Identity should be upgrade mode successfully', async function() {
    this.timeout(15000);
    const upgradeIdentityModeResult = await upgradeIdentityModeResultPromise.promise;
    expect(upgradeIdentityModeResult).to.deep.include({
      reference_id: upgradeIdentityReferenceId,
      request_id: requestId,
      success: true,
    });

    const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
      namespace,
      identifier,
    });
    const idpNodes = await response.json();
    const idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
    expect(idpNode).to.not.be.undefined;
    expect(idpNodes)
      .to.be.an('array')
      .that.to.have.lengthOf(1);
    expect(idpNode.mode_list)
      .to.be.an('array')
      .that.include(2, 3);
  });

  after(function() {
    idp1EventEmitter.removeAllListeners('callback');
  });
});
