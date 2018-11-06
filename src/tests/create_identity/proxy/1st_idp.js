import { expect } from 'chai';
import forge from 'node-forge';
import uuidv4 from 'uuid/v4';

import * as idpApi from '../../../api/v2/idp';
import * as commonApi from '../../../api/v2/common';
import { proxy1EventEmitter } from '../../../callback_server';
import * as db from '../../../db';
import {
  createEventPromise,
  generateReferenceId,
  hash,
  wait,
} from '../../../utils';
import * as config from '../../../config';

describe('IdP (idp1) create identity (without providing accessor_id) as 1st IdP', function() {
  const nodeId = 'proxy1_idp4';

  const namespace = 'citizen_id';
  const identifier = uuidv4();
  const keypair = forge.pki.rsa.generateKeyPair(2048);
  const accessorPrivateKey = forge.pki.privateKeyToPem(keypair.privateKey);
  const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);

  const referenceId = generateReferenceId();
  const referenceIdForRecalculateSecret = generateReferenceId();

  const createIdentityRequestResultPromise = createEventPromise();
  const accessorSignPromise = createEventPromise();
  const createIdentityResultPromise = createEventPromise();

  let requestId;
  let accessorId;
  let secret;

  db.createIdentityReferences.push({
    referenceId,
    accessorPrivateKey,
  });

  db.createIdentityReferences.push({
    referenceId: referenceIdForRecalculateSecret,
    accessorPrivateKey,
  });

  before(function() {
    // const response = await commonApi.getRelevantIdpNodesBySid('idp', {
    //   namespace,
    //   identifier,
    // });
    // const idpNodes = await response.json();
    // const idpNode = idpNodes.find((idpNode) => idpNode.node_id === 'idp1');
    // if (idpNode != null){
    //   this.skip();
    // }

    proxy1EventEmitter.on('callback', function(callbackData) {
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

    proxy1EventEmitter.on('accessor_sign_callback', function(callbackData) {
      if (callbackData.reference_id === referenceId) {
        accessorSignPromise.resolve(callbackData);
      }
    });
  });

  it('should create identity request successfully', async function() {
    this.timeout(10000);
    const response = await idpApi.createIdentity('proxy1', {
      node_id: nodeId,
      reference_id: referenceId,
      callback_url: config.PROXY1_CALLBACK_URL,
      namespace,
      identifier,
      accessor_type: 'RSA',
      accessor_public_key: accessorPublicKey,
      //accessor_id,
      ial: 2.3,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;

    requestId = responseBody.request_id;
    accessorId = responseBody.accessor_id;

    const createIdentityRequestResult = await createIdentityRequestResultPromise.promise;
    expect(createIdentityRequestResult).to.deep.include({
      node_id: nodeId,
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

  it('should receive accessor sign callback with correct data', async function() {
    this.timeout(15000);
    const sid = `${namespace}:${identifier}`;
    const sid_hash = hash(sid);

    const accessorSignParams = await accessorSignPromise.promise;
    expect(accessorSignParams).to.deep.equal({
      node_id: nodeId,
      type: 'accessor_sign',
      reference_id: referenceId,
      accessor_id: accessorId,
      sid,
      sid_hash,
      hash_method: 'SHA256',
      key_type: 'RSA',
      sign_method: 'RSA-SHA256',
      padding: 'PKCS#1v1.5',
    });
  });

  it('Identity should be created successfully', async function() {
    this.timeout(15000);
    const createIdentityResult = await createIdentityResultPromise.promise;
    expect(createIdentityResult).to.deep.include({
      node_id: nodeId,
      reference_id: referenceId,
      request_id: requestId,
      success: true,
    });
    expect(createIdentityResult.secret).to.be.a('string').that.is.not.empty;

    secret = createIdentityResult.secret;

    const response = await commonApi.getRelevantIdpNodesBySid('proxy1', {
      namespace,
      identifier,
    });
    const idpNodes = await response.json();
    const idpNode = idpNodes.find((idpNode) => idpNode.node_id === nodeId);
    expect(idpNode).to.exist;

    db.proxy1Idp4Identities.push({
      namespace,
      identifier,
      accessors: [
        {
          accessorId,
          accessorPrivateKey,
          accessorPublicKey,
          secret,
        },
      ],
    });
  });

  it('Special request status for create identity should be completed and closed', async function() {
    this.timeout(10000);
    //wait for API close request
    await wait(3000);
    const response = await commonApi.getRequest('proxy1', { requestId });
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
      mode: 3,
      status: 'completed',
      requester_node_id: nodeId,
    });
  });

  it('Re-calculate secret should return same result', async function() {
    this.timeout(10000);
    const response = await idpApi.reCalculateSecret('proxy1', {
      node_id: nodeId,
      accessor_id: accessorId,
      namespace,
      identifier,
      reference_id: referenceIdForRecalculateSecret,
    });
    const responseBody = await response.json();
    expect(responseBody.secret).to.be.eq(secret);
  });

  after(function() {
    proxy1EventEmitter.removeAllListeners('callback');
    proxy1EventEmitter.removeAllListeners('accessor_sign_callback');
  });
});
