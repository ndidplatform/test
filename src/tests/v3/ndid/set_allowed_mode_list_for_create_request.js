import { expect } from 'chai';
import forge from 'node-forge';
import uuidv4 from 'uuid/v4';

import * as ndidApi from '../../../api/v3/ndid';
import * as rpApi from '../../../api/v3/rp';
import * as identityApi from '../../../api/v3/identity';
import * as commonApi from '../../../api/v3/common';
import { ndidAvailable } from '../../';
import { generateReferenceId, wait, createEventPromise } from '../../../utils';
import * as config from '../../../config';

import { idp1EventEmitter } from '../../../callback_server';

describe('NDID set allowed mode list for create request test', function() {
  before(async function() {
    if (!ndidAvailable) {
      this.skip();
    }
  });
  describe('NDID set allowed mode list for create request (normal transaction)', function() {
    it('NDID should set allowed mode list for create request only mode 2,3 (normal transaction) successfully', async function() {
      this.timeout(10000);
      const response = await ndidApi.setAllowedModeList('ndid1', {
        purpose: '',
        allowed_mode_list: [2, 3],
      });
      expect(response.status).to.equal(204);
      await wait(2000);
    });

    it('RP should create request mode 1 (normal transaction) unsuccessfully', async function() {
      this.timeout(10000);

      let namespace = 'citizen_id';
      let identifier = '1234567890123';

      let createRequestParams = {
        reference_id: generateReferenceId(),
        callback_url: config.RP_CALLBACK_URL,
        mode: 1,
        namespace,
        identifier,
        idp_id_list: ['idp1'],
        data_request_list: [
          {
            service_id: 'bank_statement',
            as_id_list: ['as1'],
            min_as: 1,
            request_params: JSON.stringify({
              format: 'pdf',
            }),
          },
        ],
        request_message: 'Test request message (data request) (mode 1)',
        min_ial: 1.1,
        min_aal: 1,
        min_idp: 1,
        request_timeout: 86400,
      };

      const response = await rpApi.createRequest('rp1', createRequestParams);
      expect(response.status).to.equal(400);
      const responseBody = await response.json();
      expect(responseBody.error.code).to.equal(20066);
    });

    it('NDID should set allowed mode list for create request only mode 3 (normal transaction) successfully', async function() {
      this.timeout(10000);
      const response = await ndidApi.setAllowedModeList('ndid1', {
        purpose: '',
        allowed_mode_list: [3],
      });
      expect(response.status).to.equal(204);
      await wait(2000);
    });

    it('RP should create request mode 2 (normal transaction) unsuccessfully', async function() {
      this.timeout(10000);

      let namespace = 'citizen_id';
      let identifier = '1234567890123';

      let createRequestParams = {
        reference_id: generateReferenceId(),
        callback_url: config.RP_CALLBACK_URL,
        mode: 2,
        namespace,
        identifier,
        idp_id_list: [],
        data_request_list: [
          {
            service_id: 'bank_statement',
            as_id_list: ['as1'],
            min_as: 1,
            request_params: JSON.stringify({
              format: 'pdf',
            }),
          },
        ],
        request_message: 'Test request message (data request) (mode 2)',
        min_ial: 1.1,
        min_aal: 1,
        min_idp: 1,
        request_timeout: 86400,
        bypass_identity_check:false
      };

      const response = await rpApi.createRequest('rp1', createRequestParams);
      expect(response.status).to.equal(400);
      const responseBody = await response.json();
      expect(responseBody.error.code).to.equal(20066);
    });

    after(async function() {
      this.timeout(20000);
      const response = await ndidApi.setAllowedModeList('ndid1', {
        purpose: '',
        allowed_mode_list: [1, 2, 3],
      });
      expect(response.status).to.equal(204);
      await wait(2000);
    });
  });

  describe('NDID set allowed mode list for create request with purpose (special transaction)', async function() {
    const namespace = 'citizen_id';
    const identifier = uuidv4();
    const keypair = forge.pki.rsa.generateKeyPair(2048);
    //const accessorPrivateKey = forge.pki.privateKeyToPem(keypair.privateKey);
    const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);

    const referenceId = generateReferenceId();

    const createIdentityResultPromise = createEventPromise();

    let accessorId;

    before(function() {
      idp1EventEmitter.on('callback', function(callbackData) {
        if (
          callbackData.type === 'create_identity_result' &&
          callbackData.reference_id === referenceId
        ) {
          createIdentityResultPromise.resolve(callbackData);
        }
      });
    });

    it('NDID should set allowed mode list for create request purpose RegisterIdentity only mode 3 successfully', async function() {
      this.timeout(10000);
      const response = await ndidApi.setAllowedModeList('ndid1', {
        purpose: 'RegisterIdentity',
        allowed_mode_list: [3],
      });
      expect(response.status).to.equal(204);
      await wait(2000);
    });

    it('Should create identity request (mode2) unsuccessfully', async function() {
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
        ial: 2.3,
        mode: 2,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.exist).to.equal(false);

      accessorId = responseBody.accessor_id;
    });

    it('Identity should be created unsuccessfully', async function() {
      this.timeout(15000);
      const createIdentityResult = await createIdentityResultPromise.promise;
      expect(createIdentityResult).to.deep.include({
        reference_id: referenceId,
        accessor_id: accessorId,
        success: false,
      });
      expect(createIdentityResult.error.code).to.equal(25019);

      const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
        namespace,
        identifier,
      });

      const idpNodes = await response.json();
      const idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
      expect(idpNode).to.be.undefined;
    });
    after(async function() {
      this.timeout(10000);
      const response = await ndidApi.setAllowedModeList('ndid1', {
        purpose: 'RegisterIdentity',
        allowed_mode_list: [2, 3],
      });
      expect(response.status).to.equal(204);
      await wait(2000);
    });
  });
});
