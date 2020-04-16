import crypto from 'crypto';
import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import * as identityApi from '../../../api/v5/identity';
import * as commonApi from '../../../api/v5/common';
import * as rpApi from '../../../api/v5/rp';
import {
  idp3EventEmitter,
  idp1EventEmitter,
  rp2EventEmitter,
  as1EventEmitter,
  idp2EventEmitter,
} from '../../../callback_server';
import * as db from '../../../db';
import { createEventPromise, generateReferenceId, hash } from '../../../utils';
import * as config from '../../../config';

import * as ndidApi from '../../../api/v5/ndid';
import { wait, createSignature, createResponseSignature } from '../../../utils';
import { ndidAvailable, idp3Available, rp2Available } from '../..';
import { mode1DataRequestFlowTest } from '../_fragments/data_request_mode_1_flow';
import { mode2And3DataRequestFlowTest } from '../_fragments/data_request_mode_2_and_3_flow';

describe('RP whitelist IdP tests', function () {
  before(function () {
    if (!ndidAvailable || !rp2Available || !idp3Available) {
      this.skip();
    }

    if (db.idp1Identities[0] == null) {
      throw new Error('No created identity to use');
    }
  });

  describe('RP whitelist IdP test', function () {
    it('NDID should update node rp2 to whitelist idp3 successfully', async function () {
      this.timeout(20000);
      const responseUpdateNode = await ndidApi.updateNode('ndid1', {
        node_id: 'rp2',
        node_id_whitelist_active: true,
        node_id_whitelist: ['idp3'],
      });
      expect(responseUpdateNode.status).to.equal(204);
      await wait(3000);

      const responseGetNodeInfo = await commonApi.getNodeInfo('rp2');
      const responseBody = await responseGetNodeInfo.json();
      expect(responseBody.role).to.equal('RP');
      expect(responseBody.node_id_whitelist_active).to.be.true;
      expect(responseBody.node_id_whitelist[0]).to.equal('idp3');
    });

    it('rp2 should got only nodes that whitelist when get all idp', async function () {
      this.timeout(10000);
      let response = await commonApi.getIdP('rp2', {
        filter_for_node_id: 'rp2',
      });
      expect(response.status).to.equal(200);

      let responseBody = await response.json();
      expect(responseBody).to.be.an('array');
      expect(responseBody).to.have.length(1);
      expect(responseBody[0].node_id).to.equal('idp3');
    });

    it('rp2 should got only nodes that whitelist when get relevant IdP nodes by sid (sid is not relevant with idp3 that rp2 whitelist)', async function () {
      this.timeout(30000);
      const identity = db.idp1Identities.find(
        //SID from idp1
        (identity) => identity.mode === 3,
      );
      let namespace = identity.namespace;
      let identifier = identity.identifier;

      let response = await commonApi.getRelevantIdpNodesBySid('rp2', {
        namespace,
        identifier,
        filter_for_node_id: 'rp2',
      });

      const idpNodes = await response.json();
      expect(idpNodes).to.be.an('array').to.be.empty;
    });

    it('rp2 should got only nodes that whitelist when get relevant IdP nodes by sid (sid relevant with idp3 that rp2 whitelist and sid relevant with other idp)', async function () {
      this.timeout(10000);
      const identity = db.idp3Identities.find(
        (identity) => identity.mode === 2 && identity.remark === '2nd_idp',
      );
      let namespace = identity.namespace;
      let identifier = identity.identifier;

      let response = await commonApi.getRelevantIdpNodesBySid('rp2', {
        namespace,
        identifier,
        filter_for_node_id: 'rp2',
      });
      const idpNodes = await response.json();
      expect(idpNodes).to.be.an('array').to.have.length(1);
      expect(idpNodes[0].node_id).to.equal('idp3');
    });

    it('rp2 should got only nodes that whitelist when get relevant IdP nodes by sid (sid relevant with only idp3 that rp2 whitelist)', async function () {
      this.timeout(10000);

      const identity = db.idp3Identities.find(
        (identity) => identity.mode === 3,
      );
      let namespace = identity.namespace;
      let identifier = identity.identifier;

      let response = await commonApi.getRelevantIdpNodesBySid('rp2', {
        namespace,
        identifier,
        filter_for_node_id: 'rp2',
      });
      const idpNodes = await response.json();
      expect(idpNodes).to.be.an('array').to.have.length(1);
      expect(idpNodes[0].node_id).to.equal('idp3');
    });
  });

  describe('RP create request to IdP that is not whitelist (idp1) tests', function () {
    let namespace;
    let identifier;

    describe('RP create request (mode 1) to IdP that is not whitelist (idp1) test', function () {
      let createRequestParams;

      const rpReferenceId = generateReferenceId();

      before(function () {
        namespace = 'citizen_id';
        identifier = '1234567890123';

        createRequestParams = {
          reference_id: rpReferenceId,
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
          request_message: 'Test request message (data request)',
          min_ial: 1.1,
          min_aal: 1,
          min_idp: 1,
          request_timeout: 86400,
          bypass_identity_check: false,
        };
      });

      it('RP should create a request successfully', async function () {
        this.timeout(10000);
        const response = await rpApi.createRequest('rp2', createRequestParams);
        expect(response.status).to.equal(400);
        const responseBody = await response.json();
        expect(responseBody.error.code).to.equal(20079);
      });
    });

    describe('RP create request (mode 1) to IdP that is not whitelist (idp1) and IdP that is whitelist (idp3) test', function () {
      let createRequestParams;

      const rpReferenceId = generateReferenceId();

      before(function () {
        namespace = 'citizen_id';
        identifier = '1234567890123';

        createRequestParams = {
          reference_id: rpReferenceId,
          callback_url: config.RP_CALLBACK_URL,
          mode: 1,
          namespace,
          identifier,
          idp_id_list: ['idp1', 'idp3'], // error because of have idp that is not whitelist by rp2 in idp_id_list
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
          request_message: 'Test request message (data request)',
          min_ial: 1.1,
          min_aal: 1,
          min_idp: 1,
          request_timeout: 86400,
          bypass_identity_check: false,
        };
      });

      it('RP should create a request successfully', async function () {
        this.timeout(10000);
        const response = await rpApi.createRequest('rp2', createRequestParams);
        expect(response.status).to.equal(400);
        const responseBody = await response.json();
        expect(responseBody.error.code).to.equal(20079);
      });
    });

    describe('RP create request (not specific idp mode 3) to IdP that is not whitelist (idp1) test', function () {
      let createRequestParams;

      const rpReferenceId = generateReferenceId();

      before(function () {
        const identity = db.idp1Identities.find(
          (identity) => identity.mode === 3,
        );

        namespace = identity.namespace;
        identifier = identity.identifier;

        createRequestParams = {
          reference_id: rpReferenceId,
          callback_url: config.RP_CALLBACK_URL,
          mode: 3,
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
          request_message: 'Test request message (data request)',
          min_ial: 1.1,
          min_aal: 1,
          min_idp: 1,
          request_timeout: 86400,
          bypass_identity_check: false,
        };
      });

      it('RP should create a request successfully', async function () {
        this.timeout(10000);
        const response = await rpApi.createRequest('rp2', createRequestParams);
        expect(response.status).to.equal(400);
        const responseBody = await response.json();
        expect(responseBody.error.code).to.equal(20005);
      });
    });

    describe('RP create request (specific idp mode 3) to IdP that is not whitelist (idp1) test', function () {
      let createRequestParams;

      const rpReferenceId = generateReferenceId();

      before(function () {
        const identity = db.idp1Identities.find(
          (identity) => identity.mode === 3,
        );

        namespace = identity.namespace;
        identifier = identity.identifier;

        createRequestParams = {
          reference_id: rpReferenceId,
          callback_url: config.RP_CALLBACK_URL,
          mode: 3,
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
          request_message: 'Test request message (data request)',
          min_ial: 1.1,
          min_aal: 1,
          min_idp: 1,
          request_timeout: 86400,
          bypass_identity_check: false,
        };
      });

      it('RP should create a request successfully', async function () {
        this.timeout(10000);
        const response = await rpApi.createRequest('rp2', createRequestParams);
        expect(response.status).to.equal(400);
        const responseBody = await response.json();
        expect(responseBody.error.code).to.equal(20079);
      });
    });

    describe('RP create request (specific idp mode 2) to IdP that is not whitelist (idp1) and whitelist (idp3) test', function () {
      let createRequestParams;

      const rpReferenceId = generateReferenceId();

      //If specific IdP is not whitelist will fail
      before(function () {
        const identity = db.idp3Identities.find(
          (identity) => identity.mode === 2 && identity.remark === '2nd_idp',
        );
        let namespace = identity.namespace;
        let identifier = identity.identifier;

        createRequestParams = {
          reference_id: rpReferenceId,
          callback_url: config.RP_CALLBACK_URL,
          mode: 2,
          namespace,
          identifier,
          idp_id_list: ['idp1', 'idp3'],
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
          request_message: 'Test request message (data request)',
          min_ial: 1.1,
          min_aal: 1,
          min_idp: 1,
          request_timeout: 86400,
          bypass_identity_check: false,
        };
      });

      it('RP should create a request successfully', async function () {
        this.timeout(10000);
        const response = await rpApi.createRequest('rp2', createRequestParams);
        expect(response.status).to.equal(400);
        const responseBody = await response.json();
        expect(responseBody.error.code).to.equal(20079);
      });
    });

    describe('RP create request (not specific idp mode 2) to IdP that sid relevant with not whitelist (idp1) and whitelist (idp3) but not enough IdP test', function () {
      let createRequestParams;

      const rpReferenceId = generateReferenceId();

      before(function () {
        const identity = db.idp3Identities.find(
          (identity) => identity.mode === 2 && identity.remark === '2nd_idp',
        );
        let namespace = identity.namespace;
        let identifier = identity.identifier;

        createRequestParams = {
          reference_id: rpReferenceId,
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
          request_message: 'Test request message (data request)',
          min_ial: 1.1,
          min_aal: 1,
          min_idp: 2,
          request_timeout: 86400,
          bypass_identity_check: false,
        };
      });

      it('RP should create a request successfully', async function () {
        this.timeout(10000);
        const response = await rpApi.createRequest('rp2', createRequestParams);
        expect(response.status).to.equal(400);
        const responseBody = await response.json();
        expect(responseBody.error.code).to.equal(20004);
      });
    });

    describe('RP create request (specific idp and bypass_identity_check = true mode 2) to IdP that is not whitelist (idp1) test', function () {
      let createRequestParams;

      const rpReferenceId = generateReferenceId();

      before(function () {
        const identity = db.idp1Identities.find(
          (identity) => identity.mode === 2,
        );

        namespace = identity.namespace;
        identifier = identity.identifier;

        createRequestParams = {
          reference_id: rpReferenceId,
          callback_url: config.RP_CALLBACK_URL,
          mode: 2,
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
          request_message: 'Test request message (data request)',
          min_ial: 1.1,
          min_aal: 1,
          min_idp: 1,
          request_timeout: 86400,
          bypass_identity_check: true,
        };
      });

      it('RP should create a request successfully', async function () {
        this.timeout(10000);
        const response = await rpApi.createRequest('rp2', createRequestParams);
        expect(response.status).to.equal(400);
        const responseBody = await response.json();
        expect(responseBody.error.code).to.equal(20079);
      });
    });
  });

  describe('RP create request to IdP that is whitelist (idp3) tests', function () {
    describe('RP create request (not specific idp mode 2) to IdP that sid relevant with not whitelist (idp1) and whitelist (idp3) test', function () {
      let createRequestParams;

      const rpReferenceId = generateReferenceId();
      const incomingRequestPromise = createEventPromise();
      let requestId;

      //rp2 will create request to only idp3
      before(function () {
        const identity = db.idp3Identities.find(
          (identity) => identity.mode === 2 && identity.remark === '2nd_idp',
        );
        let namespace = identity.namespace;
        let identifier = identity.identifier;

        createRequestParams = {
          reference_id: rpReferenceId,
          callback_url: config.RP_CALLBACK_URL,
          mode: 2,
          namespace,
          identifier,
          idp_id_list: [], //not input idp_id_list, idp_id_list will become whitelist instead
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
          request_message: 'Test request message (data request)',
          min_ial: 1.1,
          min_aal: 1,
          min_idp: 1,
          request_timeout: 86400,
          bypass_identity_check: false,
        };

        idp3EventEmitter.on('callback', function (callbackData) {
          if (
            callbackData.type === 'incoming_request' &&
            callbackData.request_id === requestId
          ) {
            incomingRequestPromise.resolve(callbackData);
          }
        });
      });

      it('RP should create a request successfully', async function () {
        this.timeout(10000);
        const response = await rpApi.createRequest('rp2', createRequestParams);
        expect(response.status).to.equal(202);
        const responseBody = await response.json();
        expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
        expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;
        requestId = responseBody.request_id;
      });

      it('IdP (idp3) should receive incoming request callback', async function () {
        this.timeout(15000);
        const incomingRequest = await incomingRequestPromise.promise;

        const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
          (dataRequest) => {
            const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
            return {
              ...dataRequestWithoutParams,
            };
          },
        );
        expect(incomingRequest).to.deep.include({
          node_id: 'idp3',
          type: 'incoming_request',
          mode: createRequestParams.mode,
          request_id: requestId,
          request_message: createRequestParams.request_message,
          request_message_hash: hash(
            createRequestParams.request_message +
              incomingRequest.request_message_salt,
          ),
          requester_node_id: 'rp2',
          min_ial: createRequestParams.min_ial,
          min_aal: createRequestParams.min_aal,
          data_request_list: dataRequestListWithoutParams,
          request_timeout: createRequestParams.request_timeout,
        });
        expect(incomingRequest.reference_group_code).to.be.a('string').that.is
          .not.empty;
        expect(incomingRequest.request_message_salt).to.be.a('string').that.is
          .not.empty;
        expect(incomingRequest.creation_time).to.be.a('number');
        expect(incomingRequest.creation_block_height).to.be.a('string');
        const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
          ':',
        );
        expect(splittedCreationBlockHeight).to.have.lengthOf(2);
        expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
        expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
      });
    });

    describe('RP create request (mode 1) to IdP that is whitelist (idp3) test', function () {
      const data = JSON.stringify({
        test: 'test',
        withEscapedChar: 'test|fff||ss\\|NN\\\\|',
        arr: [1, 2, 3],
      });

      mode1DataRequestFlowTest({
        callRpApiAtNodeId: 'rp2',
        filterForNodeId: 'rp2', //for get all idp nodes only whitelist that relevant to sid
        rpEventEmitter: rp2EventEmitter,
        createRequestParams: {
          reference_id: generateReferenceId(),
          callback_url: config.RP2_CALLBACK_URL,
          mode: 1,
          namespace: 'citizen_id',
          identifier: '1234567890123',
          idp_id_list: ['idp3'],
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
            'Test request message (mode 1) ทดสอบภาษาไทย should\\|be|able\\\\|to|send\\\\\\|this',
          min_ial: 1.1,
          min_aal: 1,
          min_idp: 1,
          request_timeout: 86400,
        },
        idpParams: [
          {
            callIdpApiAtNodeId: 'idp3',
            idpEventEmitter: idp3EventEmitter,
            idpResponseParams: {
              reference_id: generateReferenceId(),
              callback_url: config.IDP3_CALLBACK_URL,
              ial: 2.3,
              aal: 3,
              status: 'accept',
              createResponseSignature: (privatekey, request_message) => {
                const signature = createSignature(privatekey, request_message);
                return signature;
              },
            },
          },
        ],
        asParams: [
          {
            callAsApiAtNodeId: 'as1',
            asEventEmitter: as1EventEmitter,
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

    describe('RP create request (mode 2) to IdP that is whitelist (idp3) test', function () {
      const data = JSON.stringify({
        test: 'test',
        withEscapedChar: 'test|fff||ss\\|NN\\\\|',
        arr: [1, 2, 3],
      });

      mode2And3DataRequestFlowTest({
        callRpApiAtNodeId: 'rp2',
        filterForNodeId: 'rp2', //for get all idp nodes only whitelist that relevant to sid
        rpEventEmitter: rp2EventEmitter,
        getIdentityForRequest: () => {
          return db.idp3Identities.find((identity) => identity.mode === 2);
        },
        createRequestParams: {
          reference_id: generateReferenceId(),
          callback_url: config.RP2_CALLBACK_URL,
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
          min_ial: 1.1,
          min_aal: 1,
          min_idp: 1,
          request_timeout: 86400,
          bypass_identity_check: false,
        },
        idpParams: [
          {
            callIdpApiAtNodeId: 'idp3',
            idpEventEmitter: idp3EventEmitter,
            getAccessorForResponse: ({
              namespace,
              identifier,
              referenceGroupCode,
            }) => {
              const identity = db.idp3Identities.find(
                (identity) =>
                  (identity.namespace === namespace &&
                    identity.identifier === identifier) ||
                  identity.referenceGroupCode === referenceGroupCode,
              );
              return identity.accessors[0];
            },
            idpResponseParams: {
              reference_id: generateReferenceId(),
              callback_url: config.IDP3_CALLBACK_URL,
              ial: 2.3,
              aal: 3,
              status: 'accept',
              createResponseSignature: (privatekey, request_message) => {
                const signature = createResponseSignature(
                  privatekey,
                  request_message,
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

    describe('RP create request (mode 3) to IdP that is whitelist (idp3) test', function () {
      const data = JSON.stringify({
        test: 'test',
        withEscapedChar: 'test|fff||ss\\|NN\\\\|',
        arr: [1, 2, 3],
      });

      mode2And3DataRequestFlowTest({
        callRpApiAtNodeId: 'rp2',
        filterForNodeId: 'rp2', //for get all idp nodes only whitelist that relevant to sid
        rpEventEmitter: rp2EventEmitter,
        getIdentityForRequest: () => {
          return db.idp3Identities.find((identity) => identity.mode === 3);
        },
        createRequestParams: {
          reference_id: generateReferenceId(),
          callback_url: config.RP2_CALLBACK_URL,
          mode: 3,
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
            'Test request message (mode 3) ทดสอบภาษาไทย should\\|be|able\\\\|to|send\\\\\\|this',
          min_ial: 1.1,
          min_aal: 1,
          min_idp: 1,
          request_timeout: 86400,
          bypass_identity_check: false,
        },
        idpParams: [
          {
            callIdpApiAtNodeId: 'idp3',
            idpEventEmitter: idp3EventEmitter,
            getAccessorForResponse: ({
              namespace,
              identifier,
              referenceGroupCode,
            }) => {
              const identity = db.idp3Identities.find(
                (identity) =>
                  (identity.namespace === namespace &&
                    identity.identifier === identifier) ||
                  identity.referenceGroupCode === referenceGroupCode,
              );
              return identity.accessors[0];
            },
            idpResponseParams: {
              reference_id: generateReferenceId(),
              callback_url: config.IDP3_CALLBACK_URL,
              ial: 2.3,
              aal: 3,
              status: 'accept',
              createResponseSignature: (privatekey, request_message) => {
                const signature = createResponseSignature(
                  privatekey,
                  request_message,
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
  });

  describe('RP update node_id_whitelist_active = false tests', function () {
    it('NDID should update node rp2 node_id_whitelist_active = false successfully', async function () {
      this.timeout(20000);
      const responseUpdateNode = await ndidApi.updateNode('ndid1', {
        node_id: 'rp2',
        node_id_whitelist_active: false,
        node_id_whitelist: ['idp3'],
      });
      expect(responseUpdateNode.status).to.equal(204);
      await wait(3000);

      const responseGetNodeInfo = await commonApi.getNodeInfo('rp2');
      const responseBody = await responseGetNodeInfo.json();
      expect(responseBody.role).to.equal('RP');
      expect(responseBody.node_id_whitelist_active).to.be.false;
      expect(responseBody).to.not.have.key('node_id_whitelist');
    });

    it('rp2 should not got only nodes that whitelist when get all idp', async function () {
      this.timeout(10000);
      let response = await commonApi.getIdP('rp2', {
        filter_for_node_id: 'rp2',
      });
      expect(response.status).to.equal(200);

      let responseBody = await response.json();
      expect(responseBody).to.be.an('array');
      expect(responseBody).to.have.length.above(1);
    });

    it('rp2 should get relevant IdP nodes by sid (sid is not relevant with idp3 that rp2 whitelist) successfully', async function () {
      this.timeout(30000);
      const identity = db.idp1Identities.find(
        // SID from idp1
        (identity) => identity.mode === 3,
      );
      let namespace = identity.namespace;
      let identifier = identity.identifier;

      let response = await commonApi.getRelevantIdpNodesBySid('rp2', {
        namespace,
        identifier,
        filter_for_node_id: 'rp2',
      });

      const idpNodes = await response.json();
      expect(idpNodes).to.be.an('array').to.not.be.empty;
    });

    it('rp2 should got IdP nodes when get relevant IdP nodes by sid', async function () {
      this.timeout(10000);
      const identity = db.idp3Identities.find(
        //SID from idp1
        (identity) => identity.mode === 3,
      );
      let namespace = identity.namespace;
      let identifier = identity.identifier;

      let response = await commonApi.getRelevantIdpNodesBySid('rp2', {
        namespace,
        identifier,
        filter_for_node_id: 'rp2',
      });
      const idpNodes = await response.json();
      expect(idpNodes).to.be.an('array').to.have.length(1);
      expect(idpNodes[0].node_id).to.equal('idp3');
    });
  });

  describe('RP create request to IdP after update node_id_whitelist_active = false tests', function () {
    describe('1 IdP, 1 AS, mode 1', function () {
      const data = JSON.stringify({
        test: 'test',
        withEscapedChar: 'test|fff||ss\\|NN\\\\|',
        arr: [1, 2, 3],
      });

      mode1DataRequestFlowTest({
        callRpApiAtNodeId: 'rp2',
        rpEventEmitter: rp2EventEmitter,
        createRequestParams: {
          reference_id: generateReferenceId(),
          callback_url: config.RP2_CALLBACK_URL,
          mode: 1,
          namespace: 'citizen_id',
          identifier: '1234567890123',
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
          request_message:
            'Test request message (mode 1) ทดสอบภาษาไทย should\\|be|able\\\\|to|send\\\\\\|this',
          min_ial: 1.1,
          min_aal: 1,
          min_idp: 1,
          request_timeout: 86400,
        },
        idpParams: [
          {
            callIdpApiAtNodeId: 'idp1',
            idpEventEmitter: idp1EventEmitter,
            idpResponseParams: {
              reference_id: generateReferenceId(),
              callback_url: config.IDP1_CALLBACK_URL,
              ial: 2.3,
              aal: 3,
              status: 'accept',
              createResponseSignature: (privatekey, request_message) => {
                const signature = createSignature(privatekey, request_message);
                return signature;
              },
            },
          },
        ],
        asParams: [
          {
            callAsApiAtNodeId: 'as1',
            asEventEmitter: as1EventEmitter,
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

    describe('1 IdP, 1 AS, mode 2', function () {
      const data = JSON.stringify({
        test: 'test',
        withEscapedChar: 'test|fff||ss\\|NN\\\\|',
        arr: [1, 2, 3],
      });

      mode2And3DataRequestFlowTest({
        callRpApiAtNodeId: 'rp2',
        rpEventEmitter: rp2EventEmitter,
        getIdentityForRequest: () => {
          return db.idp1Identities.find((identity) => identity.mode === 2);
        },
        createRequestParams: {
          reference_id: generateReferenceId(),
          callback_url: config.RP2_CALLBACK_URL,
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
          min_ial: 1.1,
          min_aal: 1,
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
                  identity.referenceGroupCode === referenceGroupCode,
              );
              return identity.accessors[0];
            },
            idpResponseParams: {
              reference_id: generateReferenceId(),
              callback_url: config.IDP1_CALLBACK_URL,
              ial: 2.3,
              aal: 3,
              status: 'accept',
              createResponseSignature: (privatekey, request_message) => {
                const signature = createResponseSignature(
                  privatekey,
                  request_message,
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

    describe('1 IdP, 1 AS, mode 3', function () {
      const data = JSON.stringify({
        test: 'test',
        withEscapedChar: 'test|fff||ss\\|NN\\\\|',
        arr: [1, 2, 3],
      });

      mode2And3DataRequestFlowTest({
        callRpApiAtNodeId: 'rp2',
        rpEventEmitter: rp2EventEmitter,
        getIdentityForRequest: () => {
          return db.idp1Identities.find((identity) => identity.mode === 3);
        },
        createRequestParams: {
          reference_id: generateReferenceId(),
          callback_url: config.RP2_CALLBACK_URL,
          mode: 3,
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
            'Test request message (mode 3) ทดสอบภาษาไทย should\\|be|able\\\\|to|send\\\\\\|this',
          min_ial: 1.1,
          min_aal: 1,
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
                  identity.referenceGroupCode === referenceGroupCode,
              );
              return identity.accessors[0];
            },
            idpResponseParams: {
              reference_id: generateReferenceId(),
              callback_url: config.IDP1_CALLBACK_URL,
              ial: 2.3,
              aal: 3,
              status: 'accept',
              createResponseSignature: (privatekey, request_message) => {
                const signature = createResponseSignature(
                  privatekey,
                  request_message,
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
  });

  after(async function () {
    this.timeout(10000);
    await ndidApi.updateNode('ndid1', {
      node_id: 'rp2',
      node_id_whitelist_active: false,
      node_id_whitelist: ['idp3'],
    });
  });
});
