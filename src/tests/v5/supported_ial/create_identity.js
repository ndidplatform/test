import crypto from 'crypto';
import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import * as identityApi from '../../../api/v5/identity';
import * as commonApi from '../../../api/v5/common';
import * as ndidApiV6 from '../../../api/v6/ndid';
import * as apiHelpers from '../../../api/helpers';
import { idp1EventEmitter } from '../../../callback_server';
import * as db from '../../../db';
import { createEventPromise, generateReferenceId } from '../../../utils';
import { randomThaiIdNumber } from '../../../utils/thai_id';
import * as config from '../../../config';

import { ndidAvailable } from '../..';

describe('Create identity with new IAL test', function () {
  const supportedIALList = [
    1, 1.1, 1.2, 1.3, 1.9, 2.1, 2.2, 2.3, 3, 3.5, 4, 5, 5.2,
  ];

  let originalSupportedIALList;

  const namespace = 'citizen_id';
  const identifier = randomThaiIdNumber();
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

  before(async function () {
    this.timeout(10000);

    if (!ndidAvailable) {
      this.skip();
    }

    let response;

    response = await apiHelpers.getResponseAndBody(
      commonApi.getSupportedIALList('ndid1')
    );
    originalSupportedIALList = response.responseBody;

    await ndidApiV6.setSupportedIALList('ndid1', {
      supported_ial_list: supportedIALList,
    });

    idp1EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'create_identity_result' &&
        callbackData.reference_id === referenceId
      ) {
        createIdentityResultPromise.resolve(callbackData);
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
      ial: 1.9,
      lial: true,
      laal: true,
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
    expect(idpNode.mode_list).to.be.an('array').that.include(2);

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
    expect(responseBody.ial).to.equal(1.9);
  });

  it('After create identity should get identity LIAL successfully', async function () {
    const response = await identityApi.getIdentityLial('idp1', {
      namespace,
      identifier,
    });
    expect(response.status).to.equal(200);
    const responseBody = await response.json();
    expect(responseBody.lial).to.equal(true);
  });

  it('After create identity should get identity LAAL successfully', async function () {
    const response = await identityApi.getIdentityLaal('idp1', {
      namespace,
      identifier,
    });
    expect(response.status).to.equal(200);
    const responseBody = await response.json();
    expect(responseBody.laal).to.equal(true);
  });

  it('Should get relevant IdP nodes by sid successfully', async function () {
    this.timeout(15000);

    const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
      namespace,
      identifier,
    });
    const responseBody = await response.json();
    expect(responseBody).to.be.an('array').that.to.have.lengthOf(1);
    const idp = responseBody.find((node) => node.node_id === 'idp1');
    expect(idp.ial).to.equal(1.9);
    expect(idp.lial).to.equal(true);
    expect(idp.laal).to.equal(true);
  });

  after(async function () {
    this.timeout(5000);

    idp1EventEmitter.removeAllListeners('callback');

    await ndidApiV6.setSupportedIALList('ndid1', {
      supported_ial_list: originalSupportedIALList,
    });
  });
});
