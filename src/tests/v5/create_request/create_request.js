import crypto from 'crypto';
import { expect } from 'chai';
import uuidv4 from 'uuid/v4';
import * as rpApi from '../../../api/v5/rp';
import * as idpApi from '../../../api/v5/idp';
import * as commonApi from '../../../api/v5/common';
import * as identityApi from '../../../api/v5/identity';
import {
  generateReferenceId,
  wait,
  createEventPromise,
  hash,
} from '../../../utils';
import {
  idp1EventEmitter,
  idp2EventEmitter,
  rpEventEmitter,
} from '../../../callback_server';
import * as config from '../../../config';
import { idp2Available } from '../..';
import * as db from '../../../db';

describe('Create request tests', function() {
  //idp1 = mode 3, idp2 = mode 2
  let namespace = 'citizen_id';
  let identifier = uuidv4();

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

  const idpReferenceId = generateReferenceId();
  const idp2ReferenceId = generateReferenceId();

  const createIdentityResultPromise = createEventPromise();
  const idp2CreateIdentityResultPromise = createEventPromise();

  let accessorIdMode3;
  let accessorIdMode2;

  before(function() {
    if (!idp2Available) {
      this.test.parent.pending = true;
      this.skip();
    }

    idp1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'create_identity_result' &&
        callbackData.reference_id === idpReferenceId
      ) {
        createIdentityResultPromise.resolve(callbackData);
      }
    });

    idp2EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'create_identity_result' &&
        callbackData.reference_id === idp2ReferenceId
      ) {
        idp2CreateIdentityResultPromise.resolve(callbackData);
      }
    });
  });

  it('Should create identity request (mode 3) successfully', async function() {
    this.timeout(30000);
    const response = await identityApi.createIdentity('idp1', {
      reference_id: idpReferenceId,
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
      mode: 3,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.exist).to.equal(false);

    accessorIdMode3 = responseBody.accessor_id;

    const createIdentityResult = await createIdentityResultPromise.promise;
    expect(createIdentityResult).to.deep.include({
      reference_id: idpReferenceId,
      success: true,
    });
    expect(createIdentityResult.reference_group_code).to.be.a('string').that.is
      .not.empty;

    const responseGetRelevantIdpNodesBySid = await commonApi.getRelevantIdpNodesBySid(
      'idp1',
      {
        namespace,
        identifier,
      },
    );

    const idpNodes = await responseGetRelevantIdpNodesBySid.json();
    const idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
    expect(idpNode).to.not.be.undefined;
    expect(idpNode.mode_list)
      .to.be.an('array')
      .that.include(2, 3);

    await wait(1000);
  });

  it('Should create identity request (mode 2) successfully', async function() {
    this.timeout(30000);
    const response = await identityApi.createIdentity('idp2', {
      reference_id: idp2ReferenceId,
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
      mode: 2,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.exist).to.equal(true);

    accessorIdMode2 = responseBody.accessor_id;

    const createIdentityResult = await idp2CreateIdentityResultPromise.promise;
    expect(createIdentityResult).to.deep.include({
      reference_id: idp2ReferenceId,
      success: true,
    });
    expect(createIdentityResult.reference_group_code).to.be.a('string').that.is
      .not.empty;

    const responseGetRelevantIdpNodesBySid = await commonApi.getRelevantIdpNodesBySid(
      'idp2',
      {
        namespace,
        identifier,
      },
    );

    const idpNodes = await responseGetRelevantIdpNodesBySid.json();
    const idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
    expect(idpNode).to.not.be.undefined;
    expect(idpNode.mode_list)
      .to.be.an('array')
      .that.include(2);

    await wait(1000);
  });
  describe('RP create request mode 2 with sid onboard with mode 2,3 (both idp mode 2,3 should receive incoming request) test', function() {
    const createRequestResultPromise = createEventPromise();
    const requestStatusPendingPromise = createEventPromise(); // RP
    const incomingRequestPromise = createEventPromise(); // IDP
    const idp2IncomingRequestPromise = createEventPromise(); // IDP

    const rpReferenceId = generateReferenceId();

    let requestId;
    let lastStatusUpdateBlockHeight;
    let createRequestParams;

    before(function() {
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
            as_id_list: [],
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
        bypass_identity_check: false,
      };

      rpEventEmitter.on('callback', function(callbackData) {
        if (
          callbackData.type === 'create_request_result' &&
          callbackData.reference_id === rpReferenceId
        ) {
          createRequestResultPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'request_status' &&
          callbackData.request_id === requestId
        ) {
          if (callbackData.status === 'pending') {
            requestStatusPendingPromise.resolve(callbackData);
          }
        }
      });

      idp1EventEmitter.on('callback', function(callbackData) {
        if (
          callbackData.type === 'incoming_request' &&
          callbackData.request_id === requestId
        ) {
          incomingRequestPromise.resolve(callbackData);
        }
      });

      idp2EventEmitter.on('callback', function(callbackData) {
        if (
          callbackData.type === 'incoming_request' &&
          callbackData.request_id === requestId
        ) {
          idp2IncomingRequestPromise.resolve(callbackData);
        }
      });
    });

    it('RP should create a request successfully', async function() {
      this.timeout(10000);

      const response = await rpApi.createRequest('rp1', createRequestParams);
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

      requestId = responseBody.request_id;

      const createRequestResult = await createRequestResultPromise.promise;
      expect(createRequestResult.success).to.equal(true);
      expect(createRequestResult.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = createRequestResult.creation_block_height.split(
        ':',
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
      lastStatusUpdateBlockHeight = parseInt(splittedCreationBlockHeight[1]);
    });

    it('RP should receive pending request status', async function() {
      this.timeout(10000);
      const requestStatus = await requestStatusPendingPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: requestId,
        status: 'pending',
        mode: createRequestParams.mode,
        min_idp: createRequestParams.min_idp,
        answered_idp_count: 0,
        closed: false,
        timed_out: false,
        service_list: [
          {
            service_id: createRequestParams.data_request_list[0].service_id,
            min_as: createRequestParams.data_request_list[0].min_as,
            signed_data_count: 0,
            received_data_count: 0,
          },
        ],
        response_valid_list: [],
      });
      expect(requestStatus).to.have.property('block_height');
      expect(requestStatus.block_height).is.a('string');
      const splittedBlockHeight = requestStatus.block_height.split(':');
      expect(splittedBlockHeight).to.have.lengthOf(2);
      expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
      expect(parseInt(splittedBlockHeight[1])).to.equal(
        lastStatusUpdateBlockHeight,
      );
      lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
    });

    it('IdP (mode 2) should receive incoming request callback', async function() {
      this.timeout(15000);
      const incomingRequest = await incomingRequestPromise.promise;
      const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
        dataRequest => {
          const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
          return {
            ...dataRequestWithoutParams,
            as_id_list: incomingRequest.data_request_list[0].as_id_list,
          };
        },
      );
      expect(incomingRequest).to.deep.include({
        node_id: 'idp1',
        type: 'incoming_request',
        mode: createRequestParams.mode,
        request_id: requestId,
        request_message: createRequestParams.request_message,
        request_message_hash: hash(
          createRequestParams.request_message +
            incomingRequest.request_message_salt,
        ),
        requester_node_id: 'rp1',
        min_ial: createRequestParams.min_ial,
        min_aal: createRequestParams.min_aal,
        data_request_list: dataRequestListWithoutParams,
        request_timeout: createRequestParams.request_timeout,
      });
      expect(incomingRequest.reference_group_code).to.be.a('string').that.is.not
        .empty;
      expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
        .empty;
      expect(incomingRequest.creation_time).to.be.a('number');
      expect(incomingRequest.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
        ':',
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);

      // requestMessageSalt = incomingRequest.request_message_salt;
      // requestMessageHash = incomingRequest.request_message_hash;
    });

    it('IdP (mode 3) should receive incoming request callback', async function() {
      this.timeout(15000);
      if (!idp2Available) this.skip();
      const incomingRequest = await idp2IncomingRequestPromise.promise;
      const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
        dataRequest => {
          const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
          return {
            ...dataRequestWithoutParams,
            as_id_list: incomingRequest.data_request_list[0].as_id_list,
          };
        },
      );
      expect(incomingRequest).to.deep.include({
        node_id: 'idp2',
        type: 'incoming_request',
        mode: createRequestParams.mode,
        request_id: requestId,
        request_message: createRequestParams.request_message,
        request_message_hash: hash(
          createRequestParams.request_message +
            incomingRequest.request_message_salt,
        ),
        requester_node_id: 'rp1',
        min_ial: createRequestParams.min_ial,
        min_aal: createRequestParams.min_aal,
        data_request_list: dataRequestListWithoutParams,
        request_timeout: createRequestParams.request_timeout,
      });
      expect(incomingRequest.reference_group_code).to.be.a('string').that.is.not
        .empty;
      expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
        .empty;
      expect(incomingRequest.creation_time).to.be.a('number');
      expect(incomingRequest.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
        ':',
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);

      // requestMessageSalt = incomingRequest.request_message_salt;
      // requestMessageHash = incomingRequest.request_message_hash;
    });
    after(function() {
      idp1EventEmitter.removeAllListeners('callback');
      idp2EventEmitter.removeAllListeners('callback');
      rpEventEmitter.removeAllListeners('callback');
    });
  });
  describe('RP create request mode 3 with sid onboard with mode 2,3 (only idp mode 3 should receive incoming request) test', function() {
    const createRequestResultPromise = createEventPromise();
    const requestStatusPendingPromise = createEventPromise(); // RP
    const incomingRequestPromise = createEventPromise(); // IDP

    const rpReferenceId = generateReferenceId();

    let requestId;
    let lastStatusUpdateBlockHeight;
    let createRequestParams;
    let identityForResponse;
    let responseAccessorId;

    before(function() {
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
            as_id_list: [],
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
        bypass_identity_check: false,
      };

      rpEventEmitter.on('callback', function(callbackData) {
        if (
          callbackData.type === 'create_request_result' &&
          callbackData.reference_id === rpReferenceId
        ) {
          createRequestResultPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'request_status' &&
          callbackData.request_id === requestId
        ) {
          if (callbackData.status === 'pending') {
            requestStatusPendingPromise.resolve(callbackData);
          }
        }
      });

      idp1EventEmitter.on('callback', function(callbackData) {
        if (
          callbackData.type === 'incoming_request' &&
          callbackData.request_id === requestId
        ) {
          incomingRequestPromise.resolve(callbackData);
        }
      });
    });

    it('RP should create a request successfully', async function() {
      this.timeout(10000);

      const response = await rpApi.createRequest('rp1', createRequestParams);
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

      requestId = responseBody.request_id;

      const createRequestResult = await createRequestResultPromise.promise;
      expect(createRequestResult.success).to.equal(true);
      expect(createRequestResult.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = createRequestResult.creation_block_height.split(
        ':',
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
      lastStatusUpdateBlockHeight = parseInt(splittedCreationBlockHeight[1]);
    });

    it('RP should receive pending request status', async function() {
      this.timeout(10000);
      const requestStatus = await requestStatusPendingPromise.promise;
      expect(requestStatus).to.deep.include({
        request_id: requestId,
        status: 'pending',
        mode: createRequestParams.mode,
        min_idp: createRequestParams.min_idp,
        answered_idp_count: 0,
        closed: false,
        timed_out: false,
        service_list: [
          {
            service_id: createRequestParams.data_request_list[0].service_id,
            min_as: createRequestParams.data_request_list[0].min_as,
            signed_data_count: 0,
            received_data_count: 0,
          },
        ],
        response_valid_list: [],
      });
      expect(requestStatus).to.have.property('block_height');
      expect(requestStatus.block_height).is.a('string');
      const splittedBlockHeight = requestStatus.block_height.split(':');
      expect(splittedBlockHeight).to.have.lengthOf(2);
      expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
      expect(parseInt(splittedBlockHeight[1])).to.equal(
        lastStatusUpdateBlockHeight,
      );
      lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
    });

    it('IdP (mode 3) should receive incoming request callback', async function() {
      this.timeout(15000);
      const incomingRequest = await incomingRequestPromise.promise;
      const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
        dataRequest => {
          const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
          return {
            ...dataRequestWithoutParams,
            as_id_list: incomingRequest.data_request_list[0].as_id_list,
          };
        },
      );
      expect(incomingRequest).to.deep.include({
        node_id: 'idp1',
        type: 'incoming_request',
        mode: createRequestParams.mode,
        request_id: requestId,
        request_message: createRequestParams.request_message,
        request_message_hash: hash(
          createRequestParams.request_message +
            incomingRequest.request_message_salt,
        ),
        requester_node_id: 'rp1',
        min_ial: createRequestParams.min_ial,
        min_aal: createRequestParams.min_aal,
        data_request_list: dataRequestListWithoutParams,
        request_timeout: createRequestParams.request_timeout,
      });
      expect(incomingRequest.reference_group_code).to.be.a('string').that.is.not
        .empty;
      expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
        .empty;
      expect(incomingRequest.creation_time).to.be.a('number');
      expect(incomingRequest.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
        ':',
      );
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);

      // requestMessageSalt = incomingRequest.request_message_salt;
      // requestMessageHash = incomingRequest.request_message_hash;
    });

    it('IdP (mode 2) should get request_message_padded_hash successfully', async function() {
      this.timeout(15000);
      // identityForResponse = db.idp2Identities.find(
      //   identity =>
      //     identity.namespace === namespace &&
      //     identity.identifier === identifier,
      // );

      // const identity = identityForResponse.accessors.find(
      //   accessor => accessor.accessorId === accessorIdMode2,
      // );

      responseAccessorId = accessorIdMode2;

      const response = await idpApi.getRequestMessagePaddedHash('idp2', {
        request_id: requestId,
        accessor_id: responseAccessorId,
      });
      expect(response.status).to.equal(400);
      const responseBody = await response.json();
      expect(responseBody.error.code).to.equal(20038);
    });

    // it('IdP (mode 2) should create response (accept) unsuccessfully', async function() {
    //   this.timeout(10000);

    //   const response = await idpApi.createResponse('idp2', {
    //     reference_id: idpReferenceId,
    //     callback_url: config.IDP2_CALLBACK_URL,
    //     request_id: requestId,
    //     ial: 2.3,
    //     aal: 3,
    //     status: 'accept',
    //     accessor_id: accessorIdMode2,
    //   });
    //   expect(response.status).to.equal(400);
    //   const responseBody = await response.json();
    //   expect(responseBody.error.code).to.equal(20038);
    // });

    after(function() {
      idp1EventEmitter.removeAllListeners('callback');
      rpEventEmitter.removeAllListeners('callback');
    });
  });
});

describe('Create request with invalid mode tests', function() {
  describe('RP create request mode 3 with sid onboard with mode 2 tests', function() {
    let namespace = 'citizen_id';
    let identifier = uuidv4();

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

    const rpReferenceId = generateReferenceId();
    const idpReferenceId = generateReferenceId();

    const createIdentityResultPromise = createEventPromise();

    before(function() {
      idp1EventEmitter.on('callback', function(callbackData) {
        if (
          callbackData.type === 'create_identity_result' &&
          callbackData.reference_id === idpReferenceId
        ) {
          createIdentityResultPromise.resolve(callbackData);
        }
      });
    });

    it('Should create identity request (mode 2) successfully', async function() {
      this.timeout(30000);
      const response = await identityApi.createIdentity('idp1', {
        reference_id: idpReferenceId,
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
      expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.exist).to.equal(false);

      //accessorId = responseBody.accessor_id;

      const createIdentityResult = await createIdentityResultPromise.promise;
      expect(createIdentityResult).to.deep.include({
        reference_id: idpReferenceId,
        success: true,
      });
      expect(createIdentityResult.reference_group_code).to.be.a('string').that
        .is.not.empty;

      const responseGetRelevantIdpNodesBySid = await commonApi.getRelevantIdpNodesBySid(
        'idp1',
        {
          namespace,
          identifier,
        },
      );

      const idpNodes = await responseGetRelevantIdpNodesBySid.json();
      const idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
      expect(idpNode).to.not.be.undefined;
      expect(idpNode.mode_list)
        .to.be.an('array')
        .that.include(2);

      await wait(1000);
    });

    it('RP create request mode 3 with sid onboard with mode 2 (without providing idp_id_list) unsuccessfully', async function() {
      this.timeout(10000);

      let createRequestParams = {
        reference_id: rpReferenceId,
        callback_url: config.RP_CALLBACK_URL,
        mode: 3,
        namespace,
        identifier,
        idp_id_list: [],
        data_request_list: [
          {
            service_id: 'bank_statement',
            as_id_list: [],
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
        bypass_identity_check: false,
      };

      const response = await rpApi.createRequest('rp1', createRequestParams);
      expect(response.status).to.equal(400);
      const responseBody = await response.json();
      expect(responseBody.error.code).to.equal(20005);
    });

    it('RP create request mode 3 with sid onboard with mode 2 (providing idp_id_list) unsuccessfully', async function() {
      this.timeout(10000);

      let createRequestParams = {
        reference_id: rpReferenceId,
        callback_url: config.RP_CALLBACK_URL,
        mode: 3,
        namespace,
        identifier,
        idp_id_list: ['idp1'],
        data_request_list: [
          {
            service_id: 'bank_statement',
            as_id_list: [],
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
        bypass_identity_check: false,
      };

      const response = await rpApi.createRequest('rp1', createRequestParams);
      expect(response.status).to.equal(400);
      const responseBody = await response.json();
      expect(responseBody.error.code).to.equal(20005);
    });
    after(function() {
      idp1EventEmitter.removeAllListeners('callback');
    });
  });

  describe('RP create request mode 3 with sid onboard with mode 2,3 (providing idp_id_list with idp mode 2,3) tests', function() {
    let namespace = 'citizen_id';
    let identifier = uuidv4();

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

    const rpReferenceId = generateReferenceId();
    const idpReferenceId = generateReferenceId();
    const idp2ReferenceId = generateReferenceId();

    const createIdentityResultPromise = createEventPromise();
    const idp2CreateIdentityResultPromise = createEventPromise();

    before(function() {
      if (!idp2Available) {
        this.test.parent.pending = true;
        this.skip();
      }
      idp1EventEmitter.on('callback', function(callbackData) {
        if (
          callbackData.type === 'create_identity_result' &&
          callbackData.reference_id === idpReferenceId
        ) {
          createIdentityResultPromise.resolve(callbackData);
        }
      });

      idp2EventEmitter.on('callback', function(callbackData) {
        if (
          callbackData.type === 'create_identity_result' &&
          callbackData.reference_id === idp2ReferenceId
        ) {
          idp2CreateIdentityResultPromise.resolve(callbackData);
        }
      });
    });

    it('Should create identity request (mode 3) successfully', async function() {
      this.timeout(30000);
      const response = await identityApi.createIdentity('idp1', {
        reference_id: idpReferenceId,
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
        mode: 3,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.exist).to.equal(false);

      //accessorId = responseBody.accessor_id;

      const createIdentityResult = await createIdentityResultPromise.promise;
      expect(createIdentityResult).to.deep.include({
        reference_id: idpReferenceId,
        success: true,
      });
      expect(createIdentityResult.reference_group_code).to.be.a('string').that
        .is.not.empty;

      const responseGetRelevantIdpNodesBySid = await commonApi.getRelevantIdpNodesBySid(
        'idp1',
        {
          namespace,
          identifier,
        },
      );

      const idpNodes = await responseGetRelevantIdpNodesBySid.json();
      const idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
      expect(idpNode).to.not.be.undefined;
      expect(idpNode.mode_list)
        .to.be.an('array')
        .that.include(2, 3);

      await wait(1000);
    });

    it('Should create identity request (mode 2) successfully', async function() {
      this.timeout(30000);
      const response = await identityApi.createIdentity('idp2', {
        reference_id: idp2ReferenceId,
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
        mode: 2,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.exist).to.equal(true);

      //accessorId = responseBody.accessor_id;

      const createIdentityResult = await idp2CreateIdentityResultPromise.promise;
      expect(createIdentityResult).to.deep.include({
        reference_id: idp2ReferenceId,
        success: true,
      });
      expect(createIdentityResult.reference_group_code).to.be.a('string').that
        .is.not.empty;

      const responseGetRelevantIdpNodesBySid = await commonApi.getRelevantIdpNodesBySid(
        'idp2',
        {
          namespace,
          identifier,
        },
      );

      const idpNodes = await responseGetRelevantIdpNodesBySid.json();
      const idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
      expect(idpNode).to.not.be.undefined;
      expect(idpNode.mode_list)
        .to.be.an('array')
        .that.include(2);

      await wait(1000);
    });

    it('RP create request mode 3 with sid onboard with mode 2,3 (providing idp_id_list with idp mode 2,3) unsuccessfully', async function() {
      this.timeout(10000);

      let createRequestParams = {
        reference_id: rpReferenceId,
        callback_url: config.RP_CALLBACK_URL,
        mode: 3,
        namespace,
        identifier,
        idp_id_list: ['idp1', 'idp2'],
        data_request_list: [
          {
            service_id: 'bank_statement',
            as_id_list: [],
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
        bypass_identity_check: false,
      };

      const response = await rpApi.createRequest('rp1', createRequestParams);
      expect(response.status).to.equal(400);
      const responseBody = await response.json();
      expect(responseBody.error.code).to.equal(20058);
    });
    after(function() {
      idp1EventEmitter.removeAllListeners('callback');
      idp2EventEmitter.removeAllListeners('callback');
    });
  });
});
