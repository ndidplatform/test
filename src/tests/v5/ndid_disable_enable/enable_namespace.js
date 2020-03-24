import { expect } from 'chai';
import forge from 'node-forge';
import uuidv4 from 'uuid/v4';

import * as ndidApi from '../../../api/v5/ndid';
import * as idpApi from '../../../api/v5/idp';
import * as identityApi from '../../../api/v5/identity';
import * as commonApi from '../../../api/v5/common';

import { idp1EventEmitter } from '../../../callback_server';
import { createEventPromise, generateReferenceId, wait } from '../../../utils';
import * as config from '../../../config';

describe('NDID enable namespace test', function() {
  const namespace = 'citizen_id';
  const identifier = uuidv4();
  const keypair = forge.pki.rsa.generateKeyPair(2048);
  const accessorPrivateKey = forge.pki.privateKeyToPem(keypair.privateKey);
  const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);

  const referenceId = generateReferenceId();

  const createIdentityRequestResultPromise = createEventPromise();
  const createIdentityResultPromise = createEventPromise();
  const accessorEncryptPromise = createEventPromise();

  let requestId;
  let referenceGroupCode;

  before(async function() {
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

    idp1EventEmitter.on('accessor_encrypt_callback', function(callbackData) {
      if (callbackData.request_id === requestId) {
        accessorEncryptPromise.resolve(callbackData);
      }
    });
  });

  it('NDID should enable namespace (cid) successfully', async function() {
    this.timeout(10000);

    const response = await ndidApi.enableNamespace('ndid1', {
      namespace: 'citizen_id',
    });

    expect(response.status).to.equal(204);
    await wait(1000);
  });

  it('Namespace (cid) should be enabled successfully', async function() {
    this.timeout(10000);

    const responseUtilityGetNamespaces = await commonApi.getNamespaces('ndid1');
    const responseBody = await responseUtilityGetNamespaces.json();

    let namespace = responseBody.find(
      namespace => namespace.namespace === 'citizen_id'
    );

    expect(namespace).to.be.an('object');
  });

  it('should create identity request successfully', async function() {
    this.timeout(10000);
    const response = await identityApi.createIdentity('idp1', {
      reference_id: referenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      identity_list: [{ namespace, identifier }],
      accessor_type: 'RSA',
      accessor_public_key: accessorPublicKey,
      //accessor_id,
      ial: 2.3,
      mode: 3,
    });
    const responseBody = await response.json();

    expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;

    //accessorId = responseBody.accessor_id;
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
    idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
  });
});
