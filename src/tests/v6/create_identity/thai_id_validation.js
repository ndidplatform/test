import crypto from 'crypto';
import { expect } from 'chai';

import * as identityApi from '../../../api/v6/identity';
import * as commonApi from '../../../api/v6/common';
import { idp1EventEmitter } from '../../../callback_server';
import { createEventPromise, generateReferenceId } from '../../../utils';
import { randomThaiIdNumber } from '../../../utils/thai_id';
import * as config from '../../../config';

describe('Thai ID validation', function () {
  describe('Valid Thai ID', function () {
    const namespace = 'citizen_id';
    const identifier = randomThaiIdNumber();

    const keypair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    // const accessorPrivateKey = keypair.privateKey.export({
    //   type: 'pkcs8',
    //   format: 'pem',
    // });
    const accessorPublicKey = keypair.publicKey.export({
      type: 'spki',
      format: 'pem',
    });

    const referenceId = generateReferenceId();

    const createIdentityResultPromise = createEventPromise();

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
        ial: 2.3,
        lial: true,
        laal: true,
        mode: 2,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody).to.not.include.keys('request_id');
      expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.exist).to.equal(false);

      // accessorId = responseBody.accessor_id;
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

      const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
        namespace,
        identifier,
      });

      const idpNodes = await response.json();
      const idpNode = idpNodes.find((idpNode) => idpNode.node_id === 'idp1');
      expect(idpNode).to.not.be.undefined;
      expect(idpNode.mode_list).to.be.an('array').that.include(2);
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

    it('Should get relevant IdP nodes by sid successfully', async function () {
      this.timeout(15000);

      const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
        namespace,
        identifier,
      });
      const responseBody = await response.json();
      expect(responseBody).to.be.an('array').that.to.have.lengthOf(1);
      const idp = responseBody.find((node) => node.node_id === 'idp1');
      expect(idp.ial).to.equal(2.3);
      expect(idp.lial).to.equal(true);
      expect(idp.laal).to.equal(true);
    });

    after(function () {
      idp1EventEmitter.removeAllListeners('callback');
    });
  });

  describe('Invalid Thai ID', function () {
    const namespace = 'citizen_id';
    const identifier = '3712644096692'; // invalid

    const keypair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    // const accessorPrivateKey = keypair.privateKey.export({
    //   type: 'pkcs8',
    //   format: 'pem',
    // });
    const accessorPublicKey = keypair.publicKey.export({
      type: 'spki',
      format: 'pem',
    });

    const referenceId = generateReferenceId();

    // before(function () {});

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

    it('Should not be able to create identity request (mode2)', async function () {
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
        lial: true,
        laal: true,
        mode: 2,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(400);
      expect(responseBody.error.code).to.equal(20096);

      // accessorId = responseBody.accessor_id;
    });

    after(function () {
      idp1EventEmitter.removeAllListeners('callback');
    });
  });
});
