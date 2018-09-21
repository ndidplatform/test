import { expect } from 'chai';
import forge from 'node-forge';
import fs from 'fs';
import path from 'path';

import * as rpApi from '../../api/v2/rp';
import * as idpApi from '../../api/v2/idp';
import * as asApi from '../../api/v2/as';
import {
  ndidEventEmitter,
  rpEventEmitter,
  idp1EventEmitter,
  as1EventEmitter,
} from '../../callback_server';
import * as dpkiApi from '../../api/v2/dpki';
import * as commonApi from '../../api/v2/common';
import {
  createEventPromise,
  generateReferenceId,
  hashRequestMessageForConsent,
  createResponseSignature,
  wait,
} from '../../utils';
import { ndidAvailable } from '..';
import * as db from '../../db';
import * as config from '../../config';

describe("NDID update nodes's DPKI test", function() {
  const keypair = forge.pki.rsa.generateKeyPair(2048);
  const privateKey = forge.pki.privateKeyToPem(keypair.privateKey);
  const publicKey = forge.pki.publicKeyToPem(keypair.publicKey);

  const masterKeypair = forge.pki.rsa.generateKeyPair(2048);
  const masterPrivateKey = forge.pki.privateKeyToPem(masterKeypair.privateKey);
  const masterPublicKey = forge.pki.publicKeyToPem(masterKeypair.publicKey);

  const NDIDUpdateNodeReferenceId = generateReferenceId();

  const NDIDUpdateNodeResultPromise = createEventPromise();

  let keyPath = path.join(__dirname, '..', '..', '..', 'dev_key');

  ndidEventEmitter.on('callback', function(callbackData) {
    if (
      callbackData.type === 'update_node_result' &&
      callbackData.reference_id === NDIDUpdateNodeReferenceId
    ) {
      NDIDUpdateNodeResultPromise.resolve(callbackData);
    }
  });

  before(function() {
    if (!ndidAvailable) {
      this.skip();
    }
  });

  it("NDID should update node's master key and public key successfully", async function() {
    this.timeout(15000);
    const response = await dpkiApi.updateNode('ndid1', {
      reference_id: NDIDUpdateNodeReferenceId,
      callback_url: config.NDID_CALLBACK_URL,
      node_key: publicKey,
      node_master_key: masterPublicKey,
    });
    expect(response.status).to.equal(202);

    const updateNodeResult = await NDIDUpdateNodeResultPromise.promise;
    expect(updateNodeResult.success).to.equal(true);

    let ndidPath = path.join(keyPath, 'ndid1');
    fs.writeFileSync(ndidPath, privateKey);
    fs.writeFileSync(ndidPath + '_master', masterPrivateKey);

    await wait(3000);
  });

  it("NDID node's master key and public key should be updated successfully", async function() {
    this.timeout(10000);
    const response = await commonApi.getNodeInfo('ndid1');
    const responseBody = await response.json();
    expect(responseBody.node_name).to.equal('NDID');
    expect(responseBody.role).to.equal('NDID');
    expect(responseBody.public_key).to.equal(publicKey);
    expect(responseBody.master_public_key).to.equal(masterPublicKey);
  });
});

describe("RP, IdP, AS update nodes's DPKI tests", function() {
  const RPKeypair = forge.pki.rsa.generateKeyPair(2048);
  const RPPrivKey = forge.pki.privateKeyToPem(RPKeypair.privateKey);
  const RPPubKey = forge.pki.publicKeyToPem(RPKeypair.publicKey);

  const IdPKeypair = forge.pki.rsa.generateKeyPair(2048);
  const IdPPriveKey = forge.pki.privateKeyToPem(IdPKeypair.privateKey);
  const IdPPubKey = forge.pki.publicKeyToPem(IdPKeypair.publicKey);

  const ASKeypair = forge.pki.rsa.generateKeyPair(2048);
  const ASPrivKey = forge.pki.privateKeyToPem(ASKeypair.privateKey);
  const ASPubKey = forge.pki.publicKeyToPem(ASKeypair.publicKey);

  const RPMasterKeypair = forge.pki.rsa.generateKeyPair(2048);
  const RPMasterPrivKey = forge.pki.privateKeyToPem(RPMasterKeypair.privateKey);
  const RPMasterPubKey = forge.pki.publicKeyToPem(RPMasterKeypair.publicKey);

  const IdPMasterKeypair = forge.pki.rsa.generateKeyPair(2048);
  const IdPMasterPrivKey = forge.pki.privateKeyToPem(
    IdPMasterKeypair.privateKey
  );
  const IdPMasterPubKey = forge.pki.publicKeyToPem(IdPMasterKeypair.publicKey);

  const ASMasterKeypair = forge.pki.rsa.generateKeyPair(2048);
  const ASMasterPrivKey = forge.pki.privateKeyToPem(ASMasterKeypair.privateKey);
  const ASMasterPubKey = forge.pki.publicKeyToPem(ASMasterKeypair.publicKey);

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
  const dataRequestReceivedPromise = createEventPromise();
  const sendDataResultPromise = createEventPromise();
  const requestClosedPromise = createEventPromise();

  let keyPath = path.join(__dirname, '..', '..', '..', 'dev_key');

  let createRequestParams;
  let namespace;
  let identifier;
  let requestId;
  let requestMessageHash;

  before(async function() {
    this.timeout(35000);

    if (db.idp1Identities[0] == null) {
      throw new Error('No created identity to use');
    }

    namespace = db.idp1Identities[0].namespace;
    identifier = db.idp1Identities[0].identifier;

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
    };

    rpEventEmitter.on('callback', function(callbackData) {
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

    idp1EventEmitter.on('callback', function(callbackData) {
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
    });

    as1EventEmitter.on('callback', function(callbackData) {
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
        callbackData.type === 'send_data_result' &&
        callbackData.reference_id === asReferenceId
      ) {
        sendDataResultPromise.resolve(callbackData);
      }
    });
  });

  it("RP should update node's master key and public key successfully", async function() {
    this.timeout(30000);
    const response = await dpkiApi.updateNode('rp1', {
      reference_id: RPUpdateNodeReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      node_key: RPPubKey,
      node_master_key: RPMasterPubKey,
    });
    expect(response.status).to.equal(202);

    const updateNodeResult = await RPUpdateNodeResultPromise.promise;
    expect(updateNodeResult.success).to.equal(true);

    let rpPath = path.join(keyPath, 'rp1');
    fs.writeFileSync(rpPath, RPPrivKey);
    fs.writeFileSync(rpPath + '_master', RPMasterPrivKey);

    await wait(3000);
  });

  it("RP node's master key and public key should be updated successfully", async function() {
    this.timeout(15000);
    const response = await commonApi.getNodeInfo('rp1');
    const responseBody = await response.json();
    expect(responseBody.role).to.equal('RP');
    expect(responseBody.public_key).to.equal(RPPubKey);
    expect(responseBody.master_public_key).to.equal(RPMasterPubKey);
  });

  it("IdP should update node's master key and public key successfully", async function() {
    this.timeout(30000);
    const response = await dpkiApi.updateNode('idp1', {
      reference_id: IdPUpdateNodeReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      node_key: IdPPubKey,
      node_master_key: IdPMasterPubKey,
    });
    expect(response.status).to.equal(202);

    const updateNodeResult = await IdPUpdateNodeResultPromise.promise;
    expect(updateNodeResult.success).to.equal(true);

    let idpPath = path.join(keyPath, 'idp1');
    fs.writeFileSync(idpPath, IdPPriveKey);
    fs.writeFileSync(idpPath + '_master', IdPMasterPrivKey);

    await wait(3000);
  });

  it("IdP node's master key and public key should be updated successfully", async function() {
    this.timeout(15000);
    const response = await commonApi.getNodeInfo('idp1');
    const responseBody = await response.json();
    expect(responseBody.role).to.equal('IdP');
    expect(responseBody.public_key).to.equal(IdPPubKey);
    expect(responseBody.master_public_key).to.equal(IdPMasterPubKey);
  });

  it("AS should update node's master key and public key successfully", async function() {
    this.timeout(30000);
    const response = await dpkiApi.updateNode('as1', {
      reference_id: ASUpdateNodeReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      node_key: ASPubKey,
      node_master_key: ASMasterPubKey,
    });
    expect(response.status).to.equal(202);

    const updateNodeResult = await ASUpdateNodeResultPromise.promise;
    expect(updateNodeResult.success).to.equal(true);

    let asPath = path.join(keyPath, 'as1');
    fs.writeFileSync(asPath, ASPrivKey);
    fs.writeFileSync(asPath + '_master', ASMasterPrivKey);

    await wait(3000);
  });

  it("AS node's master key and public key should be updated successfully", async function() {
    this.timeout(15000);
    const response = await commonApi.getNodeInfo('as1');
    const responseBody = await response.json();
    expect(responseBody.role).to.equal('AS');
    expect(responseBody.public_key).to.equal(ASPubKey);
    expect(responseBody.master_public_key).to.equal(ASMasterPubKey);
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
  });

  it('IdP should receive incoming request callback', async function() {
    this.timeout(15000);
    const incomingRequest = await incomingRequestPromise.promise;

    const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
      (dataRequest) => {
        const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
        return {
          ...dataRequestWithoutParams,
        };
      }
    );
    expect(incomingRequest).to.deep.include({
      mode: createRequestParams.mode,
      request_id: requestId,
      namespace: createRequestParams.namespace,
      identifier: createRequestParams.identifier,
      request_message: createRequestParams.request_message,
      request_message_hash: hashRequestMessageForConsent(
        createRequestParams.request_message,
        incomingRequest.initial_salt,
        requestId
      ),
      requester_node_id: 'rp1',
      min_ial: createRequestParams.min_ial,
      min_aal: createRequestParams.min_aal,
      data_request_list: dataRequestListWithoutParams,
    });
    expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
      .empty;
    expect(incomingRequest.creation_time).to.be.a('number');

    requestMessageHash = incomingRequest.request_message_hash;
  });

  it('IdP should create response (accept) successfully', async function() {
    this.timeout(20000);
    const identity = db.idp1Identities.find(
      (identity) =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    const response = await idpApi.createResponse('idp1', {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      namespace: createRequestParams.namespace,
      identifier: createRequestParams.identifier,
      ial: 2.3,
      aal: 3,
      secret: identity.accessors[0].secret,
      status: 'accept',
      signature: createResponseSignature(
        identity.accessors[0].accessorPrivateKey,
        requestMessageHash
      ),
      accessor_id: identity.accessors[0].accessorId,
    });
    expect(response.status).to.equal(202);

    const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      reference_id: idpReferenceId,
      request_id: requestId,
      success: true,
    });
  });

  it('AS should receive data request', async function() {
    this.timeout(20000);
    const dataRequest = await dataRequestReceivedPromise.promise;
    expect(dataRequest).to.deep.include({
      request_id: requestId,
      mode: createRequestParams.mode,
      namespace,
      identifier,
      service_id: createRequestParams.data_request_list[0].service_id,
      request_params: createRequestParams.data_request_list[0].request_params,
      max_ial: 2.3,
      max_aal: 3,
    });
    expect(dataRequest.response_signature_list).to.have.lengthOf(1);
    expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is.not
      .empty;
  });

  it('AS should send data successfully', async function() {
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
  });

  it('RP should receive request closed status', async function() {
    this.timeout(25000);
    const requestStatus = await requestClosedPromise.promise;
    expect(requestStatus).to.deep.include({
      request_id: requestId,
      status: 'completed',
      mode: createRequestParams.mode,
      min_idp: createRequestParams.min_idp,
      answered_idp_count: 1,
      closed: true,
      timed_out: false,
      service_list: [
        {
          service_id: createRequestParams.data_request_list[0].service_id,
          min_as: createRequestParams.data_request_list[0].min_as,
          signed_data_count: 1,
          received_data_count: 1,
        },
      ],
      response_valid_list: [
        {
          idp_id: 'idp1',
          valid_signature: true,
          valid_proof: true,
          valid_ial: true,
        },
      ],
    });
    expect(requestStatus).to.have.property('block_height');
    expect(requestStatus.block_height).is.a('number');
  });

  after(function() {
    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
    as1EventEmitter.removeAllListeners('callback');
  });
});
