import crypto from 'crypto';
import { expect } from 'chai';
import fs from 'fs';
import path from 'path';
import uuidv4 from 'uuid/v4';

import * as rpApi from '../../../api/v5/rp';
import * as idpApi from '../../../api/v5/idp';
import * as asApi from '../../../api/v5/as';
import * as identityApi from '../../../api/v5/identity';
import {
  ndidEventEmitter,
  rpEventEmitter,
  idp1EventEmitter,
  as1EventEmitter,
} from '../../../callback_server';
import * as nodeApi from '../../../api/v5/node';
import * as commonApi from '../../../api/v5/common';
import {
  createEventPromise,
  generateReferenceId,
  wait,
  createSignature,
  hash,
  createResponseSignature,
} from '../../../utils';
import {
  createIdpIdList,
  createDataRequestList,
  createRequestMessageHash,
  setDataReceived,
  setDataSigned,
} from '../_fragments/fragments_utils';
import {
  receivePendingRequestStatusTest,
  receiveConfirmedRequestStatusTest,
  receiveCompletedRequestStatusTest,
  receiveRequestClosedStatusTest,
} from '../_fragments/common';
import { ndidAvailable } from '../..';
import * as db from '../../../db';
import * as config from '../../../config';
import { getAndVerifyRequestMessagePaddedHashTest } from '../_fragments/request_flow_fragments/idp';

describe("Update nodes's DPKI test", function () {
  const keypair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const privateKey = keypair.privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  });
  const publicKey = keypair.publicKey.export({
    type: 'spki',
    format: 'pem',
  });

  const masterKeypair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const masterPrivateKey = masterKeypair.privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  });
  const masterPublicKey = masterKeypair.publicKey.export({
    type: 'spki',
    format: 'pem',
  });

  const RPKeypair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const RPPrivKey = RPKeypair.privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  });
  const RPPubKey = RPKeypair.publicKey.export({
    type: 'spki',
    format: 'pem',
  });

  const IdPKeypair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const IdPPriveKey = IdPKeypair.privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  });
  const IdPPubKey = IdPKeypair.publicKey.export({
    type: 'spki',
    format: 'pem',
  });

  const ASKeypair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const ASPrivKey = ASKeypair.privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  });
  const ASPubKey = ASKeypair.publicKey.export({
    type: 'spki',
    format: 'pem',
  });

  const RPMasterKeypair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const RPMasterPrivKey = RPMasterKeypair.privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  });
  const RPMasterPubKey = RPMasterKeypair.publicKey.export({
    type: 'spki',
    format: 'pem',
  });

  const IdPMasterKeypair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const IdPMasterPrivKey = IdPMasterKeypair.privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  });
  const IdPMasterPubKey = IdPMasterKeypair.publicKey.export({
    type: 'spki',
    format: 'pem',
  });

  const ASMasterKeypair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const ASMasterPrivKey = ASMasterKeypair.privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  });
  const ASMasterPubKey = ASMasterKeypair.publicKey.export({
    type: 'spki',
    format: 'pem',
  });

  describe("NDID update nodes's DPKI test", function () {
    const NDIDUpdateNodeReferenceId = generateReferenceId();

    const NDIDUpdateNodeResultPromise = createEventPromise();

    let keyPath = path.join(__dirname, '..', '..', '..', '..', 'dev_key');

    ndidEventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'update_node_result' &&
        callbackData.reference_id === NDIDUpdateNodeReferenceId
      ) {
        NDIDUpdateNodeResultPromise.resolve(callbackData);
      }
    });

    before(function () {
      if (!ndidAvailable) {
        this.skip();
      }
    });

    it("NDID should update node's master key and public key with check_string, signed_check_string, master_signed_check_string successfully", async function () {
      this.timeout(15000);
      const check_string = 'NDID test update public key and master public key';
      const response = await nodeApi.updateNode('ndid1', {
        reference_id: NDIDUpdateNodeReferenceId,
        callback_url: config.NDID_CALLBACK_URL,
        node_key: publicKey,
        node_master_key: masterPublicKey,
        check_string,
        signed_check_string: createSignature(privateKey, check_string),
        master_signed_check_string: createSignature(
          masterPrivateKey,
          check_string,
        ),
      });
      expect(response.status).to.equal(202);

      const updateNodeResult = await NDIDUpdateNodeResultPromise.promise;
      expect(updateNodeResult.success).to.equal(true);

      let ndidPath = path.join(keyPath, 'ndid1');
      fs.writeFileSync(ndidPath, privateKey);
      fs.writeFileSync(ndidPath + '_master', masterPrivateKey);

      await wait(3000);
    });

    it("NDID node's master key and public key should be updated successfully", async function () {
      this.timeout(10000);
      const response = await commonApi.getNodeInfo('ndid1');
      const responseBody = await response.json();
      expect(responseBody.node_name).to.equal('NDID');
      expect(responseBody.role).to.equal('NDID');
      expect(responseBody.public_key).to.equal(publicKey);
      expect(responseBody.master_public_key).to.equal(masterPublicKey);
    });
  });

  describe("RP, IdP, AS update nodes's DPKI tests", function () {
    const RPUpdateNodeReferenceId = generateReferenceId();
    const IdPUpdateNodeReferenceId = generateReferenceId();
    const ASUpdateNodeReferenceId = generateReferenceId();
    const rpReferenceId = generateReferenceId();
    const idpReferenceId = generateReferenceId();
    const asReferenceId = generateReferenceId();

    const RPUpdateNodeResultPromise = createEventPromise();
    const IdPUpdateNodeResultPromise = createEventPromise();
    const ASUpdateNodeResultPromise = createEventPromise();
    const createRequestResultPromise = createEventPromise();
    const incomingRequestPromise = createEventPromise();
    const responseResultPromise = createEventPromise();
    const accessorEncryptPromise = createEventPromise();
    const dataRequestReceivedPromise = createEventPromise();
    const sendDataResultPromise = createEventPromise();
    const requestClosedPromise = createEventPromise();

    const userKeypair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const userPrivateKey = userKeypair.privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    });
    const userPublicKey = userKeypair.publicKey.export({
      type: 'spki',
      format: 'pem',
    });

    let referenceId = generateReferenceId();

    let createIdentityResultPromise = createEventPromise();

    let keyPath = path.join(__dirname, '..', '..', '..', '..', 'dev_key');

    let createRequestParams;
    let namespace = 'citizen_id';
    let identifier = uuidv4();
    let requestId;
    let requestMessageHash;
    let responseAccessorId;
    let accessorId;
    let referenceGroupCode;

    before(async function () {
      this.timeout(35000);

      rpEventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'update_node_result' &&
          callbackData.reference_id === RPUpdateNodeReferenceId
        ) {
          RPUpdateNodeResultPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'create_request_result' &&
          callbackData.reference_id === rpReferenceId
        ) {
          createRequestResultPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'request_status' &&
          callbackData.request_id === requestId
        ) {
          if (callbackData.status === 'completed') {
            if (callbackData.closed) {
              requestClosedPromise.resolve(callbackData);
            }
          }
        }
      });

      idp1EventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'update_node_result' &&
          callbackData.reference_id === IdPUpdateNodeReferenceId
        ) {
          IdPUpdateNodeResultPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'incoming_request' &&
          callbackData.request_id === requestId
        ) {
          incomingRequestPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'response_result' &&
          callbackData.reference_id === idpReferenceId
        ) {
          responseResultPromise.resolve(callbackData);
        }
        if (
          callbackData.type === 'create_identity_result' &&
          callbackData.reference_id === referenceId
        ) {
          createIdentityResultPromise.resolve(callbackData);
        }
      });

      idp1EventEmitter.on('accessor_encrypt_callback', function (callbackData) {
        if (callbackData.request_id === requestId) {
          accessorEncryptPromise.resolve(callbackData);
        }
      });

      as1EventEmitter.on('callback', function (callbackData) {
        if (
          callbackData.type === 'update_node_result' &&
          callbackData.reference_id === ASUpdateNodeReferenceId
        ) {
          ASUpdateNodeResultPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'data_request' &&
          callbackData.request_id === requestId
        ) {
          dataRequestReceivedPromise.resolve(callbackData);
        } else if (
          callbackData.type === 'response_result' &&
          callbackData.reference_id === asReferenceId
        ) {
          sendDataResultPromise.resolve(callbackData);
        }
      });
    });

    it("RP should update node's master key and public key with check_string, signed_check_string, master_signed_check_string successfully", async function () {
      this.timeout(30000);
      const check_string = 'RP test update public key and master public key';
      const response = await nodeApi.updateNode('rp1', {
        reference_id: RPUpdateNodeReferenceId,
        callback_url: config.RP_CALLBACK_URL,
        node_key: RPPubKey,
        node_master_key: RPMasterPubKey,
        check_string,
        signed_check_string: createSignature(RPPrivKey, check_string),
        master_signed_check_string: createSignature(
          RPMasterPrivKey,
          check_string,
        ),
      });
      expect(response.status).to.equal(202);

      const updateNodeResult = await RPUpdateNodeResultPromise.promise;
      expect(updateNodeResult.success).to.equal(true);

      let rpPath = path.join(keyPath, 'rp1');
      fs.writeFileSync(rpPath, RPPrivKey);
      fs.writeFileSync(rpPath + '_master', RPMasterPrivKey);

      await wait(3000);
    });

    it("RP node's master key and public key should be updated successfully", async function () {
      this.timeout(15000);
      const response = await commonApi.getNodeInfo('rp1');
      const responseBody = await response.json();
      expect(responseBody.role).to.equal('RP');
      expect(responseBody.public_key).to.equal(RPPubKey);
      expect(responseBody.master_public_key).to.equal(RPMasterPubKey);
    });

    it("IdP should update node's master key and public key with check_string, signed_check_string, master_signed_check_string successfully", async function () {
      this.timeout(30000);
      const check_string = 'IdP test update public key and master public key';
      const response = await nodeApi.updateNode('idp1', {
        reference_id: IdPUpdateNodeReferenceId,
        callback_url: config.IDP1_CALLBACK_URL,
        node_key: IdPPubKey,
        node_master_key: IdPMasterPubKey,
        check_string,
        signed_check_string: createSignature(IdPPriveKey, check_string),
        master_signed_check_string: createSignature(
          IdPMasterPrivKey,
          check_string,
        ),
      });
      expect(response.status).to.equal(202);

      const updateNodeResult = await IdPUpdateNodeResultPromise.promise;
      expect(updateNodeResult.success).to.equal(true);

      let idpPath = path.join(keyPath, 'idp1');
      fs.writeFileSync(idpPath, IdPPriveKey);
      fs.writeFileSync(idpPath + '_master', IdPMasterPrivKey);

      await wait(3000);
    });

    it("IdP node's master key and public key should be updated successfully", async function () {
      this.timeout(15000);
      const response = await commonApi.getNodeInfo('idp1');
      const responseBody = await response.json();
      expect(responseBody.role).to.equal('IdP');
      expect(responseBody.public_key).to.equal(IdPPubKey);
      expect(responseBody.master_public_key).to.equal(IdPMasterPubKey);
    });

    it("AS should update node's master key and public key with check_string, signed_check_string, master_signed_check_string successfully", async function () {
      this.timeout(30000);
      const check_string = 'AS test update public key and master public key';
      const response = await nodeApi.updateNode('as1', {
        reference_id: ASUpdateNodeReferenceId,
        callback_url: config.AS1_CALLBACK_URL,
        node_key: ASPubKey,
        node_master_key: ASMasterPubKey,
        check_string,
        signed_check_string: createSignature(ASPrivKey, check_string),
        master_signed_check_string: createSignature(
          ASMasterPrivKey,
          check_string,
        ),
      });
      expect(response.status).to.equal(202);

      const updateNodeResult = await ASUpdateNodeResultPromise.promise;
      expect(updateNodeResult.success).to.equal(true);

      let asPath = path.join(keyPath, 'as1');
      fs.writeFileSync(asPath, ASPrivKey);
      fs.writeFileSync(asPath + '_master', ASMasterPrivKey);

      await wait(3000);
    });

    it("AS node's master key and public key should be updated successfully", async function () {
      this.timeout(15000);
      const response = await commonApi.getNodeInfo('as1');
      const responseBody = await response.json();
      expect(responseBody.role).to.equal('AS');
      expect(responseBody.public_key).to.equal(ASPubKey);
      expect(responseBody.master_public_key).to.equal(ASMasterPubKey);
    });

    it('Should create identity request (mode 3) successfully', async function () {
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
        accessor_public_key: userPublicKey,
        //accessor_id,
        ial: 2.3,
        lial: false,
        laal: false,
        mode: 3,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
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
      expect(idpNode.mode_list).to.be.an('array').that.include(2, 3);

      db.idp1Identities.push({
        referenceGroupCode,
        mode: 3,
        namespace,
        identifier,
        accessors: [
          {
            accessorId,
            accessorPrivateKey: userPrivateKey,
            accessorPublicKey: userPublicKey,
          },
        ],
      });

      await wait(2000);
    });

    describe("Create request tests after update node's master key and public key ", function () {
      let identityForResponse;
      let responseAccessorId;
      let requestMessagePaddedHash;

      let lastStatusUpdateBlockHeight;
      let initialSalt;
      let rp_node_id = 'rp1';
      let requester_node_id = 'rp1';
      let as_node_id = 'as1';
      let idpIdList;
      let dataRequestList;
      let idpResponseParams = [];
      let requestMessageHash;

      before(function () {
        const identity = db.idp1Identities.find(
          (identity) =>
            identity.namespace === namespace &&
            identity.identifier === identifier,
        );

        if (!identity) {
          this.test.parent.pending = true;
          this.skip();
        }

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
          request_message:
            "Test request message (Test update node's master key and public key) (mode 3)",
          min_ial: 1.1,
          min_aal: 1,
          min_idp: 1,
          request_timeout: 86400,
          bypass_identity_check: false,
        };
      });
      it('RP should create a request successfully', async function () {
        this.timeout(30000);
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
        const splittedCreationBlockHeight = createRequestResult.creation_block_height.split(
          ':',
        );
        expect(splittedCreationBlockHeight).to.have.lengthOf(2);
        expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
        expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
        lastStatusUpdateBlockHeight = parseInt(splittedCreationBlockHeight[1]);

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
      });

      it('IdP should receive incoming request callback', async function () {
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

        requestMessageHash = incomingRequest.request_message_hash;
      });

      it('IdP should get request_message_padded_hash successfully', async function () {
        this.timeout(15000);
        identityForResponse = db.idp1Identities.find(
          (identity) =>
            identity.namespace === namespace &&
            identity.identifier === identifier,
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
        this.timeout(20000);

        let accessorPrivateKey =
          identityForResponse.accessors[0].accessorPrivateKey;

        const signature = createResponseSignature(
          accessorPrivateKey,
          requestMessagePaddedHash,
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

      //   const accessorEncryptParams = await accessorEncryptPromise.promise;
      //   expect(accessorEncryptParams).to.deep.include({
      //     node_id: 'idp1',
      //     type: 'accessor_encrypt',
      //     accessor_id: responseAccessorId,
      //     key_type: 'RSA',
      //     padding: 'none',
      //     reference_id: idpReferenceId,
      //     request_id: requestId,
      //   });

      //   expect(accessorEncryptParams.request_message_padded_hash).to.be.a(
      //     'string',
      //   ).that.is.not.empty;
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

      it('AS should receive data request', async function () {
        this.timeout(20000);
        const dataRequest = await dataRequestReceivedPromise.promise;
        expect(dataRequest).to.deep.include({
          request_id: requestId,
          mode: createRequestParams.mode,
          namespace,
          identifier,
          service_id: createRequestParams.data_request_list[0].service_id,
          request_params:
            createRequestParams.data_request_list[0].request_params,
          max_ial: 2.3,
          max_aal: 3,
          requester_node_id: 'rp1',
        });
        expect(dataRequest.response_signature_list).to.have.lengthOf(1);
        expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is
          .not.empty;
      });

      it('AS should send data successfully', async function () {
        this.timeout(20000);
        const response = await asApi.sendData('as1', {
          requestId,
          serviceId: createRequestParams.data_request_list[0].service_id,
          reference_id: asReferenceId,
          callback_url: config.AS1_CALLBACK_URL,
          data: "Test update node's master key and public key",
        });
        expect(response.status).to.equal(202);

        const sendDataResult = await sendDataResultPromise.promise;
        expect(sendDataResult).to.deep.include({
          reference_id: asReferenceId,
          success: true,
        });

        dataRequestList = setDataSigned(
          dataRequestList,
          createRequestParams.data_request_list[0].service_id,
          as_node_id,
        );

        dataRequestList = setDataReceived(
          dataRequestList,
          createRequestParams.data_request_list[0].service_id,
          as_node_id,
        );
      });

      it('RP should receive request closed status', async function () {
        this.timeout(25000);

        const testResult = await receiveRequestClosedStatusTest({
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
        lastStatusUpdateBlockHeight = testResult.lastStatusUpdateBlockHeight;

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
      });
    });
    after(function () {
      rpEventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('callback');
      idp1EventEmitter.removeAllListeners('accessor_encrypt_callback');
      as1EventEmitter.removeAllListeners('callback');
    });
  });

  describe("Update node's DPKI error response tests", function () {
    const RPUpdateNodeReferenceId = generateReferenceId();

    it("RP should get an error when update node's public key with signed check string mismatched", async function () {
      this.timeout(30000);
      const check_string = 'RP test update public key';
      const response = await nodeApi.updateNode('rp1', {
        reference_id: RPUpdateNodeReferenceId,
        callback_url: config.RP_CALLBACK_URL,
        node_key: RPPubKey,
        check_string,
        signed_check_string: createSignature(RPPrivKey, 'invalid check_string'),
      });
      expect(response.status).to.equal(400);
      const responseBody = await response.json();
      expect(responseBody.error.code).to.equal(20063);
    });

    it("RP should get an error when update node's public key with master signed check string mismatched", async function () {
      this.timeout(30000);
      const check_string = 'RP test update master public key';
      const response = await nodeApi.updateNode('rp1', {
        reference_id: RPUpdateNodeReferenceId,
        callback_url: config.RP_CALLBACK_URL,
        node_master_key: RPMasterPubKey,
        check_string,
        master_signed_check_string: createSignature(
          RPMasterPrivKey,
          'invalid check_string',
        ),
      });
      expect(response.status).to.equal(400);
      const responseBody = await response.json();
      expect(responseBody.error.code).to.equal(20064);
    });
  });
});

describe('Update node without any of property node_key or node_master_key or supported_request_message_data_url_type_list tests', function () {
  const rpUpdateNodeReferenceId = generateReferenceId();
  const idpUpdateNodeReferenceId = generateReferenceId();
  const asUpdateNodeReferenceId = generateReferenceId();

  it('RP should get an error when update node  without any of property node_key or node_master_key or supported_request_message_data_url_type_list', async function () {
    this.timeout(10000);

    const response = await nodeApi.updateNode('rp1', {
      reference_id: rpUpdateNodeReferenceId,
      callback_url: config.RP_CALLBACK_URL,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20003);
  });

  it('IDP should get an error when update node  without any of property node_key or node_master_key or supported_request_message_data_url_type_list', async function () {
    this.timeout(10000);

    const response = await nodeApi.updateNode('idp1', {
      reference_id: idpUpdateNodeReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20003);
  });

  it('AS should get an error when update node  without any of property node_key or node_master_key or supported_request_message_data_url_type_list', async function () {
    this.timeout(10000);

    const response = await nodeApi.updateNode('as1', {
      reference_id: asUpdateNodeReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20003);
  });
});

describe('Update node supported request message types only IdP node tests', function () {
  const rpUpdateNodeReferenceId = generateReferenceId();
  const asUpdateNodeReferenceId = generateReferenceId();
  const IdPUpdateNodeReferenceId = generateReferenceId();

  const IdPUpdateNodeResultPromise = createEventPromise();

  let before_test_supported_request_message_data_url_type_list;

  before(async function () {
    this.timeout(15000);
    idp1EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'update_node_result' &&
        callbackData.reference_id === IdPUpdateNodeReferenceId
      ) {
        IdPUpdateNodeResultPromise.resolve(callbackData);
      }
    });

    let response = await commonApi.getIdP('idp1');
    let responseBody = await response.json();
    let idpNodeDetail = responseBody.find((idp) => idp.node_id === 'idp1');
    before_test_supported_request_message_data_url_type_list =
      idpNodeDetail.supported_request_message_data_url_type_list;
  });

  it('IdP should update node supported request message types successfully', async function () {
    this.timeout(10000);

    const response = await nodeApi.updateNode('idp1', {
      reference_id: IdPUpdateNodeReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      supported_request_message_data_url_type_list: [
        'application/pdf',
        'text/plain',
      ],
    });
    expect(response.status).to.equal(202);

    const IdPUpdateNodeResult = await IdPUpdateNodeResultPromise.promise;
    expect(IdPUpdateNodeResult).to.deep.include({
      node_id: 'idp1',
      reference_id: IdPUpdateNodeReferenceId,
      success: true,
    });
  });

  it('IdP should get idp node detail successfully', async function () {
    this.timeout(10000);

    let response = await commonApi.getIdP('idp1');
    let responseBody = await response.json();
    let idpNodeDetail = responseBody.find((idp) => idp.node_id === 'idp1');
    expect(idpNodeDetail.supported_request_message_data_url_type_list)
      .to.be.an('array')
      .to.have.length(2)
      .to.includes('application/pdf', 'text/plain');
  });

  it('RP should get an error when update node supported request message types', async function () {
    this.timeout(10000);

    const response = await nodeApi.updateNode('rp1', {
      reference_id: rpUpdateNodeReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      supported_request_message_data_url_type_list: ['application/pdf'],
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20072);
  });

  it('AS should get an error when update node supported request message types', async function () {
    this.timeout(10000);

    const response = await nodeApi.updateNode('as1', {
      reference_id: asUpdateNodeReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      supported_request_message_data_url_type_list: ['application/pdf'],
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20072);
  });

  after(async function () {
    this.timeout(15000);
    const response = await nodeApi.updateNode('idp1', {
      reference_id: IdPUpdateNodeReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      supported_request_message_data_url_type_list: before_test_supported_request_message_data_url_type_list,
    });
    expect(response.status).to.equal(202);

    idp1EventEmitter.removeAllListeners('callback');
  });
});
