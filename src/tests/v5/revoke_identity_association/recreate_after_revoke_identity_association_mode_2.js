import crypto from 'crypto';
import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import * as commonApi from '../../../api/v5/common';
import * as identityApi from '../../../api/v5/identity';
import * as apiHelpers from '../../../api/helpers';

import { idp1EventEmitter } from '../../../callback_server';

import { createEventPromise, generateReferenceId } from '../../../utils';

import * as config from '../../../config';

describe('IdP (idp1) re-register identity after revoke association (mode 2) test', function () {
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

  const requestMessage =
    'revoke identity association consent request custom message ข้อความสำหรับขอเพิกถอนความสัมพันธ์กับ idp1 บนระบบ';

  const setup_createIdentityReferenceId = generateReferenceId();
  const setup_createIdentityResultPromise = createEventPromise();

  const referenceId = generateReferenceId();

  const revokeIdentityResultPromise = createEventPromise();

  const createIdentityReferenceId = generateReferenceId();
  const createIdentityResultPromise = createEventPromise();

  let referenceGroupCode;

  before(async function () {
    this.timeout(30000);

    idp1EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'create_identity_result' &&
        callbackData.reference_id === setup_createIdentityReferenceId
      ) {
        setup_createIdentityResultPromise.resolve(callbackData);
      }

      if (
        callbackData.type === 'revoke_identity_association_result' &&
        callbackData.reference_id === referenceId
      ) {
        revokeIdentityResultPromise.resolve(callbackData);
      }

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
        ial: 2.1,
        lial: false,
        laal: false,
        mode: 2,
      })
    );

    const createIdentityResult =
      await setup_createIdentityResultPromise.promise;
    referenceGroupCode = createIdentityResult.reference_group_code;
  });

  it('IdP (idp1) should revoke identity association successfully', async function () {
    this.timeout(10000);
    const response = await identityApi.revokeIdentityAssociation('idp1', {
      namespace: namespace,
      identifier: identifier,
      reference_id: referenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_message: requestMessage,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody).to.be.an('object').that.is.empty;
  });

  // it('IdP should get request_id by reference_id while request is unfinished (not closed or timed out) successfully', async function () {
  //   this.timeout(10000);
  //   const response = await identityApi.getRequestIdByReferenceId('idp1', {
  //     reference_id: referenceId,
  //   });
  //   const responseBody = await response.json();
  //   expect(response.status).to.equal(200);
  //   expect(responseBody).to.be.an('object').that.is.empty;
  // });

  it('Identity association should be revoked successfully', async function () {
    this.timeout(10000);
    const revokeIdentityAssociationResult =
      await revokeIdentityResultPromise.promise;
    expect(revokeIdentityAssociationResult).to.deep.include({
      reference_id: referenceId,
      success: true,
    });
  });

  // it('IdP should get response status code 404 when get request_id by reference_id after request is finished (closed)', async function () {
  //   this.timeout(10000);
  //   const response = await identityApi.getRequestIdByReferenceId('idp1', {
  //     reference_id: referenceId,
  //   });
  //   expect(response.status).to.equal(404);
  // });

  it('After revoked identity association should query idp that associate with this sid not found', async function () {
    this.timeout(10000);
    const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
      namespace,
      identifier,
    });
    expect(response.status).equal(200);
    const idpNodes = await response.json();
    const idpNode = idpNodes.find((idpNode) => idpNode.node_id === 'idp1');
    expect(idpNode).to.be.undefined;
  });

  const newIal = 2.3;
  const newLial = true;
  const newLaal = true;
  // let accessorId;

  it('should create identity request (mode2) (re-create identity) successfully', async function () {
    this.timeout(10000);
    const response = await identityApi.createIdentity('idp1', {
      reference_id: createIdentityReferenceId,
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
      ial: newIal,
      lial: newLial,
      laal: newLaal,
      mode: 2,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody).to.not.include.keys('request_id');
    expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.exist).to.equal(true);

    // accessorId = responseBody.accessor_id;
  });

  it('identity should be re-created successfully', async function () {
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

    const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
      namespace,
      identifier,
    });

    const idpNodes = await response.json();
    const idpNode = idpNodes.find((idpNode) => idpNode.node_id === 'idp1');
    expect(idpNode).to.not.be.undefined;
    expect(idpNode.mode_list).to.be.an('array').that.include(2);
  });

  it('identity should have new IAL', async function () {
    this.timeout(10000);
    const response = await identityApi.getIdentityIal('idp1', {
      namespace,
      identifier,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody.ial).to.equal(newIal);
  });

  it('identity should have new LIAL', async function () {
    this.timeout(10000);
    const response = await identityApi.getIdentityLial('idp1', {
      namespace,
      identifier,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody.lial).to.equal(newLial);
  });

  it('identity should have new LAAL', async function () {
    this.timeout(10000);
    const response = await identityApi.getIdentityLaal('idp1', {
      namespace,
      identifier,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody.laal).to.equal(newLaal);
  });

  after(function () {
    idp1EventEmitter.removeAllListeners('callback');
  });
});
