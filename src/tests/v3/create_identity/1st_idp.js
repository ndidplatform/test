import { expect } from 'chai';
import forge from 'node-forge';
import uuidv4 from 'uuid/v4';

import * as identityApi from '../../../api/v3/identity';
import * as commonApi from '../../../api/v3/common';
import { idp1EventEmitter } from '../../../callback_server';
import * as db from '../../../db';
import { createEventPromise, generateReferenceId, wait } from '../../../utils';
import * as config from '../../../config';

describe('IdP (idp1) create identity (without providing accessor_id) as 1st IdP', function() {
  const namespace = 'citizen_id';
  const identifier = uuidv4();
  const keypair = forge.pki.rsa.generateKeyPair(2048);
  const accessorPrivateKey = forge.pki.privateKeyToPem(keypair.privateKey);
  const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);

  const referenceId = generateReferenceId();

  const createIdentityRequestResultPromise = createEventPromise();
  const createIdentityResultPromise = createEventPromise();

  let requestId;
  let accessorId;
  let referenceGroupCode;

  db.createIdentityReferences.push({
    referenceId,
    accessorPrivateKey,
  });

  before(function() {
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
  });

  it('Before create identity this sid should not associated with idp1 ', async function() {
    const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
      namespace,
      identifier,
    });
    const idpNodes = await response.json();
    const idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
    expect(idpNode).to.be.an.undefined;
    //expect(idpNode.mode_list).to.not.be.null.and.to.not.be.undefined;
  });

  it('Should create identity request (mode2) successfully', async function() {
    this.timeout(10000);
    const response = await identityApi.createIdentity('idp1', {
      reference_id: referenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      namespace,
      identifier,
      accessor_type: 'RSA',
      accessor_public_key: accessorPublicKey,
      //accessor_id,
      ial: 2.3,
      mode: 2,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;

    requestId = responseBody.request_id;
    accessorId = responseBody.accessor_id;

    const createIdentityRequestResult = await createIdentityRequestResultPromise.promise;
    expect(createIdentityRequestResult).to.deep.include({
      reference_id: referenceId,
      request_id: requestId,
      exist: false,
      accessor_id: accessorId,
      success: true,
    });
    expect(createIdentityRequestResult.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight = createIdentityRequestResult.creation_block_height.split(
      ':'
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  // it('should receive accessor sign callback with correct data', async function() {
  //   this.timeout(15000);
  //   const sid = `${namespace}:${identifier}`;
  //   const sid_hash = hash(sid);

  //   const accessorSignParams = await accessorSignPromise.promise;
  //   expect(accessorSignParams).to.deep.equal({
  //     type: 'accessor_sign',
  //     node_id: 'idp1',
  //     reference_id: referenceId,
  //     accessor_id: accessorId,
  //     sid,
  //     sid_hash,
  //     hash_method: 'SHA256',
  //     key_type: 'RSA',
  //     sign_method: 'RSA-SHA256',
  //     padding: 'PKCS#1v1.5',
  //   });
  // });

  it('Identity should be created successfully', async function() {
    this.timeout(15000);
    const createIdentityResult = await createIdentityResultPromise.promise;
    expect(createIdentityResult).to.deep.include({
      reference_id: referenceId,
      request_id: requestId,
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

  it('Special request status for create identity (mode 2) should be completed and closed', async function() {
    this.timeout(10000);
    //wait for API close request
    await wait(3000);
    const response = await commonApi.getRequest('idp1', { requestId });
    const responseBody = await response.json();
    expect(responseBody).to.deep.include({
      request_id: requestId,
      min_idp: 0,
      min_aal: 1,
      min_ial: 1.1,
      request_timeout: 86400,
      data_request_list: [],
      response_list: [],
      closed: true,
      timed_out: false,
      mode: 2,
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

  after(function() {
    idp1EventEmitter.removeAllListeners('callback');
  });
});

describe('IdP (idp1) create identity (with providing accessor_id) as 1st IdP', function() {
  const namespace = 'citizen_id';
  const identifier = uuidv4();
  const keypair = forge.pki.rsa.generateKeyPair(2048);
  const accessorPrivateKey = forge.pki.privateKeyToPem(keypair.privateKey);
  const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);
  const accessorId = uuidv4();

  const referenceId = generateReferenceId();

  const createIdentityRequestResultPromise = createEventPromise();
  const createIdentityResultPromise = createEventPromise();

  let requestId;
  let referenceGroupCode;

  db.createIdentityReferences.push({
    referenceId,
    accessorPrivateKey,
  });

  before(function() {
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
  });

  it('Before create identity this sid should not associated with idp1 ', async function() {
    const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
      namespace,
      identifier,
    });
    const idpNodes = await response.json();
    const idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
    expect(idpNode).to.be.an.undefined;
    //expect(idpNode.mode_list).to.not.be.null.and.to.not.be.undefined;
  });

  it('should create identity request (mode2) successfully', async function() {
    this.timeout(10000);
    const response = await identityApi.createIdentity('idp1', {
      reference_id: referenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      namespace,
      identifier,
      accessor_type: 'RSA',
      accessor_public_key: accessorPublicKey,
      accessor_id: accessorId,
      ial: 2.3,
      mode: 2,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;

    requestId = responseBody.request_id;
    //accessorId = responseBody.accessor_id;

    const createIdentityRequestResult = await createIdentityRequestResultPromise.promise;
    expect(createIdentityRequestResult).to.deep.include({
      reference_id: referenceId,
      request_id: requestId,
      exist: false,
      accessor_id: accessorId,
      success: true,
    });
    expect(createIdentityRequestResult.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight = createIdentityRequestResult.creation_block_height.split(
      ':'
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  // it('should receive accessor sign callback with correct data', async function() {
  //   this.timeout(15000);
  //   const sid = `${namespace}:${identifier}`;
  //   const sid_hash = hash(sid);

  //   const accessorSignParams = await accessorSignPromise.promise;
  //   expect(accessorSignParams).to.deep.equal({
  //     type: 'accessor_sign',
  //     node_id: 'idp1',
  //     reference_id: referenceId,
  //     accessor_id: accessorId,
  //     sid,
  //     sid_hash,
  //     hash_method: 'SHA256',
  //     key_type: 'RSA',
  //     sign_method: 'RSA-SHA256',
  //     padding: 'PKCS#1v1.5',
  //   });
  // });

  it('Identity should be created successfully', async function() {
    this.timeout(15000);
    const createIdentityResult = await createIdentityResultPromise.promise;
    expect(createIdentityResult).to.deep.include({
      reference_id: referenceId,
      request_id: requestId,
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
    //expect(idpNode.mode_list).to.not.be.null.and.to.not.be.undefined;

    db.idp1Identities.push({
      referenceGroupCode,
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

  it('Special request status for create identity (mode 2) should be completed and closed', async function() {
    this.timeout(10000);
    //wait for API close request
    await wait(3000);
    const response = await commonApi.getRequest('idp1', { requestId });
    const responseBody = await response.json();
    expect(responseBody).to.deep.include({
      request_id: requestId,
      min_idp: 0,
      min_aal: 1,
      min_ial: 1.1,
      request_timeout: 86400,
      data_request_list: [],
      response_list: [],
      closed: true,
      timed_out: false,
      mode: 2,
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

  after(function() {
    idp1EventEmitter.removeAllListeners('callback');
  });
});
