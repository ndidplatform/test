import crypto from 'crypto';
import { expect } from 'chai';
import uuidv4 from 'uuid/v4';
import {
  generateReferenceId,
  createEventPromise,
  wait,
} from '../../../utils';
import {
  idp1EventEmitter,
  rpEventEmitter,
} from '../../../callback_server';

import * as config from '../../../config';
import * as rpApi from '../../../api/v5/rp';
import * as ndidApi from '../../../api/v5/ndid';
import * as commonApi from '../../../api/v5/common';
import * as identityApi from '../../../api/v5/identity';

describe('Create request with whitelist tests', function() {
  const createIdentityResultPromise = createEventPromise();
  const createRequestResultPromise = createEventPromise();

  const requestStatusPendingPromise = createEventPromise(); // RP
  const incomingRequestPromise = createEventPromise(); // IDP

  const rpReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();

  let requestId;
  let createRequestParams;

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


  let namespace = 'citizen_id';
  let identifier = uuidv4();

  before(async function() {
    this.timeout(10000);
    createRequestParams = (idp_id_list = []) => ({
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 3,
      namespace,
      identifier,
      idp_id_list,
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
    });

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
      if (
        callbackData.type === 'create_identity_result' &&
        callbackData.reference_id === idpReferenceId
      ) {
        createIdentityResultPromise.resolve(callbackData);
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

  it('Should fail to reach IdPs outside RP whitelist', async function() {
    this.timeout(30000);
    await ndidApi.updateNode('ndid1', {
      node_id: 'rp1',
      node_id_whitelist_active: true,
      node_id_whitelist: ['idp2'],
    });

    await ndidApi.updateNode('ndid1', {
      node_id: 'idp1',
      node_id_whitelist_active: true,
      node_id_whitelist: ['rp1'],
    });

    await wait(2000);
    
    const response = await rpApi.createRequest('rp1', createRequestParams(['idp1']));
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20079);
  });

  it('Should fail to reach IdP while not being in its whitelist', async function() {
    this.timeout(30000);
    await ndidApi.updateNode('ndid1', {
      node_id: 'rp1',
      node_id_whitelist_active: true,
      node_id_whitelist: ['idp1'],
    });

    await ndidApi.updateNode('ndid1', {
      node_id: 'idp1',
      node_id_whitelist_active: true,
      node_id_whitelist: [],
    });

    await wait(2000);

    const response = await rpApi.createRequest('rp1', createRequestParams(['idp1']));
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20079);
  });

  it('Should create a request successfully', async function() {
    this.timeout(30000);
    await ndidApi.updateNode('ndid1', {
      node_id: 'rp1',
      node_id_whitelist_active: true,
      node_id_whitelist: ['idp1'],
    });

    await ndidApi.updateNode('ndid1', {
      node_id: 'idp1',
      node_id_whitelist_active: true,
      node_id_whitelist: ['rp1'],
    });

    await wait(5000);

    const response = await rpApi.createRequest('rp1', createRequestParams(['idp1']));
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
  });

  after(async function() {
    this.timeout(10000);
    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');

    // reset whitelist status
    await ndidApi.updateNode('ndid1', {
      node_id: 'rp1',
      node_id_whitelist_active: false,
    });

    await ndidApi.updateNode('ndid1', {
      node_id: 'idp1',
      node_id_whitelist_active: false,
    });
  });
});