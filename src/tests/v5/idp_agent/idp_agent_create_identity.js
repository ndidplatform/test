import crypto from 'crypto';
import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import * as identityApi from '../../../api/v5/identity';
import * as commonApi from '../../../api/v5/common';
import * as ndidApi from '../../../api/v5/ndid';
import { idp3EventEmitter } from '../../../callback_server';
import { createEventPromise, generateReferenceId, wait } from '../../../utils';
import * as config from '../../../config';
import { ndidAvailable, idp3Available } from '../..';

describe('Create identity by idp agent tests', function () {
  before(function () {
    if (!ndidAvailable || !idp3Available) {
      this.skip();
    }
  });

  it('NDID should update IdP node to IdP agent successfully', async function () {
    this.timeout(10000);
    const response = await ndidApi.updateNode('ndid1', {
      node_id: 'idp3',
      agent: true,
    });
    expect(response.status).to.equal(204);

    await wait(3000);

    const responseGetNodeInfo = await commonApi.getNodeInfo('ndid1', {
      node_id: 'idp3',
    });
    const responseBody = await responseGetNodeInfo.json();
    expect(responseGetNodeInfo.status).to.equal(200);
    expect(responseBody.agent).to.be.true;
  });

  it('Should get all IdP filter by agent = true successfully', async function () {
    this.timeout(10000);
    const response = await commonApi.getIdP('ndid1', { agent: true });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.be.an('array');
    expect(responseBody).to.have.length(1);
    expect(responseBody[0].node_id).to.equal('idp3');
  });

  describe('IdP agent (idp3) create identity (mode 2)', function () {
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
    const errorResultPromise = createEventPromise();

    let accessorId;

    before(function () {
      idp3EventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'create_identity_result' &&
          callbackData.reference_id === referenceId
        ) {
          createIdentityResultPromise.resolve(callbackData);
        } else if (callbackData.type === 'error') {
          errorResultPromise.resolve(callbackData);
        }
      });
    });

    it('Should create identity request (mode2) unsuccessfully', async function () {
      this.timeout(10000);
      const response = await identityApi.createIdentity('idp3', {
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

    it('Identity should be created unsuccessfully', async function () {
      this.timeout(15000);
      const errorResult = await errorResultPromise.promise;
      expect(errorResult.error.code).to.equal(25035);
    });
    after(async function () {
      idp3EventEmitter.removeAllListeners('callback');
    });
  });

  describe('IdP agent (idp3) create identity (mode 3)', function () {
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
    const errorResultPromise = createEventPromise();

    let accessorId;

    before(function () {
      idp3EventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'create_identity_result' &&
          callbackData.reference_id === referenceId
        ) {
          createIdentityResultPromise.resolve(callbackData);
        } else if (callbackData.type === 'error') {
          errorResultPromise.resolve(callbackData);
        }
      });
    });

    it('Should create identity request (mode 3) unsuccessfully', async function () {
      this.timeout(10000);
      const response = await identityApi.createIdentity('idp3', {
        reference_id: referenceId,
        callback_url: config.IDP3_CALLBACK_URL,
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

    it('Identity should be created unsuccessfully', async function () {
      this.timeout(15000);
      const errorResult = await errorResultPromise.promise;
      expect(errorResult.error.code).to.equal(25035);
    });
    after(async function () {
      idp3EventEmitter.removeAllListeners('callback');
    });
  });
  after(async function () {
    this.timeout(15000);
    const response = await ndidApi.updateNode('ndid1', {
      node_id: 'idp3',
      agent: false,
    });
    expect(response.status).to.equal(204);
    await wait(3000);
  });
});
