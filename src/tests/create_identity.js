import { expect } from 'chai';
import forge from 'node-forge';
import uuidv4 from 'uuid/v4';

import * as idpApi from '../api/v2/idp';
import * as commonApi from '../api/v2/common';
import { idp1EventEmitter } from '../callback_server';
import * as db from '../db';
import { createEventPromise, generateReferenceId } from '../utils';
import * as config from '../config';

const namespace = 'cid';
const identifier = uuidv4();
const keypair = forge.pki.rsa.generateKeyPair(2048);
const accessorPrivateKey = forge.pki.privateKeyToPem(keypair.privateKey);
const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);

describe('IdP (idp1) create identity (without providing accessor_id)', function() {
  const referenceId = generateReferenceId();

  const createIdentityRequestResultPromise = createEventPromise();
  const createIdentityResultPromise = createEventPromise();

  let requestId;
  let accessorId;

  db.createIdentityReferences.push({
    referenceId,
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

    idp1EventEmitter.on('callback', function(callbackData) {
      if (callbackData.type === 'create_identity_request_result') {
        createIdentityRequestResultPromise.resolve(callbackData);
      } else if (callbackData.type === 'create_identity_result') {
        createIdentityResultPromise.resolve(callbackData);
      }
    });
  });

  it('should create identity request successfully', async function() {
    this.timeout(10000);
    const response = await idpApi.createIdentity('idp1', {
      reference_id: referenceId,
      callback_url: config.IDP1_CALLBACK_URL,
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
      reference_id: referenceId,
      request_id: requestId,
      exist: false,
      accessor_id: accessorId,
      success: true,
    });
  });

  it('Identity should be created successfully', async function() {
    this.timeout(15000);
    const createIdentityResult = await createIdentityResultPromise.promise;
    expect(createIdentityResult).to.deep.include({
      reference_id: referenceId,
      request_id: requestId,
      success: true,
    });
    expect(createIdentityResult.secret).to.be.a('string').that.is.not.empty;

    const secret = createIdentityResult.secret;

    const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
      namespace,
      identifier,
    });
    const idpNodes = await response.json();
    const idpNode = idpNodes.find((idpNode) => idpNode.node_id === 'idp1');
    expect(idpNode).to.exist;

    db.identities.push({
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

  after(function() {
    idp1EventEmitter.removeAllListeners('callback');
  });
});
