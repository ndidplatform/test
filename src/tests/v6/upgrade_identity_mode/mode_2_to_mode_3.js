import crypto from 'crypto';
import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import * as identityApi from '../../../api/v6/identity';
import * as rpApi from '../../../api/v6/rp';
import * as idpApi from '../../../api/v6/idp';
import * as asApi from '../../../api/v6/as';
import * as commonApi from '../../../api/v6/common';
import {
  idp1EventEmitter,
  idp2EventEmitter,
  rpEventEmitter,
  as1EventEmitter,
} from '../../../callback_server';
import * as db from '../../../db';
import {
  createEventPromise,
  generateReferenceId,
  wait,
  hash,
  createResponseSignature,
} from '../../../utils';
import { randomThaiIdNumber } from '../../../utils/thai_id';
import {
  setDataReceived,
  setDataSigned,
  createIdpIdList,
  createDataRequestList,
  createRequestMessageHash,
} from '../_fragments/fragments_utils';
import * as config from '../../../config';
import { idp2Available } from '../..';
import { eventEmitter as nodeCallbackEventEmitter } from '../../../callback_server/node';
import {
  receivePendingRequestStatusTest,
  receiveConfirmedRequestStatusTest,
  receiveMessagequeueSendSuccessCallback,
  receiveCompletedRequestStatusTest,
  receiveRequestClosedStatusTest,
} from '../_fragments/common';
import {
  verifyResponseSignature,
  getAndVerifyRequestMessagePaddedHashTest,
} from '../_fragments/request_flow_fragments/idp';

describe('Upgrade identity mode 2 to mode 3 (user has only idp mode 2) tests', function () {
  const upgradeIdentityModeRequestMessage =
    'upgrade identity mode consent request custom message';
  let namespace = 'citizen_id';
  let identifier = randomThaiIdNumber();
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
  const idpResponseReferenceId = generateReferenceId();
  const upgradeIdentityReferenceId = generateReferenceId();

  const createIdentityResultPromise = createEventPromise();
  const incomingRequestPromise = createEventPromise();
  const accessorEncryptPromise = createEventPromise();
  const responseResultPromise = createEventPromise();
  const upgradeIdentityModeResultPromise = createEventPromise();
  const upgradeIdentityModeRequestResultPromise = createEventPromise();

  const mqSendSuccessIdp1ToIdp1CallbackPromise = createEventPromise();

  let accessorId;
  let referenceGroupCode;

  let requestId;
  let identityForResponse;
  let responseAccessorId;
  let requestMessagePaddedHash;

  before(function () {
    idp1EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'create_identity_result' &&
        callbackData.reference_id === referenceId
      ) {
        createIdentityResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'upgrade_identity_mode_request_result' &&
        callbackData.reference_id === upgradeIdentityReferenceId
      ) {
        upgradeIdentityModeRequestResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'upgrade_identity_mode_result' &&
        callbackData.request_id === requestId
      ) {
        upgradeIdentityModeResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId
      ) {
        incomingRequestPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.request_id === requestId
      ) {
        responseResultPromise.resolve(callbackData);
      }
    });

    idp1EventEmitter.on('accessor_encrypt_callback', function (callbackData) {
      if (callbackData.request_id === requestId) {
        accessorEncryptPromise.resolve(callbackData);
      }
    });

    nodeCallbackEventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'message_queue_send_success' &&
        callbackData.request_id === requestId
      ) {
        if (callbackData.node_id === 'idp1') {
          if (callbackData.destination_node_id === 'idp1') {
            mqSendSuccessIdp1ToIdp1CallbackPromise.resolve(callbackData);
          }
        }
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
      lial: false,
      laal: false,
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
    this.timeout(10000);
    const response = await identityApi.getIdentityIal('idp1', {
      namespace,
      identifier,
    });
    expect(response.status).to.equal(200);
    const responseBody = await response.json();
    expect(responseBody.ial).to.equal(2.3);

    await wait(2000);
  });

  it('Should upgrade identity mode 2 to mode 3 successfully', async function () {
    this.timeout(25000);
    const response = await identityApi.upgradeIdentityMode('idp1', {
      //node_id: 'idp1',
      reference_id: upgradeIdentityReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      namespace,
      identifier,
      request_message: upgradeIdentityModeRequestMessage,
    });
    expect(response.status).to.equal(202);
    const responseBody = await response.json();
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;

    requestId = responseBody.request_id;

    const upgradeIdentityModeRequestResult =
      await upgradeIdentityModeRequestResultPromise.promise;
    expect(upgradeIdentityModeRequestResult).to.deep.include({
      reference_id: upgradeIdentityReferenceId,
      request_id: requestId,
      success: true,
    });
    expect(upgradeIdentityModeRequestResult.creation_block_height).to.be.a(
      'string'
    );
    const splittedCreationBlockHeight =
      upgradeIdentityModeRequestResult.creation_block_height.split(':');
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('IdP (idp1) should receive message queue send success (To idp1) callback', async function () {
    this.timeout(15000);
    await receiveMessagequeueSendSuccessCallback({
      nodeId: 'idp1',
      requestId,
      mqSendSuccessCallbackPromise: mqSendSuccessIdp1ToIdp1CallbackPromise,
      destinationNodeId: 'idp1',
    });
  });

  it('1st IdP should receive upgrade identity request', async function () {
    this.timeout(15000);
    const incomingRequest = await incomingRequestPromise.promise;
    expect(incomingRequest).to.deep.include({
      mode: 2,
      request_id: requestId,
      reference_group_code: referenceGroupCode,
      request_message: upgradeIdentityModeRequestMessage,
      request_message_hash: hash(
        upgradeIdentityModeRequestMessage + incomingRequest.request_message_salt
      ),
      requester_node_id: 'idp1',
      min_ial: 1.1,
      min_aal: 1,
      data_request_list: [],
    });

    expect(incomingRequest.creation_time).to.be.a('number');
    expect(incomingRequest.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight =
      incomingRequest.creation_block_height.split(':');
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    expect(incomingRequest.request_timeout).to.be.a('number');

    // requestMessageHash = incomingRequest.request_message_hash;
  });

  it('IdP should get request_message_padded_hash successfully', async function () {
    this.timeout(15000);
    identityForResponse = db.idp1Identities.find(
      (identity) =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    responseAccessorId = identityForResponse.accessors[0].accessorId;
    let accessorPublicKey = identityForResponse.accessors[0].accessorPublicKey;

    const testResult = await getAndVerifyRequestMessagePaddedHashTest({
      callApiAtNodeId: 'idp1',
      idpNodeId: 'idp1',
      requestId,
      incomingRequestPromise,
      accessorPublicKey,
      accessorId: responseAccessorId,
    });
    requestMessagePaddedHash = testResult.verifyRequestMessagePaddedHash;
  });

  it('1st IdP should create response (accept) successfully', async function () {
    this.timeout(15000);

    let accessorPrivateKey =
      identityForResponse.accessors[0].accessorPrivateKey;

    const signature = createResponseSignature(
      accessorPrivateKey,
      requestMessagePaddedHash
    );

    const response = await idpApi.createResponse('idp1', {
      reference_id: idpResponseReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      accessor_id: responseAccessorId,
      signature,
    });
    expect(response.status).to.equal(202);
  });

  // it('IdP should receive accessor encrypt callback with correct data', async function() {
  //   this.timeout(15000);
  //   const identity = db.idp1Identities.find(
  //     identity =>
  //       identity.namespace === namespace && identity.identifier === identifier,
  //   );
  //   let accessorPublicKey = identity.accessors[0].accessorPublicKey;

  //   let testResult = await idpReceiveAccessorEncryptCallbackTest({
  //     callIdpApiAtNodeId: 'idp1',
  //     accessorEncryptPromise,
  //     accessorId: responseAccessorId,
  //     requestId,
  //     idpReferenceId: idpResponseReferenceId,
  //     incomingRequestPromise,
  //     accessorPublicKey,
  //   });
  //   requestMessagePaddedHash = testResult.verifyRequestMessagePaddedHash;
  // });

  it('IdP should receive callback create response result with success = true', async function () {
    const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      node_id: 'idp1',
      type: 'response_result',
      reference_id: idpResponseReferenceId,
      request_id: requestId,
      success: true,
    });
  });

  it('Should verify IdP response signature successfully', async function () {
    this.timeout(15000);

    const identity = db.idp1Identities.find(
      (identity) =>
        identity.namespace === namespace && identity.identifier === identifier
    );
    let accessorPrivateKey = identity.accessors[0].accessorPrivateKey;

    await verifyResponseSignature({
      callApiAtNodeId: 'idp1',
      requestId,
      requestMessagePaddedHash,
      accessorPrivateKey,
    });
  });

  it('Identity should be upgraded mode successfully', async function () {
    this.timeout(20000);
    const upgradeIdentityModeResult =
      await upgradeIdentityModeResultPromise.promise;
    expect(upgradeIdentityModeResult).to.deep.include({
      reference_id: upgradeIdentityReferenceId,
      request_id: requestId,
      success: true,
    });

    const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
      namespace,
      identifier,
    });
    const idpNodes = await response.json();
    const idpNode = idpNodes.find((idpNode) => idpNode.node_id === 'idp1');
    expect(idpNode).to.not.be.undefined;
    expect(idpNodes).to.be.an('array').that.to.have.lengthOf(1);
    expect(idpNode.mode_list).to.be.an('array').that.include(2, 3);

    await wait(2000);
  });

  after(function () {
    idp1EventEmitter.removeAllListeners('callback');
    nodeCallbackEventEmitter.removeAllListeners('callback');
  });

  describe('Create request with upgraded identity at idp1 (1 IdP, 1 AS, mode 3)', function () {
    const rpReferenceId = generateReferenceId();
    const idpReferenceId = generateReferenceId();
    const asReferenceId = generateReferenceId();

    const createRequestResultPromise = createEventPromise(); // RP
    const requestStatusPendingPromise = createEventPromise(); // RP
    const incomingRequestPromise = createEventPromise(); // IDP
    const responseResultPromise = createEventPromise(); // IDP
    const accessorEncryptPromise = createEventPromise(); // IDP
    const requestStatusConfirmedPromise = createEventPromise(); // RP
    const dataRequestReceivedPromise = createEventPromise(); // AS
    const sendDataResultPromise = createEventPromise(); // AS
    const requestStatusSignedDataPromise = createEventPromise(); // RP
    const requestStatusCompletedPromise = createEventPromise(); // RP
    const requestClosedPromise = createEventPromise(); // RP

    const idp_requestStatusPendingPromise = createEventPromise();
    const idp_requestStatusConfirmedPromise = createEventPromise();
    const idp_requestStatusSignedDataPromise = createEventPromise();
    const idp_requestStatusCompletedPromise = createEventPromise();
    const idp_requestClosedPromise = createEventPromise();

    const as_requestStatusConfirmedPromise = createEventPromise();
    const as_requestStatusSignedDataPromise = createEventPromise();
    const as_requestStatusCompletedPromise = createEventPromise();
    const as_requestClosedPromise = createEventPromise();

    const mqSendSuccessRpToIdpCallbackPromise = createEventPromise();
    const mqSendSuccessRpToAsCallbackPromise = createEventPromise();
    const mqSendSuccessIdpToRpCallbackPromise = createEventPromise();
    const mqSendSuccessAsToRpCallbackPromise = createEventPromise();

    let createRequestParams;
    const data = JSON.stringify({
      test: 'test',
      withEscapedChar: 'test|fff||ss\\|NN\\\\|',
      arr: [1, 2, 3],
    });

    let requestId;
    let initialSalt;
    let identityForResponse;
    let responseAccessorId;
    let requestMessagePaddedHash;

    const requestStatusUpdates = [];
    const idp_requestStatusUpdates = [];
    const as_requestStatusUpdates = [];
    let lastStatusUpdateBlockHeight;

    let rp_node_id = 'rp1';
    let requester_node_id = 'rp1';
    let idp_node_id = 'idp1';
    let as_node_id = 'as1';
    let idpIdList;
    let dataRequestList;
    let idpResponseParams = [];
    let requestMessageHash;

    before(function () {
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
        request_message: 'Test request message (data request) (mode 2)',
        min_ial: 1.1,
        min_aal: 1,
        min_idp: 1,
        request_timeout: 86400,
        bypass_identity_check: false,
      };

      rpEventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'create_request_result' &&
          callbackData.reference_id === rpReferenceId
        ) {
          createRequestResultPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'request_status' &&
          callbackData.request_id === requestId
        ) {
          requestStatusUpdates.push(callbackData);
          if (callbackData.status === 'pending') {
            requestStatusPendingPromise.resolve(callbackData);
          } else if (callbackData.status === 'confirmed') {
            if (callbackData.data_request_list[0].response_list.length > 0) {
              if (callbackData.data_request_list[0].response_list[0].signed) {
                requestStatusSignedDataPromise.resolve(callbackData);
              }
            } else {
              requestStatusConfirmedPromise.resolve(callbackData);
            }
          } else if (callbackData.status === 'completed') {
            if (callbackData.closed) {
              requestClosedPromise.resolve(callbackData);
            } else {
              requestStatusCompletedPromise.resolve(callbackData);
            }
          }
        }
      });

      idp1EventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'incoming_request' &&
          callbackData.request_id === requestId
        ) {
          incomingRequestPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'response_result' &&
          callbackData.reference_id === idpReferenceId
        ) {
          responseResultPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'request_status' &&
          callbackData.request_id === requestId
        ) {
          idp_requestStatusUpdates.push(callbackData);
          if (callbackData.status === 'pending') {
            idp_requestStatusPendingPromise.resolve(callbackData);
          } else if (callbackData.status === 'confirmed') {
            if (callbackData.data_request_list[0].response_list.length > 0) {
              if (callbackData.data_request_list[0].response_list[0].signed) {
                idp_requestStatusSignedDataPromise.resolve(callbackData);
              }
            } else {
              idp_requestStatusConfirmedPromise.resolve(callbackData);
            }
          } else if (callbackData.status === 'completed') {
            if (callbackData.closed) {
              idp_requestClosedPromise.resolve(callbackData);
            } else {
              idp_requestStatusCompletedPromise.resolve(callbackData);
            }
          }
        }
      });

      idp1EventEmitter.on('accessor_encrypt_callback', function (callbackData) {
        if (callbackData.request_id === requestId) {
          accessorEncryptPromise.resolve(callbackData);
        }
      });

      as1EventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'data_request' &&
          callbackData.request_id === requestId
        ) {
          dataRequestReceivedPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'response_result' &&
          callbackData.reference_id === asReferenceId
        ) {
          sendDataResultPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'request_status' &&
          callbackData.request_id === requestId
        ) {
          as_requestStatusUpdates.push(callbackData);
          if (callbackData.status === 'confirmed') {
            if (callbackData.data_request_list[0].response_list.length > 0) {
              if (callbackData.data_request_list[0].response_list[0].signed) {
                as_requestStatusSignedDataPromise.resolve(callbackData);
              }
            } else {
              as_requestStatusConfirmedPromise.resolve(callbackData);
            }
          } else if (callbackData.status === 'completed') {
            if (callbackData.closed) {
              as_requestClosedPromise.resolve(callbackData);
            } else {
              as_requestStatusCompletedPromise.resolve(callbackData);
            }
          }
        }
      });

      nodeCallbackEventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'message_queue_send_success' &&
          callbackData.request_id === requestId
        ) {
          if (callbackData.node_id === 'rp1') {
            if (callbackData.destination_node_id === 'idp1') {
              mqSendSuccessRpToIdpCallbackPromise.resolve(callbackData);
            } else if (callbackData.destination_node_id === 'as1') {
              mqSendSuccessRpToAsCallbackPromise.resolve(callbackData);
            }
          } else if (callbackData.node_id === 'idp1') {
            if (callbackData.destination_node_id === 'rp1') {
              mqSendSuccessIdpToRpCallbackPromise.resolve(callbackData);
            }
          } else if (callbackData.node_id === 'as1') {
            if (callbackData.destination_node_id === 'rp1') {
              mqSendSuccessAsToRpCallbackPromise.resolve(callbackData);
            }
          }
        }
      });
    });

    it('RP should create a request successfully', async function () {
      this.timeout(10000);
      const response = await rpApi.createRequest('rp1', createRequestParams);
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

      requestId = responseBody.request_id;
      initialSalt = responseBody.initial_salt;

      const createRequestResult = await createRequestResultPromise.promise;
      expect(createRequestResult.success).to.equal(true);
      expect(createRequestResult.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight =
        createRequestResult.creation_block_height.split(':');
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
      lastStatusUpdateBlockHeight = parseInt(splittedCreationBlockHeight[1]);
    });

    it('RP should receive pending request status', async function () {
      this.timeout(30000);

      [idpIdList, dataRequestList, requestMessageHash] = await Promise.all([
        createIdpIdList({
          createRequestParams,
          callRpApiAtNodeId: rp_node_id,
        }),
        createDataRequestList({
          createRequestParams,
          requestId,
          initialSalt,
          callRpApiAtNodeId: rp_node_id,
        }),
        createRequestMessageHash({
          createRequestParams,
          initialSalt,
        }),
      ]); // create idp_id_list, as_id_list, request_message_hash for test

      await receivePendingRequestStatusTest({
        nodeId: rp_node_id,
        createRequestParams,
        requestId,
        idpIdList,
        dataRequestList,
        requestMessageHash,
        lastStatusUpdateBlockHeight,
        requestStatusPendingPromise,
        requesterNodeId: rp_node_id,
      });

      // const requestStatus = await requestStatusPendingPromise.promise;
      // expect(requestStatus).to.deep.include({
      //   request_id: requestId,
      //   status: 'pending',
      //   mode: createRequestParams.mode,
      //   min_idp: createRequestParams.min_idp,
      //   answered_idp_count: 0,
      //   closed: false,
      //   timed_out: false,
      //   service_list: [
      //     {
      //       service_id: createRequestParams.data_request_list[0].service_id,
      //       min_as: createRequestParams.data_request_list[0].min_as,
      //       signed_data_count: 0,
      //       received_data_count: 0,
      //     },
      //   ],
      //   response_valid_list: [],
      // });
      // expect(requestStatus).to.have.property('block_height');
      // expect(requestStatus.block_height).is.a('string');
      // const splittedBlockHeight = requestStatus.block_height.split(':');
      // expect(splittedBlockHeight).to.have.lengthOf(2);
      // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
      // expect(parseInt(splittedBlockHeight[1])).to.equal(
      //   lastStatusUpdateBlockHeight,
      // );
      // lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
    });

    it('RP should receive message queue send success (To idp1) callback', async function () {
      this.timeout(15000);
      await receiveMessagequeueSendSuccessCallback({
        nodeId: 'rp1',
        requestId,
        mqSendSuccessCallbackPromise: mqSendSuccessRpToIdpCallbackPromise,
        destinationNodeId: 'idp1',
      });
    });

    it('IdP should receive incoming request callback', async function () {
      this.timeout(15000);
      const incomingRequest = await incomingRequestPromise.promise;

      const dataRequestListWithoutParams =
        createRequestParams.data_request_list.map((dataRequest) => {
          const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
          return {
            ...dataRequestWithoutParams,
          };
        });
      expect(incomingRequest).to.deep.include({
        node_id: 'idp1',
        type: 'incoming_request',
        mode: createRequestParams.mode,
        request_id: requestId,
        request_message: createRequestParams.request_message,
        request_message_hash: hash(
          createRequestParams.request_message +
            incomingRequest.request_message_salt
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
      const splittedCreationBlockHeight =
        incomingRequest.creation_block_height.split(':');
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('IdP should get request_message_padded_hash successfully', async function () {
      this.timeout(15000);
      identityForResponse = db.idp1Identities.find(
        (identity) =>
          identity.namespace === namespace && identity.identifier === identifier
      );

      responseAccessorId = identityForResponse.accessors[0].accessorId;
      let accessorPublicKey =
        identityForResponse.accessors[0].accessorPublicKey;

      const testResult = await getAndVerifyRequestMessagePaddedHashTest({
        callApiAtNodeId: 'idp1',
        idpNodeId: 'idp1',
        requestId,
        incomingRequestPromise,
        accessorPublicKey,
        accessorId: responseAccessorId,
      });
      requestMessagePaddedHash = testResult.verifyRequestMessagePaddedHash;
    });

    it('IdP should create response (accept) successfully', async function () {
      this.timeout(10000);

      let accessorPrivateKey =
        identityForResponse.accessors[0].accessorPrivateKey;

      const signature = createResponseSignature(
        accessorPrivateKey,
        requestMessagePaddedHash
      );

      let idpResponse = {
        reference_id: idpReferenceId,
        callback_url: config.IDP1_CALLBACK_URL,
        request_id: requestId,
        ial: 2.3,
        aal: 3,
        status: 'accept',
        accessor_id: responseAccessorId,
        signature,
      };

      idpResponseParams.push({
        ...idpResponse,
        idp_id: 'idp1',
        valid_signature: true,
        valid_ial: true,
      });

      const response = await idpApi.createResponse('idp1', idpResponse);
      expect(response.status).to.equal(202);
    });

    // it('IdP should receive accessor encrypt callback with correct data', async function() {
    //   this.timeout(15000);
    //   const identity = db.idp1Identities.find(
    //     identity =>
    //       identity.namespace === namespace &&
    //       identity.identifier === identifier,
    //   );
    //   let accessorPublicKey = identity.accessors[0].accessorPublicKey;

    //   let testResult = await idpReceiveAccessorEncryptCallbackTest({
    //     callIdpApiAtNodeId: 'idp1',
    //     accessorEncryptPromise,
    //     accessorId: responseAccessorId,
    //     requestId,
    //     idpReferenceId: idpReferenceId,
    //     incomingRequestPromise,
    //     accessorPublicKey,
    //   });
    //   requestMessagePaddedHash = testResult.verifyRequestMessagePaddedHash;
    // });

    it('IdP should receive callback create response result with success = true', async function () {
      const responseResult = await responseResultPromise.promise;
      expect(responseResult).to.deep.include({
        node_id: 'idp1',
        type: 'response_result',
        reference_id: idpReferenceId,
        request_id: requestId,
        success: true,
      });
    });

    it('IdP (idp1) should receive message queue send success (To rp1) callback', async function () {
      this.timeout(15000);
      await receiveMessagequeueSendSuccessCallback({
        nodeId: 'idp1',
        requestId,
        mqSendSuccessCallbackPromise: mqSendSuccessIdpToRpCallbackPromise,
        destinationNodeId: 'rp1',
      });
    });

    it('Should verify IdP response signature successfully', async function () {
      this.timeout(15000);
      const identity = db.idp1Identities.find(
        (identity) =>
          identity.namespace === namespace && identity.identifier === identifier
      );
      let accessorPrivateKey = identity.accessors[0].accessorPrivateKey;

      await verifyResponseSignature({
        callApiAtNodeId: 'idp1',
        requestId,
        requestMessagePaddedHash,
        accessorPrivateKey,
      });
    });

    it('RP should receive confirmed request status with valid proofs', async function () {
      this.timeout(15000);

      await receiveConfirmedRequestStatusTest({
        nodeId: rp_node_id,
        requestStatusConfirmedPromise,
        requestId,
        createRequestParams,
        dataRequestList,
        idpResponse: idpResponseParams,
        requestMessageHash,
        idpIdList,
        lastStatusUpdateBlockHeight,
        requesterNodeId: requester_node_id,
      });

      // const requestStatus = await requestStatusConfirmedPromise.promise;
      // expect(requestStatus).to.deep.include({
      //   request_id: requestId,
      //   status: 'confirmed',
      //   mode: createRequestParams.mode,
      //   min_idp: createRequestParams.min_idp,
      //   answered_idp_count: 1,
      //   closed: false,
      //   timed_out: false,
      //   service_list: [
      //     {
      //       service_id: createRequestParams.data_request_list[0].service_id,
      //       min_as: createRequestParams.data_request_list[0].min_as,
      //       signed_data_count: 0,
      //       received_data_count: 0,
      //     },
      //   ],
      //   response_valid_list: [
      //     {
      //       idp_id: 'idp1',
      //       valid_signature: true,
      //       valid_ial: true,
      //     },
      //   ],
      // });
      // expect(requestStatus).to.have.property('block_height');
      // expect(requestStatus.block_height).is.a('string');
      // const splittedBlockHeight = requestStatus.block_height.split(':');
      // expect(splittedBlockHeight).to.have.lengthOf(2);
      // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
      // expect(parseInt(splittedBlockHeight[1])).to.be.above(
      //   lastStatusUpdateBlockHeight,
      // );
      // lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
    });

    it('RP should receive message queue send success (To as1) callback', async function () {
      this.timeout(15000);
      await receiveMessagequeueSendSuccessCallback({
        nodeId: 'rp1',
        requestId,
        mqSendSuccessCallbackPromise: mqSendSuccessRpToAsCallbackPromise,
        destinationNodeId: 'as1',
      });
    });

    it('AS should receive data request', async function () {
      this.timeout(15000);
      const dataRequest = await dataRequestReceivedPromise.promise;
      expect(dataRequest).to.deep.include({
        type: 'data_request',
        request_id: requestId,
        mode: createRequestParams.mode,
        namespace,
        identifier,
        service_id: createRequestParams.data_request_list[0].service_id,
        request_params: createRequestParams.data_request_list[0].request_params,
        requester_node_id: 'rp1',
        max_ial: 2.3,
        max_aal: 3,

        request_timeout: createRequestParams.request_timeout,
      });
      expect(dataRequest.response_signature_list).to.have.lengthOf(1);
      expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is
        .not.empty;
      expect(dataRequest.creation_time).to.be.a('number');
      expect(dataRequest.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight =
        dataRequest.creation_block_height.split(':');
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('AS should send data successfully', async function () {
      this.timeout(15000);
      const response = await asApi.sendData('as1', {
        requestId,
        serviceId: createRequestParams.data_request_list[0].service_id,
        reference_id: asReferenceId,
        callback_url: config.AS1_CALLBACK_URL,
        data,
      });
      expect(response.status).to.equal(202);

      const sendDataResult = await sendDataResultPromise.promise;
      expect(sendDataResult).to.deep.include({
        node_id: 'as1',
        type: 'response_result',
        reference_id: asReferenceId,
        success: true,
      });

      dataRequestList = setDataSigned(
        dataRequestList,
        createRequestParams.data_request_list[0].service_id,
        'as1'
      );
    });

    it('AS (as1) should receive message queue send success (To rp1) callback', async function () {
      this.timeout(15000);
      await receiveMessagequeueSendSuccessCallback({
        nodeId: 'as1',
        requestId,
        mqSendSuccessCallbackPromise: mqSendSuccessAsToRpCallbackPromise,
        destinationNodeId: 'rp1',
      });
    });

    it('RP should receive request status with signed data', async function () {
      this.timeout(15000);

      await receiveConfirmedRequestStatusTest({
        nodeId: rp_node_id,
        requestStatusConfirmedPromise: requestStatusSignedDataPromise,
        requestId,
        createRequestParams,
        dataRequestList,
        idpResponse: idpResponseParams,
        requestMessageHash,
        idpIdList,
        lastStatusUpdateBlockHeight,
        requesterNodeId: requester_node_id,
      });

      // const requestStatus = await requestStatusSignedDataPromise.promise;
      // expect(requestStatus).to.deep.include({
      //   request_id: requestId,
      //   status: 'confirmed',
      //   mode: createRequestParams.mode,
      //   min_idp: createRequestParams.min_idp,
      //   answered_idp_count: 1,
      //   closed: false,
      //   timed_out: false,
      //   service_list: [
      //     {
      //       service_id: createRequestParams.data_request_list[0].service_id,
      //       min_as: createRequestParams.data_request_list[0].min_as,
      //       signed_data_count: 1,
      //       received_data_count: 0,
      //     },
      //   ],
      //   response_valid_list: [
      //     {
      //       idp_id: 'idp1',
      //       valid_signature: true,
      //       valid_ial: true,
      //     },
      //   ],
      // });
      // expect(requestStatus).to.have.property('block_height');
      // expect(requestStatus.block_height).is.a('string');
      // const splittedBlockHeight = requestStatus.block_height.split(':');
      // expect(splittedBlockHeight).to.have.lengthOf(2);
      // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
      // expect(parseInt(splittedBlockHeight[1])).to.be.above(
      //   lastStatusUpdateBlockHeight,
      // );
      // lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
    });

    it('IdP should receive request status with signed data', async function () {
      this.timeout(15000);

      await receiveConfirmedRequestStatusTest({
        nodeId: idp_node_id,
        requestStatusConfirmedPromise: idp_requestStatusSignedDataPromise,
        requestId,
        createRequestParams,
        dataRequestList,
        idpResponse: idpResponseParams,
        requestMessageHash,
        idpIdList,
        lastStatusUpdateBlockHeight,
        requesterNodeId: requester_node_id,
        isNotRp: true,
      });

      // const requestStatus = await idp_requestStatusSignedDataPromise.promise;
      // expect(requestStatus).to.deep.include({
      //   request_id: requestId,
      //   status: 'confirmed',
      //   mode: createRequestParams.mode,
      //   min_idp: createRequestParams.min_idp,
      //   answered_idp_count: 1,
      //   closed: false,
      //   timed_out: false,
      //   service_list: [
      //     {
      //       service_id: createRequestParams.data_request_list[0].service_id,
      //       min_as: createRequestParams.data_request_list[0].min_as,
      //       signed_data_count: 1,
      //       received_data_count: 0,
      //     },
      //   ],
      //   response_valid_list: [
      //     {
      //       idp_id: 'idp1',
      //       valid_signature: null,
      //       valid_ial: null,
      //     },
      //   ],
      // });
      // expect(requestStatus).to.have.property('block_height');
      // expect(requestStatus.block_height).is.a('string');
      // const splittedBlockHeight = requestStatus.block_height.split(':');
      // expect(splittedBlockHeight).to.have.lengthOf(2);
      // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
      // expect(parseInt(splittedBlockHeight[1])).to.equal(
      //   lastStatusUpdateBlockHeight,
      // );
    });

    it('AS should receive request status with signed data', async function () {
      this.timeout(15000);

      await receiveConfirmedRequestStatusTest({
        nodeId: as_node_id,
        requestStatusConfirmedPromise: as_requestStatusSignedDataPromise,
        requestId,
        createRequestParams,
        dataRequestList,
        idpResponse: idpResponseParams,
        requestMessageHash,
        idpIdList,
        lastStatusUpdateBlockHeight,
        requesterNodeId: requester_node_id,
        isNotRp: true,
      });

      dataRequestList = setDataReceived(
        dataRequestList,
        createRequestParams.data_request_list[0].service_id,
        'as1'
      );

      // const requestStatus = await as_requestStatusSignedDataPromise.promise;
      // expect(requestStatus).to.deep.include({
      //   request_id: requestId,
      //   status: 'confirmed',
      //   mode: createRequestParams.mode,
      //   min_idp: createRequestParams.min_idp,
      //   answered_idp_count: 1,
      //   closed: false,
      //   timed_out: false,
      //   service_list: [
      //     {
      //       service_id: createRequestParams.data_request_list[0].service_id,
      //       min_as: createRequestParams.data_request_list[0].min_as,
      //       signed_data_count: 1,
      //       received_data_count: 0,
      //     },
      //   ],
      //   response_valid_list: [
      //     {
      //       idp_id: 'idp1',
      //       valid_signature: null,
      //       valid_ial: null,
      //     },
      //   ],
      // });
      // expect(requestStatus).to.have.property('block_height');
      // expect(requestStatus.block_height).is.a('string');
      // const splittedBlockHeight = requestStatus.block_height.split(':');
      // expect(splittedBlockHeight).to.have.lengthOf(2);
      // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
      // expect(parseInt(splittedBlockHeight[1])).to.equal(
      //   lastStatusUpdateBlockHeight,
      // );
    });

    it('RP should receive completed request status with received data', async function () {
      this.timeout(15000);

      await receiveCompletedRequestStatusTest({
        nodeId: rp_node_id,
        requestStatusCompletedPromise,
        requestId,
        createRequestParams,
        dataRequestList,
        idpResponse: idpResponseParams,
        requestMessageHash,
        idpIdList,
        lastStatusUpdateBlockHeight,
        requesterNodeId: requester_node_id,
      });
      // const requestStatus = await requestStatusCompletedPromise.promise;
      // expect(requestStatus).to.deep.include({
      //   request_id: requestId,
      //   status: 'completed',
      //   mode: createRequestParams.mode,
      //   min_idp: createRequestParams.min_idp,
      //   answered_idp_count: 1,
      //   closed: false,
      //   timed_out: false,
      //   service_list: [
      //     {
      //       service_id: createRequestParams.data_request_list[0].service_id,
      //       min_as: createRequestParams.data_request_list[0].min_as,
      //       signed_data_count: 1,
      //       received_data_count: 1,
      //     },
      //   ],
      //   response_valid_list: [
      //     {
      //       idp_id: 'idp1',
      //       valid_signature: true,
      //       valid_ial: true,
      //     },
      //   ],
      // });
      // expect(requestStatus).to.have.property('block_height');
      // expect(requestStatus.block_height).is.a('string');
      // const splittedBlockHeight = requestStatus.block_height.split(':');
      // expect(splittedBlockHeight).to.have.lengthOf(2);
      // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
      // expect(parseInt(splittedBlockHeight[1])).to.be.above(
      //   lastStatusUpdateBlockHeight,
      // );
      // lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
    });

    it('IdP should receive completed request status with received data', async function () {
      this.timeout(15000);

      await receiveCompletedRequestStatusTest({
        nodeId: idp_node_id,
        requestStatusCompletedPromise: idp_requestStatusCompletedPromise,
        requestId,
        createRequestParams,
        dataRequestList,
        idpResponse: idpResponseParams,
        requestMessageHash,
        idpIdList,
        lastStatusUpdateBlockHeight,
        requesterNodeId: requester_node_id,
        isNotRp: true,
      });

      // const requestStatus = await idp_requestStatusCompletedPromise.promise;
      // expect(requestStatus).to.deep.include({
      //   request_id: requestId,
      //   status: 'completed',
      //   mode: createRequestParams.mode,
      //   min_idp: createRequestParams.min_idp,
      //   answered_idp_count: 1,
      //   closed: false,
      //   timed_out: false,
      //   service_list: [
      //     {
      //       service_id: createRequestParams.data_request_list[0].service_id,
      //       min_as: createRequestParams.data_request_list[0].min_as,
      //       signed_data_count: 1,
      //       received_data_count: 1,
      //     },
      //   ],
      //   response_valid_list: [
      //     {
      //       idp_id: 'idp1',
      //       valid_signature: null,
      //       valid_ial: null,
      //     },
      //   ],
      // });
      // expect(requestStatus).to.have.property('block_height');
      // expect(requestStatus.block_height).is.a('string');
      // const splittedBlockHeight = requestStatus.block_height.split(':');
      // expect(splittedBlockHeight).to.have.lengthOf(2);
      // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
      // expect(parseInt(splittedBlockHeight[1])).to.equal(
      //   lastStatusUpdateBlockHeight,
      // );
    });

    it('AS should receive completed request status with received data', async function () {
      this.timeout(15000);

      await receiveCompletedRequestStatusTest({
        nodeId: as_node_id,
        requestStatusCompletedPromise: as_requestStatusCompletedPromise,
        requestId,
        createRequestParams,
        dataRequestList,
        idpResponse: idpResponseParams,
        requestMessageHash,
        idpIdList,
        lastStatusUpdateBlockHeight,
        requesterNodeId: requester_node_id,
        isNotRp: true,
      });

      // const requestStatus = await as_requestStatusCompletedPromise.promise;
      // expect(requestStatus).to.deep.include({
      //   request_id: requestId,
      //   status: 'completed',
      //   mode: createRequestParams.mode,
      //   min_idp: createRequestParams.min_idp,
      //   answered_idp_count: 1,
      //   closed: false,
      //   timed_out: false,
      //   service_list: [
      //     {
      //       service_id: createRequestParams.data_request_list[0].service_id,
      //       min_as: createRequestParams.data_request_list[0].min_as,
      //       signed_data_count: 1,
      //       received_data_count: 1,
      //     },
      //   ],
      //   response_valid_list: [
      //     {
      //       idp_id: 'idp1',
      //       valid_signature: null,
      //       valid_ial: null,
      //     },
      //   ],
      // });
      // expect(requestStatus).to.have.property('block_height');
      // expect(requestStatus.block_height).is.a('string');
      // const splittedBlockHeight = requestStatus.block_height.split(':');
      // expect(splittedBlockHeight).to.have.lengthOf(2);
      // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
      // expect(parseInt(splittedBlockHeight[1])).to.equal(
      //   lastStatusUpdateBlockHeight,
      // );
    });

    it('RP should receive request closed status', async function () {
      this.timeout(10000);

      await receiveRequestClosedStatusTest({
        nodeId: rp_node_id,
        requestClosedPromise,
        requestId,
        createRequestParams,
        dataRequestList,
        idpResponse: idpResponseParams,
        requestMessageHash,
        idpIdList,
        lastStatusUpdateBlockHeight,
        requesterNodeId: requester_node_id,
      });

      // const requestStatus = await requestClosedPromise.promise;
      // expect(requestStatus).to.deep.include({
      //   request_id: requestId,
      //   status: 'completed',
      //   mode: createRequestParams.mode,
      //   min_idp: createRequestParams.min_idp,
      //   answered_idp_count: 1,
      //   closed: true,
      //   timed_out: false,
      //   service_list: [
      //     {
      //       service_id: createRequestParams.data_request_list[0].service_id,
      //       min_as: createRequestParams.data_request_list[0].min_as,
      //       signed_data_count: 1,
      //       received_data_count: 1,
      //     },
      //   ],
      //   response_valid_list: [
      //     {
      //       idp_id: 'idp1',
      //       valid_signature: true,
      //       valid_ial: true,
      //     },
      //   ],
      // });
      // expect(requestStatus).to.have.property('block_height');
      // expect(requestStatus.block_height).is.a('string');
      // const splittedBlockHeight = requestStatus.block_height.split(':');
      // expect(splittedBlockHeight).to.have.lengthOf(2);
      // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
      // expect(parseInt(splittedBlockHeight[1])).to.be.above(
      //   lastStatusUpdateBlockHeight,
      // );
      // lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
    });

    it('IdP should receive request closed status', async function () {
      this.timeout(10000);

      await receiveRequestClosedStatusTest({
        nodeId: idp_node_id,
        requestClosedPromise: idp_requestClosedPromise,
        requestId,
        createRequestParams,
        dataRequestList,
        idpResponse: idpResponseParams,
        requestMessageHash,
        idpIdList,
        lastStatusUpdateBlockHeight,
        requesterNodeId: requester_node_id,
      });

      // const requestStatus = await idp_requestClosedPromise.promise;
      // expect(requestStatus).to.deep.include({
      //   request_id: requestId,
      //   status: 'completed',
      //   mode: createRequestParams.mode,
      //   min_idp: createRequestParams.min_idp,
      //   answered_idp_count: 1,
      //   closed: true,
      //   timed_out: false,
      //   service_list: [
      //     {
      //       service_id: createRequestParams.data_request_list[0].service_id,
      //       min_as: createRequestParams.data_request_list[0].min_as,
      //       signed_data_count: 1,
      //       received_data_count: 1,
      //     },
      //   ],
      //   response_valid_list: [
      //     {
      //       idp_id: 'idp1',
      //       valid_signature: true,

      //       valid_ial: true,
      //     },
      //   ],
      // });
      // expect(requestStatus).to.have.property('block_height');
      // expect(requestStatus.block_height).is.a('string');
      // const splittedBlockHeight = requestStatus.block_height.split(':');
      // expect(splittedBlockHeight).to.have.lengthOf(2);
      // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
      // expect(parseInt(splittedBlockHeight[1])).to.equal(
      //   lastStatusUpdateBlockHeight,
      // );
    });

    it('AS should receive request closed status', async function () {
      this.timeout(10000);

      await receiveRequestClosedStatusTest({
        nodeId: as_node_id,
        requestClosedPromise: as_requestClosedPromise,
        requestId,
        createRequestParams,
        dataRequestList,
        idpResponse: idpResponseParams,
        requestMessageHash,
        idpIdList,
        lastStatusUpdateBlockHeight,
        requesterNodeId: requester_node_id,
      });
      // const requestStatus = await as_requestClosedPromise.promise;
      // expect(requestStatus).to.deep.include({
      //   request_id: requestId,
      //   status: 'completed',
      //   mode: createRequestParams.mode,
      //   min_idp: createRequestParams.min_idp,
      //   answered_idp_count: 1,
      //   closed: true,
      //   timed_out: false,
      //   service_list: [
      //     {
      //       service_id: createRequestParams.data_request_list[0].service_id,
      //       min_as: createRequestParams.data_request_list[0].min_as,
      //       signed_data_count: 1,
      //       received_data_count: 1,
      //     },
      //   ],
      //   response_valid_list: [
      //     {
      //       idp_id: 'idp1',
      //       valid_signature: true,

      //       valid_ial: true,
      //     },
      //   ],
      // });
      // expect(requestStatus).to.have.property('block_height');
      // expect(requestStatus.block_height).is.a('string');
      // const splittedBlockHeight = requestStatus.block_height.split(':');
      // expect(splittedBlockHeight).to.have.lengthOf(2);
      // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
      // expect(parseInt(splittedBlockHeight[1])).to.equal(
      //   lastStatusUpdateBlockHeight,
      // );
    });

    it('RP should get the correct data received from AS', async function () {
      const response = await rpApi.getDataFromAS('rp1', {
        requestId,
      });
      const dataArr = await response.json();
      expect(response.status).to.equal(200);

      expect(dataArr).to.have.lengthOf(1);
      expect(dataArr[0]).to.deep.include({
        source_node_id: 'as1',
        service_id: createRequestParams.data_request_list[0].service_id,
        signature_sign_method: 'RSA-SHA256',
        data,
      });
      expect(dataArr[0].source_signature).to.be.a('string').that.is.not.empty;
      expect(dataArr[0].data_salt).to.be.a('string').that.is.not.empty;
    });

    it('RP should receive 5 request status updates', function () {
      expect(requestStatusUpdates).to.have.lengthOf(5);
    });

    it('IdP should receive 4 or 5 request status updates', function () {
      expect(idp_requestStatusUpdates).to.have.length.within(4, 5);
    });

    it('AS should receive 3 or 4 request status updates', function () {
      expect(as_requestStatusUpdates).to.have.length.within(3, 4);
    });

    it('RP should remove data requested from AS successfully', async function () {
      const response = await rpApi.removeDataRequestedFromAS('rp1', {
        request_id: requestId,
      });
      expect(response.status).to.equal(204);
    });

    it('RP should have no saved data requested from AS left after removal', async function () {
      const response = await rpApi.getDataFromAS('rp1', {
        requestId,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.be.an('array').that.is.empty;
    });

    it('RP should have and able to get saved private messages', async function () {
      const response = await commonApi.getPrivateMessages('rp1', {
        request_id: requestId,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.be.an('array').that.is.not.empty;
    });

    it('RP should remove saved private messages successfully', async function () {
      const response = await commonApi.removePrivateMessages('rp1', {
        request_id: requestId,
      });
      expect(response.status).to.equal(204);
    });

    it('RP should have no saved private messages left after removal', async function () {
      const response = await commonApi.getPrivateMessages('rp1', {
        request_id: requestId,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.be.an('array').that.is.empty;
    });

    it('IdP should have and able to get saved private messages', async function () {
      const response = await commonApi.getPrivateMessages('idp1', {
        request_id: requestId,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.be.an('array').that.is.not.empty;
    });

    it('IdP should remove saved private messages successfully', async function () {
      const response = await commonApi.removePrivateMessages('idp1', {
        request_id: requestId,
      });
      expect(response.status).to.equal(204);
    });

    it('IdP should have no saved private messages left after removal', async function () {
      const response = await commonApi.getPrivateMessages('idp1', {
        request_id: requestId,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.be.an('array').that.is.empty;
    });

    it('AS should have and able to get saved private messages', async function () {
      const response = await commonApi.getPrivateMessages('as1', {
        request_id: requestId,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.be.an('array').that.is.not.empty;
    });

    it('AS should remove saved private messages successfully', async function () {
      const response = await commonApi.removePrivateMessages('as1', {
        request_id: requestId,
      });
      expect(response.status).to.equal(204);
    });

    it('AS should have no saved private messages left after removal', async function () {
      const response = await commonApi.getPrivateMessages('as1', {
        request_id: requestId,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.be.an('array').that.is.empty;
    });

    after(function () {
      let identityIndex = db.idp1Identities.findIndex(
        (identity) =>
          identity.namespace === namespace && identity.identifier === identifier
      );
      db.idp1Identities.splice(identityIndex, 1);
      rpEventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
      as1EventEmitter.removeAllListeners('callback');
      nodeCallbackEventEmitter.removeAllListeners('callback');
    });
  });
});

describe('Upgrade identity mode 2 to mode 3 (user have idp mode 2 and mode 3) tests', function () {
  //idp2 = mode 3 , idp1 = mode 2
  const upgradeIdentityModeRequestMessage =
    'upgrade identity mode consent request custom message';
  let namespace = 'citizen_id';
  let identifier = randomThaiIdNumber();
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
  const idpResponseReferenceId = generateReferenceId();
  const upgradeIdentityReferenceId = generateReferenceId();

  const createIdentityResultPromise = createEventPromise();
  const incomingRequestPromise = createEventPromise();
  const accessorEncryptPromise = createEventPromise();
  const responseResultPromise = createEventPromise();
  const upgradeIdentityModeResultPromise = createEventPromise();
  const upgradeIdentityModeRequestResultPromise = createEventPromise();

  const notificationCreateIdentityPromise = createEventPromise();
  const notificationUpgradeIdentityModePromise = createEventPromise();

  const mqSendSuccessIdp1ToIdp2CallbackPromise = createEventPromise();
  const mqSendSuccessIdp2ToIdp1CallbackPromise = createEventPromise();

  let accessorId;
  let referenceGroupCode;
  let requestId;
  let identityForResponse;
  let responseAccessorId;
  let requestMessagePaddedHash;

  before(function () {
    if (!idp2Available) {
      this.test.parent.pending = true;
      this.skip();
    }
    idp1EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'create_identity_result' &&
        callbackData.reference_id === referenceId
      ) {
        createIdentityResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'upgrade_identity_mode_request_result' &&
        callbackData.reference_id === upgradeIdentityReferenceId
      ) {
        upgradeIdentityModeRequestResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'upgrade_identity_mode_result' &&
        callbackData.request_id === requestId
      ) {
        upgradeIdentityModeResultPromise.resolve(callbackData);
      }
    });

    idp2EventEmitter.on('accessor_encrypt_callback', function (callbackData) {
      if (callbackData.request_id === requestId) {
        accessorEncryptPromise.resolve(callbackData);
      }
    });

    idp2EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'create_identity_result' &&
        callbackData.reference_id === referenceId
      ) {
        createIdentityResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId
      ) {
        incomingRequestPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.request_id === requestId
      ) {
        responseResultPromise.resolve(callbackData);
      }
    });

    idp2EventEmitter.on(
      'identity_notification_callback',
      function (callbackData) {
        if (
          callbackData.type === 'identity_modification_notification' &&
          callbackData.reference_group_code === referenceGroupCode &&
          callbackData.action === 'create_identity'
        ) {
          notificationCreateIdentityPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'identity_modification_notification' &&
          callbackData.reference_group_code === referenceGroupCode &&
          callbackData.action === 'upgrade_identity_mode'
        ) {
          notificationUpgradeIdentityModePromise.resolve(callbackData);
        }
      }
    );

    nodeCallbackEventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'message_queue_send_success' &&
        callbackData.request_id === requestId
      ) {
        if (callbackData.node_id === 'idp1') {
          if (callbackData.destination_node_id === 'idp2') {
            mqSendSuccessIdp1ToIdp2CallbackPromise.resolve(callbackData);
          }
        } else if (callbackData.node_id === 'idp2') {
          if (callbackData.destination_node_id === 'idp1') {
            mqSendSuccessIdp2ToIdp1CallbackPromise.resolve(callbackData);
          }
        }
      }
    });
  });

  it('Before create identity this sid should not exist on platform ', async function () {
    const response = await identityApi.getIdentityInfo('idp2', {
      namespace,
      identifier,
    });
    expect(response.status).to.equal(404);
  });

  it('Before create identity this sid should not associated with idp2 ', async function () {
    const response = await commonApi.getRelevantIdpNodesBySid('idp2', {
      namespace,
      identifier,
    });
    const idpNodes = await response.json();
    const idpNode = idpNodes.find((idpNode) => idpNode.node_id === 'idp2');
    expect(idpNode).to.be.an.undefined;
  });

  it('Before create identity should not get identity ial', async function () {
    const response = await identityApi.getIdentityIal('idp2', {
      namespace,
      identifier,
    });
    expect(response.status).to.equal(404);
  });

  it('Should create identity request (mode 3) successfully', async function () {
    this.timeout(10000);
    const response = await identityApi.createIdentity('idp2', {
      reference_id: referenceId,
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
      mode: 3,
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

    const response = await commonApi.getRelevantIdpNodesBySid('idp2', {
      namespace,
      identifier,
    });

    const idpNodes = await response.json();
    const idpNode = idpNodes.find((idpNode) => idpNode.node_id === 'idp2');
    expect(idpNode).to.not.be.undefined;
    expect(idpNode.mode_list).to.be.an('array').that.include(2, 3);

    db.idp2Identities.push({
      referenceGroupCode,
      mode: 3,
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
    const response = await identityApi.getIdentityInfo('idp2', {
      namespace,
      identifier,
    });
    expect(response.status).to.equal(200);
    const responseBody = await response.json();
    expect(responseBody.reference_group_code).to.equal(referenceGroupCode);
  });

  it('After create identity should get identity ial successfully', async function () {
    this.timeout(10000);
    const response = await identityApi.getIdentityIal('idp2', {
      namespace,
      identifier,
    });
    expect(response.status).to.equal(200);
    const responseBody = await response.json();
    expect(responseBody.ial).to.equal(2.3);

    await wait(2000);
  });

  it('Before create identity this sid should exist on platform ', async function () {
    const response = await identityApi.getIdentityInfo('idp1', {
      namespace,
      identifier,
    });
    expect(response.status).to.equal(200);
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

  it('Should create identity request (mode 2) successfully', async function () {
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
      lial: false,
      laal: false,
      mode: 2,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody).to.not.include.keys('request_id');
    expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.exist).to.equal(true);

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

    await wait(2000);

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
    this.timeout(10000);
    const response = await identityApi.getIdentityIal('idp1', {
      namespace,
      identifier,
    });
    expect(response.status).to.equal(200);
    const responseBody = await response.json();
    expect(responseBody.ial).to.equal(2.3);

    await wait(2000);
  });

  it('After create identity IdP (idp2) that associated with this sid should receive identity notification callback', async function () {
    this.timeout(15000);
    const notificationCreateIdentity =
      await notificationCreateIdentityPromise.promise;
    expect(notificationCreateIdentity).to.deep.include({
      node_id: 'idp2',
      type: 'identity_modification_notification',
      reference_group_code: referenceGroupCode,
      action: 'create_identity',
      actor_node_id: 'idp1',
    });
  });

  it('RP should create a request (mode 3) to idp1 (identity at idp1 is mode 2) unsuccessfully', async function () {
    this.timeout(10000);

    let createRequestParams = {
      reference_id: generateReferenceId(),
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

  it('Should upgrade identity mode 2 to mode 3 successfully', async function () {
    this.timeout(25000);
    const response = await identityApi.upgradeIdentityMode('idp1', {
      //node_id: 'idp1',
      reference_id: upgradeIdentityReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      namespace,
      identifier,
      request_message: upgradeIdentityModeRequestMessage,
    });
    expect(response.status).to.equal(202);
    const responseBody = await response.json();
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;

    requestId = responseBody.request_id;

    const upgradeIdentityModeRequestResult =
      await upgradeIdentityModeRequestResultPromise.promise;
    expect(upgradeIdentityModeRequestResult).to.deep.include({
      reference_id: upgradeIdentityReferenceId,
      request_id: requestId,
      success: true,
    });
    expect(upgradeIdentityModeRequestResult.creation_block_height).to.be.a(
      'string'
    );
    const splittedCreationBlockHeight =
      upgradeIdentityModeRequestResult.creation_block_height.split(':');
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('IdP (idp1) should receive message queue send success (To idp2) callback', async function () {
    this.timeout(15000);
    await receiveMessagequeueSendSuccessCallback({
      nodeId: 'idp1',
      requestId,
      mqSendSuccessCallbackPromise: mqSendSuccessIdp1ToIdp2CallbackPromise,
      destinationNodeId: 'idp2',
    });
  });

  it('idp2 should receive upgrade identity request', async function () {
    this.timeout(15000);
    const incomingRequest = await incomingRequestPromise.promise;
    expect(incomingRequest).to.deep.include({
      mode: 3,
      request_id: requestId,
      reference_group_code: referenceGroupCode,
      request_message: upgradeIdentityModeRequestMessage,
      request_message_hash: hash(
        upgradeIdentityModeRequestMessage + incomingRequest.request_message_salt
      ),
      requester_node_id: 'idp1',
      min_ial: 1.1,
      min_aal: 1,
      data_request_list: [],
    });

    expect(incomingRequest.creation_time).to.be.a('number');
    expect(incomingRequest.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight =
      incomingRequest.creation_block_height.split(':');
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    expect(incomingRequest.request_timeout).to.be.a('number');
  });

  it('IdP should get request_message_padded_hash successfully', async function () {
    this.timeout(15000);
    identityForResponse = db.idp2Identities.find(
      (identity) =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    responseAccessorId = identityForResponse.accessors[0].accessorId;
    let accessorPublicKey = identityForResponse.accessors[0].accessorPublicKey;

    const testResult = await getAndVerifyRequestMessagePaddedHashTest({
      callApiAtNodeId: 'idp2',
      idpNodeId: 'idp2',
      requestId,
      incomingRequestPromise,
      accessorPublicKey,
      accessorId: responseAccessorId,
    });
    requestMessagePaddedHash = testResult.verifyRequestMessagePaddedHash;
  });

  it('idp2 should create response (accept) successfully', async function () {
    this.timeout(15000);

    let accessorPrivateKey =
      identityForResponse.accessors[0].accessorPrivateKey;

    const signature = createResponseSignature(
      accessorPrivateKey,
      requestMessagePaddedHash
    );

    const response = await idpApi.createResponse('idp2', {
      reference_id: idpResponseReferenceId,
      callback_url: config.IDP2_CALLBACK_URL,
      request_id: requestId,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      accessor_id: responseAccessorId,
      signature,
    });
    expect(response.status).to.equal(202);
  });

  // it('IdP should receive accessor encrypt callback with correct data', async function() {
  //   this.timeout(15000);
  //   const identity = db.idp2Identities.find(
  //     identity =>
  //       identity.namespace === namespace && identity.identifier === identifier,
  //   );
  //   let accessorPublicKey = identity.accessors[0].accessorPublicKey;

  //   let testResult = await idpReceiveAccessorEncryptCallbackTest({
  //     callIdpApiAtNodeId: 'idp2',
  //     accessorEncryptPromise,
  //     accessorId: responseAccessorId,
  //     requestId,
  //     idpReferenceId: idpResponseReferenceId,
  //     incomingRequestPromise,
  //     accessorPublicKey,
  //   });
  //   requestMessagePaddedHash = testResult.verifyRequestMessagePaddedHash;
  // });

  it('IdP should receive callback create response result with success = true', async function () {
    const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      node_id: 'idp2',
      type: 'response_result',
      reference_id: idpResponseReferenceId,
      request_id: requestId,
      success: true,
    });
  });

  it('IdP (idp2) should receive message queue send success (To idp1) callback', async function () {
    this.timeout(15000);
    await receiveMessagequeueSendSuccessCallback({
      nodeId: 'idp2',
      requestId,
      mqSendSuccessCallbackPromise: mqSendSuccessIdp2ToIdp1CallbackPromise,
      destinationNodeId: 'idp1',
    });
  });

  it('Should verify IdP response signature successfully', async function () {
    this.timeout(15000);
    const identity = db.idp2Identities.find(
      (identity) =>
        identity.namespace === namespace && identity.identifier === identifier
    );
    let accessorPrivateKey = identity.accessors[0].accessorPrivateKey;

    await verifyResponseSignature({
      callApiAtNodeId: 'idp2',
      requestId,
      requestMessagePaddedHash,
      accessorPrivateKey,
    });
  });

  it('Identity should be upgraded mode successfully', async function () {
    this.timeout(20000);
    const upgradeIdentityModeResult =
      await upgradeIdentityModeResultPromise.promise;
    expect(upgradeIdentityModeResult).to.deep.include({
      reference_id: upgradeIdentityReferenceId,
      request_id: requestId,
      success: true,
    });

    const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
      namespace,
      identifier,
    });
    const idpNodes = await response.json();
    const idpNode = idpNodes.find((idpNode) => idpNode.node_id === 'idp1');
    expect(idpNode).to.not.be.undefined;
    expect(idpNodes).to.be.an('array').that.to.have.lengthOf(2);
    expect(idpNode.mode_list).to.be.an('array').that.include(2, 3);

    await wait(2000);
  });

  it('After upgrade identity mode IdP (idp2) that associated with this sid should receive identity notification callback', async function () {
    this.timeout(15000);
    const notificationUpgradeIdentityMode =
      await notificationUpgradeIdentityModePromise.promise;
    expect(notificationUpgradeIdentityMode).to.deep.include({
      node_id: 'idp2',
      type: 'identity_modification_notification',
      reference_group_code: referenceGroupCode,
      action: 'upgrade_identity_mode',
      actor_node_id: 'idp1',
    });
  });

  after(function () {
    idp1EventEmitter.removeAllListeners('callback');
    idp2EventEmitter.removeAllListeners('callback');
    idp2EventEmitter.removeAllListeners('accessor_encrypt_callback');
    nodeCallbackEventEmitter.removeAllListeners('callback');
  });

  describe('Create request with upgraded identity at idp1 (1 IdP, 1 AS, mode 3)', function () {
    const rpReferenceId = generateReferenceId();
    const idpReferenceId = generateReferenceId();
    const asReferenceId = generateReferenceId();

    const createRequestResultPromise = createEventPromise(); // RP
    const requestStatusPendingPromise = createEventPromise(); // RP
    const incomingRequestPromise = createEventPromise(); // IDP
    const idp2IncomingRequestPromise = createEventPromise();
    const responseResultPromise = createEventPromise(); // IDP
    const accessorEncryptPromise = createEventPromise(); // IDP
    const requestStatusConfirmedPromise = createEventPromise(); // RP
    const dataRequestReceivedPromise = createEventPromise(); // AS
    const sendDataResultPromise = createEventPromise(); // AS
    const requestStatusSignedDataPromise = createEventPromise(); // RP
    const requestStatusCompletedPromise = createEventPromise(); // RP
    const requestClosedPromise = createEventPromise(); // RP

    const idp_requestStatusPendingPromise = createEventPromise();
    const idp_requestStatusConfirmedPromise = createEventPromise();
    const idp_requestStatusSignedDataPromise = createEventPromise();
    const idp_requestStatusCompletedPromise = createEventPromise();
    const idp_requestClosedPromise = createEventPromise();

    const as_requestStatusConfirmedPromise = createEventPromise();
    const as_requestStatusSignedDataPromise = createEventPromise();
    const as_requestStatusCompletedPromise = createEventPromise();
    const as_requestClosedPromise = createEventPromise();

    const mqSendSuccessRpToIdpCallbackPromise = createEventPromise();
    const mqSendSuccessRpToIdp2CallbackPromise = createEventPromise();
    const mqSendSuccessRpToAsCallbackPromise = createEventPromise();
    const mqSendSuccessIdpToRpCallbackPromise = createEventPromise();
    const mqSendSuccessAsToRpCallbackPromise = createEventPromise();

    let createRequestParams;
    const data = JSON.stringify({
      test: 'test',
      withEscapedChar: 'test|fff||ss\\|NN\\\\|',
      arr: [1, 2, 3],
    });

    let requestId;
    let initialSalt;
    let responseAccessorId;
    let requestMessagePaddedHash;

    const requestStatusUpdates = [];
    const idp_requestStatusUpdates = [];
    const as_requestStatusUpdates = [];
    let lastStatusUpdateBlockHeight;

    let rp_node_id = 'rp1';
    let requester_node_id = 'rp1';
    let idp_node_id = 'idp1';
    let as_node_id = 'as1';
    let idpIdList;
    let dataRequestList;
    let idpResponseParams = [];
    let requestMessageHash;

    before(function () {
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
        request_message: 'Test request message (data request) (mode 2)',
        min_ial: 1.1,
        min_aal: 1,
        min_idp: 1,
        request_timeout: 86400,
        bypass_identity_check: false,
      };

      rpEventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'create_request_result' &&
          callbackData.reference_id === rpReferenceId
        ) {
          createRequestResultPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'request_status' &&
          callbackData.request_id === requestId
        ) {
          requestStatusUpdates.push(callbackData);
          if (callbackData.status === 'pending') {
            requestStatusPendingPromise.resolve(callbackData);
          } else if (callbackData.status === 'confirmed') {
            if (callbackData.data_request_list[0].response_list.length > 0) {
              if (callbackData.data_request_list[0].response_list[0].signed) {
                requestStatusSignedDataPromise.resolve(callbackData);
              }
            } else {
              requestStatusConfirmedPromise.resolve(callbackData);
            }
          } else if (callbackData.status === 'completed') {
            if (callbackData.closed) {
              requestClosedPromise.resolve(callbackData);
            } else {
              requestStatusCompletedPromise.resolve(callbackData);
            }
          }
        }
      });

      idp1EventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'incoming_request' &&
          callbackData.request_id === requestId
        ) {
          incomingRequestPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'response_result' &&
          callbackData.reference_id === idpReferenceId
        ) {
          responseResultPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'request_status' &&
          callbackData.request_id === requestId
        ) {
          idp_requestStatusUpdates.push(callbackData);
          if (callbackData.status === 'pending') {
            idp_requestStatusPendingPromise.resolve(callbackData);
          } else if (callbackData.status === 'confirmed') {
            if (callbackData.data_request_list[0].response_list.length > 0) {
              if (callbackData.data_request_list[0].response_list[0].signed) {
                idp_requestStatusSignedDataPromise.resolve(callbackData);
              }
            } else {
              idp_requestStatusConfirmedPromise.resolve(callbackData);
            }
          } else if (callbackData.status === 'completed') {
            if (callbackData.closed) {
              idp_requestClosedPromise.resolve(callbackData);
            } else {
              idp_requestStatusCompletedPromise.resolve(callbackData);
            }
          }
        }
      });

      idp1EventEmitter.on('accessor_encrypt_callback', function (callbackData) {
        if (callbackData.request_id === requestId) {
          accessorEncryptPromise.resolve(callbackData);
        }
      });

      idp2EventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'incoming_request' &&
          callbackData.request_id === requestId
        ) {
          idp2IncomingRequestPromise.resolve(callbackData);
        }
      });

      as1EventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'data_request' &&
          callbackData.request_id === requestId
        ) {
          dataRequestReceivedPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'response_result' &&
          callbackData.reference_id === asReferenceId
        ) {
          sendDataResultPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'request_status' &&
          callbackData.request_id === requestId
        ) {
          as_requestStatusUpdates.push(callbackData);
          if (callbackData.status === 'confirmed') {
            if (callbackData.data_request_list[0].response_list.length > 0) {
              if (callbackData.data_request_list[0].response_list[0].signed) {
                as_requestStatusSignedDataPromise.resolve(callbackData);
              }
            } else {
              as_requestStatusConfirmedPromise.resolve(callbackData);
            }
          } else if (callbackData.status === 'completed') {
            if (callbackData.closed) {
              as_requestClosedPromise.resolve(callbackData);
            } else {
              as_requestStatusCompletedPromise.resolve(callbackData);
            }
          }
        }
      });

      nodeCallbackEventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'message_queue_send_success' &&
          callbackData.request_id === requestId
        ) {
          if (callbackData.node_id === 'rp1') {
            if (callbackData.destination_node_id === 'idp1') {
              mqSendSuccessRpToIdpCallbackPromise.resolve(callbackData);
            } else if (callbackData.destination_node_id === 'idp2') {
              mqSendSuccessRpToIdp2CallbackPromise.resolve(callbackData);
            } else if (callbackData.destination_node_id === 'as1') {
              mqSendSuccessRpToAsCallbackPromise.resolve(callbackData);
            }
          } else if (callbackData.node_id === 'idp1') {
            if (callbackData.destination_node_id === 'rp1') {
              mqSendSuccessIdpToRpCallbackPromise.resolve(callbackData);
            }
          } else if (callbackData.node_id === 'as1') {
            if (callbackData.destination_node_id === 'rp1') {
              mqSendSuccessAsToRpCallbackPromise.resolve(callbackData);
            }
          }
        }
      });
    });

    it('RP should create a request successfully', async function () {
      this.timeout(10000);
      const response = await rpApi.createRequest('rp1', createRequestParams);
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
      expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

      requestId = responseBody.request_id;
      initialSalt = responseBody.initial_salt;

      const createRequestResult = await createRequestResultPromise.promise;
      expect(createRequestResult.success).to.equal(true);
      expect(createRequestResult.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight =
        createRequestResult.creation_block_height.split(':');
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
      lastStatusUpdateBlockHeight = parseInt(splittedCreationBlockHeight[1]);
    });

    it('RP should receive pending request status', async function () {
      this.timeout(30000);

      [idpIdList, dataRequestList, requestMessageHash] = await Promise.all([
        createIdpIdList({
          createRequestParams,
          callRpApiAtNodeId: rp_node_id,
        }),
        createDataRequestList({
          createRequestParams,
          requestId,
          initialSalt,
          callRpApiAtNodeId: rp_node_id,
        }),
        createRequestMessageHash({
          createRequestParams,
          initialSalt,
        }),
      ]); // create idp_id_list, as_id_list, request_message_hash for test

      await receivePendingRequestStatusTest({
        nodeId: rp_node_id,
        createRequestParams,
        requestId,
        idpIdList,
        dataRequestList,
        requestMessageHash,
        lastStatusUpdateBlockHeight,
        requestStatusPendingPromise,
        requesterNodeId: rp_node_id,
      });

      // const requestStatus = await requestStatusPendingPromise.promise;
      // expect(requestStatus).to.deep.include({
      //   request_id: requestId,
      //   status: 'pending',
      //   mode: createRequestParams.mode,
      //   min_idp: createRequestParams.min_idp,
      //   answered_idp_count: 0,
      //   closed: false,
      //   timed_out: false,
      //   service_list: [
      //     {
      //       service_id: createRequestParams.data_request_list[0].service_id,
      //       min_as: createRequestParams.data_request_list[0].min_as,
      //       signed_data_count: 0,
      //       received_data_count: 0,
      //     },
      //   ],
      //   response_valid_list: [],
      // });
      // expect(requestStatus).to.have.property('block_height');
      // expect(requestStatus.block_height).is.a('string');
      // const splittedBlockHeight = requestStatus.block_height.split(':');
      // expect(splittedBlockHeight).to.have.lengthOf(2);
      // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
      // expect(parseInt(splittedBlockHeight[1])).to.equal(
      //   lastStatusUpdateBlockHeight,
      // );
      // lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
    });

    it('RP should receive message queue send success (To idp1) callback', async function () {
      this.timeout(15000);
      await receiveMessagequeueSendSuccessCallback({
        nodeId: 'rp1',
        requestId,
        mqSendSuccessCallbackPromise: mqSendSuccessRpToIdpCallbackPromise,
        destinationNodeId: 'idp1',
      });
    });

    it('RP should receive message queue send success (To idp2) callback', async function () {
      this.timeout(15000);
      await receiveMessagequeueSendSuccessCallback({
        nodeId: 'rp1',
        requestId,
        mqSendSuccessCallbackPromise: mqSendSuccessRpToIdp2CallbackPromise,
        destinationNodeId: 'idp2',
      });
    });

    it('idp1 should receive incoming request callback', async function () {
      this.timeout(15000);
      const incomingRequest = await incomingRequestPromise.promise;

      const dataRequestListWithoutParams =
        createRequestParams.data_request_list.map((dataRequest) => {
          const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
          return {
            ...dataRequestWithoutParams,
          };
        });
      expect(incomingRequest).to.deep.include({
        node_id: 'idp1',
        type: 'incoming_request',
        mode: createRequestParams.mode,
        request_id: requestId,
        request_message: createRequestParams.request_message,
        request_message_hash: hash(
          createRequestParams.request_message +
            incomingRequest.request_message_salt
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
      const splittedCreationBlockHeight =
        incomingRequest.creation_block_height.split(':');
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('idp2 should receive incoming request callback', async function () {
      this.timeout(15000);
      const incomingRequest = await idp2IncomingRequestPromise.promise;

      const dataRequestListWithoutParams =
        createRequestParams.data_request_list.map((dataRequest) => {
          const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
          return {
            ...dataRequestWithoutParams,
          };
        });
      expect(incomingRequest).to.deep.include({
        node_id: 'idp2',
        type: 'incoming_request',
        mode: createRequestParams.mode,
        request_id: requestId,
        request_message: createRequestParams.request_message,
        request_message_hash: hash(
          createRequestParams.request_message +
            incomingRequest.request_message_salt
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
      const splittedCreationBlockHeight =
        incomingRequest.creation_block_height.split(':');
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('IdP should get request_message_padded_hash successfully', async function () {
      this.timeout(15000);
      identityForResponse = db.idp1Identities.find(
        (identity) =>
          identity.namespace === namespace && identity.identifier === identifier
      );

      responseAccessorId = identityForResponse.accessors[0].accessorId;
      let accessorPublicKey =
        identityForResponse.accessors[0].accessorPublicKey;

      const testResult = await getAndVerifyRequestMessagePaddedHashTest({
        callApiAtNodeId: 'idp1',
        idpNodeId: 'idp1',
        requestId,
        incomingRequestPromise,
        accessorPublicKey,
        accessorId: responseAccessorId,
      });
      requestMessagePaddedHash = testResult.verifyRequestMessagePaddedHash;
    });

    it('IdP should create response (accept) successfully', async function () {
      this.timeout(10000);

      let accessorPrivateKey =
        identityForResponse.accessors[0].accessorPrivateKey;

      const signature = createResponseSignature(
        accessorPrivateKey,
        requestMessagePaddedHash
      );

      let idpResponse = {
        reference_id: idpReferenceId,
        callback_url: config.IDP1_CALLBACK_URL,
        request_id: requestId,
        ial: 2.3,
        aal: 3,
        status: 'accept',
        accessor_id: responseAccessorId,
        signature,
      };

      idpResponseParams.push({
        ...idpResponse,
        idp_id: 'idp1',
        valid_signature: true,
        valid_ial: true,
      });

      const response = await idpApi.createResponse('idp1', idpResponse);
      expect(response.status).to.equal(202);
    });

    // it('IdP should receive accessor encrypt callback with correct data', async function() {
    //   this.timeout(15000);
    //   const identity = db.idp1Identities.find(
    //     identity =>
    //       identity.namespace === namespace &&
    //       identity.identifier === identifier,
    //   );

    //   let accessorPublicKey = identity.accessors[0].accessorPublicKey;

    //   let testResult = await idpReceiveAccessorEncryptCallbackTest({
    //     callIdpApiAtNodeId: 'idp1',
    //     accessorEncryptPromise,
    //     accessorId: responseAccessorId,
    //     requestId,
    //     idpReferenceId: idpReferenceId,
    //     incomingRequestPromise,
    //     accessorPublicKey,
    //   });
    //   requestMessagePaddedHash = testResult.verifyRequestMessagePaddedHash;
    // });

    it('IdP should receive callback create response result with success = true', async function () {
      const responseResult = await responseResultPromise.promise;
      expect(responseResult).to.deep.include({
        node_id: 'idp1',
        type: 'response_result',
        reference_id: idpReferenceId,
        request_id: requestId,
        success: true,
      });
    });

    it('IdP (idp1) should receive message queue send success (To rp1) callback', async function () {
      this.timeout(15000);
      await receiveMessagequeueSendSuccessCallback({
        nodeId: 'idp1',
        requestId,
        mqSendSuccessCallbackPromise: mqSendSuccessIdpToRpCallbackPromise,
        destinationNodeId: 'rp1',
      });
    });

    it('Should verify IdP response signature successfully', async function () {
      this.timeout(15000);
      const identity = db.idp1Identities.find(
        (identity) =>
          identity.namespace === namespace && identity.identifier === identifier
      );

      let accessorPrivateKey = identity.accessors[0].accessorPrivateKey;

      await verifyResponseSignature({
        callApiAtNodeId: 'idp1',
        requestId,
        requestMessagePaddedHash,
        accessorPrivateKey,
      });
    });

    it('RP should receive confirmed request status with valid proofs', async function () {
      this.timeout(15000);

      await receiveConfirmedRequestStatusTest({
        nodeId: rp_node_id,
        requestStatusConfirmedPromise,
        requestId,
        createRequestParams,
        dataRequestList,
        idpResponse: idpResponseParams,
        requestMessageHash,
        idpIdList,
        lastStatusUpdateBlockHeight,
        requesterNodeId: requester_node_id,
      });

      // const requestStatus = await requestStatusConfirmedPromise.promise;
      // expect(requestStatus).to.deep.include({
      //   request_id: requestId,
      //   status: 'confirmed',
      //   mode: createRequestParams.mode,
      //   min_idp: createRequestParams.min_idp,
      //   answered_idp_count: 1,
      //   closed: false,
      //   timed_out: false,
      //   service_list: [
      //     {
      //       service_id: createRequestParams.data_request_list[0].service_id,
      //       min_as: createRequestParams.data_request_list[0].min_as,
      //       signed_data_count: 0,
      //       received_data_count: 0,
      //     },
      //   ],
      //   response_valid_list: [
      //     {
      //       idp_id: 'idp1',
      //       valid_signature: true,
      //       valid_ial: true,
      //     },
      //   ],
      // });
      // expect(requestStatus).to.have.property('block_height');
      // expect(requestStatus.block_height).is.a('string');
      // const splittedBlockHeight = requestStatus.block_height.split(':');
      // expect(splittedBlockHeight).to.have.lengthOf(2);
      // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
      // expect(parseInt(splittedBlockHeight[1])).to.be.above(
      //   lastStatusUpdateBlockHeight,
      // );
      // lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
    });

    it('RP should receive message queue send success (To as1) callback', async function () {
      this.timeout(15000);
      await receiveMessagequeueSendSuccessCallback({
        nodeId: 'rp1',
        requestId,
        mqSendSuccessCallbackPromise: mqSendSuccessRpToAsCallbackPromise,
        destinationNodeId: 'as1',
      });
    });

    it('AS should receive data request', async function () {
      this.timeout(15000);
      const dataRequest = await dataRequestReceivedPromise.promise;
      expect(dataRequest).to.deep.include({
        type: 'data_request',
        request_id: requestId,
        mode: createRequestParams.mode,
        namespace,
        identifier,
        service_id: createRequestParams.data_request_list[0].service_id,
        request_params: createRequestParams.data_request_list[0].request_params,
        requester_node_id: 'rp1',
        max_ial: 2.3,
        max_aal: 3,

        request_timeout: createRequestParams.request_timeout,
      });
      expect(dataRequest.response_signature_list).to.have.lengthOf(1);
      expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is
        .not.empty;
      expect(dataRequest.creation_time).to.be.a('number');
      expect(dataRequest.creation_block_height).to.be.a('string');
      const splittedCreationBlockHeight =
        dataRequest.creation_block_height.split(':');
      expect(splittedCreationBlockHeight).to.have.lengthOf(2);
      expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
      expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    });

    it('AS should send data successfully', async function () {
      this.timeout(15000);
      const response = await asApi.sendData('as1', {
        requestId,
        serviceId: createRequestParams.data_request_list[0].service_id,
        reference_id: asReferenceId,
        callback_url: config.AS1_CALLBACK_URL,
        data,
      });
      expect(response.status).to.equal(202);

      const sendDataResult = await sendDataResultPromise.promise;
      expect(sendDataResult).to.deep.include({
        node_id: 'as1',
        type: 'response_result',
        reference_id: asReferenceId,
        success: true,
      });

      dataRequestList = setDataSigned(
        dataRequestList,
        createRequestParams.data_request_list[0].service_id,
        'as1'
      );
    });

    it('AS (as1) should receive message queue send success (To rp1) callback', async function () {
      this.timeout(15000);
      await receiveMessagequeueSendSuccessCallback({
        nodeId: 'as1',
        requestId,
        mqSendSuccessCallbackPromise: mqSendSuccessAsToRpCallbackPromise,
        destinationNodeId: 'rp1',
      });
    });

    it('RP should receive request status with signed data', async function () {
      this.timeout(15000);

      await receiveConfirmedRequestStatusTest({
        nodeId: rp_node_id,
        requestStatusConfirmedPromise: requestStatusSignedDataPromise,
        requestId,
        createRequestParams,
        dataRequestList,
        idpResponse: idpResponseParams,
        requestMessageHash,
        idpIdList,
        lastStatusUpdateBlockHeight,
        requesterNodeId: requester_node_id,
      });

      // const requestStatus = await requestStatusSignedDataPromise.promise;
      // expect(requestStatus).to.deep.include({
      //   request_id: requestId,
      //   status: 'confirmed',
      //   mode: createRequestParams.mode,
      //   min_idp: createRequestParams.min_idp,
      //   answered_idp_count: 1,
      //   closed: false,
      //   timed_out: false,
      //   service_list: [
      //     {
      //       service_id: createRequestParams.data_request_list[0].service_id,
      //       min_as: createRequestParams.data_request_list[0].min_as,
      //       signed_data_count: 1,
      //       received_data_count: 0,
      //     },
      //   ],
      //   response_valid_list: [
      //     {
      //       idp_id: 'idp1',
      //       valid_signature: true,
      //       valid_ial: true,
      //     },
      //   ],
      // });
      // expect(requestStatus).to.have.property('block_height');
      // expect(requestStatus.block_height).is.a('string');
      // const splittedBlockHeight = requestStatus.block_height.split(':');
      // expect(splittedBlockHeight).to.have.lengthOf(2);
      // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
      // expect(parseInt(splittedBlockHeight[1])).to.be.above(
      //   lastStatusUpdateBlockHeight,
      // );
      // lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
    });

    it('IdP should receive request status with signed data', async function () {
      this.timeout(15000);

      await receiveConfirmedRequestStatusTest({
        nodeId: idp_node_id,
        requestStatusConfirmedPromise: idp_requestStatusSignedDataPromise,
        requestId,
        createRequestParams,
        dataRequestList,
        idpResponse: idpResponseParams,
        requestMessageHash,
        idpIdList,
        lastStatusUpdateBlockHeight,
        requesterNodeId: requester_node_id,
        isNotRp: true,
      });

      // const requestStatus = await idp_requestStatusSignedDataPromise.promise;
      // expect(requestStatus).to.deep.include({
      //   request_id: requestId,
      //   status: 'confirmed',
      //   mode: createRequestParams.mode,
      //   min_idp: createRequestParams.min_idp,
      //   answered_idp_count: 1,
      //   closed: false,
      //   timed_out: false,
      //   service_list: [
      //     {
      //       service_id: createRequestParams.data_request_list[0].service_id,
      //       min_as: createRequestParams.data_request_list[0].min_as,
      //       signed_data_count: 1,
      //       received_data_count: 0,
      //     },
      //   ],
      //   response_valid_list: [
      //     {
      //       idp_id: 'idp1',
      //       valid_signature: null,
      //       valid_ial: null,
      //     },
      //   ],
      // });
      // expect(requestStatus).to.have.property('block_height');
      // expect(requestStatus.block_height).is.a('string');
      // const splittedBlockHeight = requestStatus.block_height.split(':');
      // expect(splittedBlockHeight).to.have.lengthOf(2);
      // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
      // expect(parseInt(splittedBlockHeight[1])).to.equal(
      //   lastStatusUpdateBlockHeight,
      // );
    });

    it('AS should receive request status with signed data', async function () {
      this.timeout(15000);

      await receiveConfirmedRequestStatusTest({
        nodeId: as_node_id,
        requestStatusConfirmedPromise: as_requestStatusSignedDataPromise,
        requestId,
        createRequestParams,
        dataRequestList,
        idpResponse: idpResponseParams,
        requestMessageHash,
        idpIdList,
        lastStatusUpdateBlockHeight,
        requesterNodeId: requester_node_id,
        isNotRp: true,
      });

      dataRequestList = setDataReceived(
        dataRequestList,
        createRequestParams.data_request_list[0].service_id,
        'as1'
      );

      // const requestStatus = await as_requestStatusSignedDataPromise.promise;
      // expect(requestStatus).to.deep.include({
      //   request_id: requestId,
      //   status: 'confirmed',
      //   mode: createRequestParams.mode,
      //   min_idp: createRequestParams.min_idp,
      //   answered_idp_count: 1,
      //   closed: false,
      //   timed_out: false,
      //   service_list: [
      //     {
      //       service_id: createRequestParams.data_request_list[0].service_id,
      //       min_as: createRequestParams.data_request_list[0].min_as,
      //       signed_data_count: 1,
      //       received_data_count: 0,
      //     },
      //   ],
      //   response_valid_list: [
      //     {
      //       idp_id: 'idp1',
      //       valid_signature: null,
      //       valid_ial: null,
      //     },
      //   ],
      // });
      // expect(requestStatus).to.have.property('block_height');
      // expect(requestStatus.block_height).is.a('string');
      // const splittedBlockHeight = requestStatus.block_height.split(':');
      // expect(splittedBlockHeight).to.have.lengthOf(2);
      // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
      // expect(parseInt(splittedBlockHeight[1])).to.equal(
      //   lastStatusUpdateBlockHeight,
      // );
    });

    it('RP should receive completed request status with received data', async function () {
      this.timeout(15000);

      await receiveCompletedRequestStatusTest({
        nodeId: rp_node_id,
        requestStatusCompletedPromise,
        requestId,
        createRequestParams,
        dataRequestList,
        idpResponse: idpResponseParams,
        requestMessageHash,
        idpIdList,
        lastStatusUpdateBlockHeight,
        requesterNodeId: requester_node_id,
      });

      // const requestStatus = await requestStatusCompletedPromise.promise;
      // expect(requestStatus).to.deep.include({
      //   request_id: requestId,
      //   status: 'completed',
      //   mode: createRequestParams.mode,
      //   min_idp: createRequestParams.min_idp,
      //   answered_idp_count: 1,
      //   closed: false,
      //   timed_out: false,
      //   service_list: [
      //     {
      //       service_id: createRequestParams.data_request_list[0].service_id,
      //       min_as: createRequestParams.data_request_list[0].min_as,
      //       signed_data_count: 1,
      //       received_data_count: 1,
      //     },
      //   ],
      //   response_valid_list: [
      //     {
      //       idp_id: 'idp1',
      //       valid_signature: true,
      //       valid_ial: true,
      //     },
      //   ],
      // });
      // expect(requestStatus).to.have.property('block_height');
      // expect(requestStatus.block_height).is.a('string');
      // const splittedBlockHeight = requestStatus.block_height.split(':');
      // expect(splittedBlockHeight).to.have.lengthOf(2);
      // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
      // expect(parseInt(splittedBlockHeight[1])).to.be.above(
      //   lastStatusUpdateBlockHeight,
      // );
      // lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
    });

    it('IdP should receive completed request status with received data', async function () {
      this.timeout(15000);

      await receiveCompletedRequestStatusTest({
        nodeId: idp_node_id,
        requestStatusCompletedPromise: idp_requestStatusCompletedPromise,
        requestId,
        createRequestParams,
        dataRequestList,
        idpResponse: idpResponseParams,
        requestMessageHash,
        idpIdList,
        lastStatusUpdateBlockHeight,
        requesterNodeId: requester_node_id,
        isNotRp: true,
      });

      // const requestStatus = await idp_requestStatusCompletedPromise.promise;
      // expect(requestStatus).to.deep.include({
      //   request_id: requestId,
      //   status: 'completed',
      //   mode: createRequestParams.mode,
      //   min_idp: createRequestParams.min_idp,
      //   answered_idp_count: 1,
      //   closed: false,
      //   timed_out: false,
      //   service_list: [
      //     {
      //       service_id: createRequestParams.data_request_list[0].service_id,
      //       min_as: createRequestParams.data_request_list[0].min_as,
      //       signed_data_count: 1,
      //       received_data_count: 1,
      //     },
      //   ],
      //   response_valid_list: [
      //     {
      //       idp_id: 'idp1',
      //       valid_signature: null,
      //       valid_ial: null,
      //     },
      //   ],
      // });
      // expect(requestStatus).to.have.property('block_height');
      // expect(requestStatus.block_height).is.a('string');
      // const splittedBlockHeight = requestStatus.block_height.split(':');
      // expect(splittedBlockHeight).to.have.lengthOf(2);
      // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
      // expect(parseInt(splittedBlockHeight[1])).to.equal(
      //   lastStatusUpdateBlockHeight,
      // );
    });

    it('AS should receive completed request status with received data', async function () {
      this.timeout(15000);

      await receiveCompletedRequestStatusTest({
        nodeId: as_node_id,
        requestStatusCompletedPromise: as_requestStatusCompletedPromise,
        requestId,
        createRequestParams,
        dataRequestList,
        idpResponse: idpResponseParams,
        requestMessageHash,
        idpIdList,
        lastStatusUpdateBlockHeight,
        requesterNodeId: requester_node_id,
        isNotRp: true,
      });

      // const requestStatus = await as_requestStatusCompletedPromise.promise;
      // expect(requestStatus).to.deep.include({
      //   request_id: requestId,
      //   status: 'completed',
      //   mode: createRequestParams.mode,
      //   min_idp: createRequestParams.min_idp,
      //   answered_idp_count: 1,
      //   closed: false,
      //   timed_out: false,
      //   service_list: [
      //     {
      //       service_id: createRequestParams.data_request_list[0].service_id,
      //       min_as: createRequestParams.data_request_list[0].min_as,
      //       signed_data_count: 1,
      //       received_data_count: 1,
      //     },
      //   ],
      //   response_valid_list: [
      //     {
      //       idp_id: 'idp1',
      //       valid_signature: null,
      //       valid_ial: null,
      //     },
      //   ],
      // });
      // expect(requestStatus).to.have.property('block_height');
      // expect(requestStatus.block_height).is.a('string');
      // const splittedBlockHeight = requestStatus.block_height.split(':');
      // expect(splittedBlockHeight).to.have.lengthOf(2);
      // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
      // expect(parseInt(splittedBlockHeight[1])).to.equal(
      //   lastStatusUpdateBlockHeight,
      // );
    });

    it('RP should receive request closed status', async function () {
      this.timeout(10000);

      await receiveRequestClosedStatusTest({
        nodeId: rp_node_id,
        requestClosedPromise,
        requestId,
        createRequestParams,
        dataRequestList,
        idpResponse: idpResponseParams,
        requestMessageHash,
        idpIdList,
        lastStatusUpdateBlockHeight,
        requesterNodeId: requester_node_id,
      });

      // const requestStatus = await requestClosedPromise.promise;
      // expect(requestStatus).to.deep.include({
      //   request_id: requestId,
      //   status: 'completed',
      //   mode: createRequestParams.mode,
      //   min_idp: createRequestParams.min_idp,
      //   answered_idp_count: 1,
      //   closed: true,
      //   timed_out: false,
      //   service_list: [
      //     {
      //       service_id: createRequestParams.data_request_list[0].service_id,
      //       min_as: createRequestParams.data_request_list[0].min_as,
      //       signed_data_count: 1,
      //       received_data_count: 1,
      //     },
      //   ],
      //   response_valid_list: [
      //     {
      //       idp_id: 'idp1',
      //       valid_signature: true,
      //       valid_ial: true,
      //     },
      //   ],
      // });
      // expect(requestStatus).to.have.property('block_height');
      // expect(requestStatus.block_height).is.a('string');
      // const splittedBlockHeight = requestStatus.block_height.split(':');
      // expect(splittedBlockHeight).to.have.lengthOf(2);
      // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
      // expect(parseInt(splittedBlockHeight[1])).to.be.above(
      //   lastStatusUpdateBlockHeight,
      // );
      // lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
    });

    it('IdP should receive request closed status', async function () {
      this.timeout(10000);

      await receiveRequestClosedStatusTest({
        nodeId: idp_node_id,
        requestClosedPromise: idp_requestClosedPromise,
        requestId,
        createRequestParams,
        dataRequestList,
        idpResponse: idpResponseParams,
        requestMessageHash,
        idpIdList,
        lastStatusUpdateBlockHeight,
        requesterNodeId: requester_node_id,
      });

      // const requestStatus = await idp_requestClosedPromise.promise;
      // expect(requestStatus).to.deep.include({
      //   request_id: requestId,
      //   status: 'completed',
      //   mode: createRequestParams.mode,
      //   min_idp: createRequestParams.min_idp,
      //   answered_idp_count: 1,
      //   closed: true,
      //   timed_out: false,
      //   service_list: [
      //     {
      //       service_id: createRequestParams.data_request_list[0].service_id,
      //       min_as: createRequestParams.data_request_list[0].min_as,
      //       signed_data_count: 1,
      //       received_data_count: 1,
      //     },
      //   ],
      //   response_valid_list: [
      //     {
      //       idp_id: 'idp1',
      //       valid_signature: true,

      //       valid_ial: true,
      //     },
      //   ],
      // });
      // expect(requestStatus).to.have.property('block_height');
      // expect(requestStatus.block_height).is.a('string');
      // const splittedBlockHeight = requestStatus.block_height.split(':');
      // expect(splittedBlockHeight).to.have.lengthOf(2);
      // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
      // expect(parseInt(splittedBlockHeight[1])).to.equal(
      //   lastStatusUpdateBlockHeight,
      // );
    });

    it('AS should receive request closed status', async function () {
      this.timeout(10000);

      await receiveRequestClosedStatusTest({
        nodeId: as_node_id,
        requestClosedPromise: as_requestClosedPromise,
        requestId,
        createRequestParams,
        dataRequestList,
        idpResponse: idpResponseParams,
        requestMessageHash,
        idpIdList,
        lastStatusUpdateBlockHeight,
        requesterNodeId: requester_node_id,
      });

      // const requestStatus = await as_requestClosedPromise.promise;
      // expect(requestStatus).to.deep.include({
      //   request_id: requestId,
      //   status: 'completed',
      //   mode: createRequestParams.mode,
      //   min_idp: createRequestParams.min_idp,
      //   answered_idp_count: 1,
      //   closed: true,
      //   timed_out: false,
      //   service_list: [
      //     {
      //       service_id: createRequestParams.data_request_list[0].service_id,
      //       min_as: createRequestParams.data_request_list[0].min_as,
      //       signed_data_count: 1,
      //       received_data_count: 1,
      //     },
      //   ],
      //   response_valid_list: [
      //     {
      //       idp_id: 'idp1',
      //       valid_signature: true,

      //       valid_ial: true,
      //     },
      //   ],
      // });
      // expect(requestStatus).to.have.property('block_height');
      // expect(requestStatus.block_height).is.a('string');
      // const splittedBlockHeight = requestStatus.block_height.split(':');
      // expect(splittedBlockHeight).to.have.lengthOf(2);
      // expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
      // expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
      // expect(parseInt(splittedBlockHeight[1])).to.equal(
      //   lastStatusUpdateBlockHeight,
      // );
    });

    it('RP should get the correct data received from AS', async function () {
      const response = await rpApi.getDataFromAS('rp1', {
        requestId,
      });
      const dataArr = await response.json();
      expect(response.status).to.equal(200);

      expect(dataArr).to.have.lengthOf(1);
      expect(dataArr[0]).to.deep.include({
        source_node_id: 'as1',
        service_id: createRequestParams.data_request_list[0].service_id,
        signature_sign_method: 'RSA-SHA256',
        data,
      });
      expect(dataArr[0].source_signature).to.be.a('string').that.is.not.empty;
      expect(dataArr[0].data_salt).to.be.a('string').that.is.not.empty;
    });

    it('RP should receive 5 request status updates', function () {
      expect(requestStatusUpdates).to.have.lengthOf(5);
    });

    it('IdP should receive 4 or 5 request status updates', function () {
      expect(idp_requestStatusUpdates).to.have.length.within(4, 5);
    });

    it('AS should receive 3 or 4 request status updates', function () {
      expect(as_requestStatusUpdates).to.have.length.within(3, 4);
    });

    it('RP should remove data requested from AS successfully', async function () {
      const response = await rpApi.removeDataRequestedFromAS('rp1', {
        request_id: requestId,
      });
      expect(response.status).to.equal(204);
    });

    it('RP should have no saved data requested from AS left after removal', async function () {
      const response = await rpApi.getDataFromAS('rp1', {
        requestId,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.be.an('array').that.is.empty;
    });

    it('RP should have and able to get saved private messages', async function () {
      const response = await commonApi.getPrivateMessages('rp1', {
        request_id: requestId,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.be.an('array').that.is.not.empty;
    });

    it('RP should remove saved private messages successfully', async function () {
      const response = await commonApi.removePrivateMessages('rp1', {
        request_id: requestId,
      });
      expect(response.status).to.equal(204);
    });

    it('RP should have no saved private messages left after removal', async function () {
      const response = await commonApi.getPrivateMessages('rp1', {
        request_id: requestId,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.be.an('array').that.is.empty;
    });

    it('IdP should have and able to get saved private messages', async function () {
      const response = await commonApi.getPrivateMessages('idp1', {
        request_id: requestId,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.be.an('array').that.is.not.empty;
    });

    it('IdP should remove saved private messages successfully', async function () {
      const response = await commonApi.removePrivateMessages('idp1', {
        request_id: requestId,
      });
      expect(response.status).to.equal(204);
    });

    it('IdP should have no saved private messages left after removal', async function () {
      const response = await commonApi.getPrivateMessages('idp1', {
        request_id: requestId,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.be.an('array').that.is.empty;
    });

    it('AS should have and able to get saved private messages', async function () {
      const response = await commonApi.getPrivateMessages('as1', {
        request_id: requestId,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.be.an('array').that.is.not.empty;
    });

    it('AS should remove saved private messages successfully', async function () {
      const response = await commonApi.removePrivateMessages('as1', {
        request_id: requestId,
      });
      expect(response.status).to.equal(204);
    });

    it('AS should have no saved private messages left after removal', async function () {
      const response = await commonApi.getPrivateMessages('as1', {
        request_id: requestId,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.be.an('array').that.is.empty;
    });

    after(function () {
      let identityIndex = db.idp1Identities.findIndex(
        (identity) =>
          identity.namespace === namespace && identity.identifier === identifier
      );
      db.idp1Identities.splice(identityIndex, 1);
      identityIndex = db.idp2Identities.findIndex(
        (identity) =>
          identity.namespace === namespace && identity.identifier === identifier
      );
      db.idp2Identities.splice(identityIndex, 1);
      rpEventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
      idp2EventEmitter.removeAllListeners('callback');
      as1EventEmitter.removeAllListeners('callback');
      nodeCallbackEventEmitter.removeAllListeners('callback');
    });
  });
});
