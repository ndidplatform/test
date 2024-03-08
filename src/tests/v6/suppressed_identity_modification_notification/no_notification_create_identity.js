import crypto from 'crypto';
import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import * as commonApi from '../../../api/v6/common';
import * as identityApi from '../../../api/v6/identity';
import * as ndidApi from '../../../api/v6/ndid';
import * as apiHelpers from '../../../api/helpers';

import { idp1EventEmitter, idp2EventEmitter } from '../../../callback_server';

import { createEventPromise, generateReferenceId, wait } from '../../../utils';

import * as config from '../../../config';

describe('IdP (idp2) register identity (suppressed notification) test', function () {
  const nodeId = 'idp2';

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

  const setup_createIdentityReferenceId = generateReferenceId();
  const setup_createIdentityResultPromise = createEventPromise();

  const createIdentityReferenceId = generateReferenceId();
  const createIdentityResultPromise = createEventPromise();

  let notificationCreateIdentityCallbackData;

  let referenceGroupCode;

  before(async function () {
    this.timeout(30000);

    await ndidApi.addSuppressedIdentityModificationNotificationNode('ndid1', {
      node_id: nodeId,
    });

    idp1EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'create_identity_result' &&
        callbackData.reference_id === setup_createIdentityReferenceId
      ) {
        setup_createIdentityResultPromise.resolve(callbackData);
      }
    });

    idp1EventEmitter.on(
      'identity_notification_callback',
      function (callbackData) {
        if (
          callbackData.type === 'identity_modification_notification' &&
          callbackData.reference_group_code === referenceGroupCode &&
          callbackData.action === 'create_identity'
        ) {
          notificationCreateIdentityCallbackData = callbackData;
        }
      }
    );

    idp2EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'create_identity_result' &&
        callbackData.reference_id === createIdentityReferenceId
      ) {
        createIdentityResultPromise.resolve(callbackData);
      }
    });

    await apiHelpers.getResponseAndBody(
      identityApi.createIdentity('idp1', {
        reference_id: setup_createIdentityReferenceId,
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
        mode: 2,
      })
    );

    const createIdentityResult =
      await setup_createIdentityResultPromise.promise;
    referenceGroupCode = createIdentityResult.reference_group_code;
  });

  // let accessorId;

  it('IdP (idp2) should create identity request successfully', async function () {
    this.timeout(10000);
    const response = await identityApi.createIdentity('idp2', {
      reference_id: createIdentityReferenceId,
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
    expect(responseBody).to.not.include.keys('request_id');
    expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.exist).to.equal(true);

    // accessorId = responseBody.accessor_id;
  });

  it('identity should be created successfully', async function () {
    this.timeout(15000);
    const createIdentityResult = await createIdentityResultPromise.promise;
    expect(createIdentityResult).to.deep.include({
      reference_id: createIdentityReferenceId,
      success: true,
    });
    expect(createIdentityResult.reference_group_code).to.be.a('string').that.is
      .not.empty;
    expect(createIdentityResult.reference_group_code).to.equal(
      referenceGroupCode
    );

    const response = await commonApi.getRelevantIdpNodesBySid('idp2', {
      namespace,
      identifier,
    });

    const idpNodes = await response.json();
    const idpNode = idpNodes.find((idpNode) => idpNode.node_id === 'idp2');
    expect(idpNode).to.not.be.undefined;
    expect(idpNode.mode_list).to.be.an('array').that.include(2);
  });

  it('After create identity, IdP (idp1) that associated with this sid should NOT receive identity notification callback (test waits for 5 seconds)', async function () {
    this.timeout(15000);

    await wait(5000);

    expect(notificationCreateIdentityCallbackData).to.be.undefined;

    // expect(notificationCreateIdentity).to.deep.include({
    //   node_id: 'idp1',
    //   type: 'identity_modification_notification',
    //   reference_group_code: referenceGroupCode,
    //   action: 'create_identity',
    //   actor_node_id: nodeId,
    // });
  });

  after(async function () {
    this.timeout(10000);

    idp1EventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('identity_notification_callback');

    idp2EventEmitter.removeAllListeners('callback');

    await ndidApi.removeSuppressedIdentityModificationNotificationNode(
      'ndid1',
      {
        node_id: nodeId,
      }
    );

    await wait(2000);
  });
});
