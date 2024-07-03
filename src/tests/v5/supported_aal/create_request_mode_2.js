import crypto from 'crypto';
import { expect } from 'chai';
import { mode2And3DataRequestFlowTest } from '../_fragments/data_request_mode_2_and_3_flow';
import * as identityApi from '../../../api/v5/identity';
import * as commonApi from '../../../api/v5/common';
import * as ndidApiV6 from '../../../api/v6/ndid';
import * as apiHelpers from '../../../api/helpers';
import {
  rpEventEmitter,
  idp1EventEmitter,
  as1EventEmitter,
} from '../../../callback_server';
import {
  generateReferenceId,
  createResponseSignature,
  createEventPromise,
} from '../../../utils';
import * as db from '../../../db';
import * as config from '../../../config';
import { randomThaiIdNumber } from '../../../utils/thai_id';
import { ndidAvailable } from '../..';
import { waitUntilBlockHeightMatch } from '../../../tendermint';

describe('1 IdP, 1 AS, mode 2', function () {
  const data = JSON.stringify({
    test: 'test',
    withEscapedChar: 'test|fff||ss\\|NN\\\\|',
    arr: [1, 2, 3],
  });

  describe('Create identity for test', function () {
    const supportedAALList = [1, 2.1, 2.2, 2.8, 3, 3.2, 4.1];

    let originalSupportedAALList;

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
        commonApi.getSupportedAALList('ndid1')
      );
      originalSupportedAALList = response.responseBody;

      await ndidApiV6.setSupportedAALList('ndid1', {
        supported_aal_list: supportedAALList,
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

      accessorId = responseBody.accessor_id;
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
      expect(responseBody.ial).to.equal(2.3);
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
      expect(idp.ial).to.equal(2.3);
      expect(idp.lial).to.equal(true);
      expect(idp.laal).to.equal(true);

      await waitUntilBlockHeightMatch('rp1', 'ndid1');
    });

    describe('1 IdP, 1 AS, mode 2', async function () {
      mode2And3DataRequestFlowTest({
        callRpApiAtNodeId: 'rp1',
        rpEventEmitter,
        getIdentityForRequest: () => {
          return db.idp1Identities.find((identity) => identity.mode === 2);
        },
        createRequestParams: {
          reference_id: generateReferenceId(),
          callback_url: config.RP_CALLBACK_URL,
          mode: 2,
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
          request_message:
            'Test request message (mode 2) ทดสอบภาษาไทย should\\|be|able\\\\|to|send\\\\\\|this',
          min_ial: 2.3,
          min_aal: 2.8,
          min_idp: 1,
          request_timeout: 86400,
          bypass_identity_check: false,
        },
        idpParams: [
          {
            callIdpApiAtNodeId: 'idp1',
            idpEventEmitter: idp1EventEmitter,
            getAccessorForResponse: ({
              namespace,
              identifier,
              referenceGroupCode,
            }) => {
              const identity = db.idp1Identities.find(
                (identity) =>
                  (identity.namespace === namespace &&
                    identity.identifier === identifier) ||
                  identity.referenceGroupCode === referenceGroupCode
              );
              return identity.accessors[0];
            },
            idpResponseParams: {
              reference_id: generateReferenceId(),
              callback_url: config.IDP1_CALLBACK_URL,
              ial: 2.3,
              aal: 2.8,
              status: 'accept',
              createResponseSignature: (privatekey, request_message) => {
                const signature = createResponseSignature(
                  privatekey,
                  request_message
                );
                return signature;
              },
            },
          },
        ],
        asParams: [
          {
            callAsApiAtNodeId: 'as1',
            asEventEmitter: as1EventEmitter,
            maxAal: 2.8,
            asResponseParams: [
              {
                reference_id: generateReferenceId(),
                callback_url: config.AS1_CALLBACK_URL,
                service_id: 'bank_statement',
                data,
              },
            ],
          },
        ],
      });
    });

    after(async function () {
      this.timeout(5000);

      idp1EventEmitter.removeAllListeners('callback');

      await ndidApiV6.setSupportedAALList('ndid1', {
        supported_ial_list: originalSupportedAALList,
      });
    });
  });
});
