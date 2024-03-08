import { expect } from 'chai';
import * as rpApi from '../../../api/v6/rp';
import * as idpApi from '../../../api/v6/idp';
import { rpEventEmitter, idp1EventEmitter } from '../../../callback_server';
import * as db from '../../../db';
import {
  createEventPromise,
  generateReferenceId,
  wait,
  hash,
} from '../../../utils';
import * as config from '../../../config';

describe('IdP get request message padded hash error tests', function() {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();
  const rpReferenceIdRequestClose = generateReferenceId();
  const rpReferenceIdRequestTimeout = generateReferenceId();
  const rpReferenceIdMode1 = generateReferenceId();

  const closeRequestResultPromise = createEventPromise();
  const requestTimedoutPromise = createEventPromise();

  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise();

  let createRequestParams;

  let requestId;
  let requestIdRequestClose;
  let requestIdRequestTimeout;
  let requestIdMode1;
  let initialSalt;

  before(async function() {
    this.timeout(30000);
    let identity = db.idp1Identities.filter(
      identity =>
        identity.namespace === 'citizen_id' &&
        identity.mode === 3 &&
        !identity.revokeIdentityAssociation
    );

    if (identity.length === 0) {
      throw new Error('No created identity to use');
    }

    namespace = identity[0].namespace;
    identifier = identity[0].identifier;

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
      request_message: 'Test request message (error data response) (mode 3)',
      min_ial: 2.3,
      min_aal: 3,
      min_idp: 1,
      request_timeout: 86400,
      bypass_identity_check: false,
    };

    rpEventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'close_request_result' &&
        callbackData.reference_id === rpReferenceIdRequestClose
      ) {
        closeRequestResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'request_status' &&
        callbackData.request_id === requestIdRequestTimeout &&
        callbackData.timed_out
      ) {
        requestTimedoutPromise.resolve(callbackData);
      }
    });

    idp1EventEmitter.on('callback', function(callbackData) {
      if (
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
  });

  it('RP should create request successfully (mode 3)', async function() {
    this.timeout(15000);
    const responseRp = await rpApi.createRequest('rp1', createRequestParams);
    const responseBodyRp = await responseRp.json();
    requestIdRequestClose = responseBodyRp.request_id;

    await wait(3000);
  });

  it('RP should close request successfully ', async function() {
    const response = await rpApi.closeRequest('rp1', {
      reference_id: rpReferenceIdRequestClose,
      callback_url: config.RP_CALLBACK_URL,
      request_id: requestIdRequestClose,
    });
    expect(response.status).to.equal(202);
    const closeRequestResult = await closeRequestResultPromise.promise;
    expect(closeRequestResult.success).to.equal(true);
  });

  it('IdP should get request message padded hash request already closed unsuccessfully', async function() {
    this.timeout(15000);
    const identity = db.idp1Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier
    );
    const response = await idpApi.getRequestMessagePaddedHash('idp1', {
      request_id: requestIdRequestClose,
      accessor_id: identity.accessors[0].accessorId,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20025);
  });

  it('RP should create request successfully (mode 1)', async function() {
    this.timeout(15000);
    let requestParams = {
      ...createRequestParams,
      mode: 1,
      reference_id: rpReferenceIdMode1,
      idp_id_list: ['idp1'],
    };
    const responseRp = await rpApi.createRequest('rp1', requestParams);
    const responseBodyRp = await responseRp.json();
    requestIdMode1 = responseBodyRp.request_id;
    await wait(3000);
  });

  it('IdP should get request message padded hash with request_id (mode 1) unsuccessfully', async function() {
    this.timeout(15000);
    const identity = db.idp1Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    const response = await idpApi.getRequestMessagePaddedHash('idp1', {
      request_id: requestIdMode1,
      accessor_id: identity.accessors[0].accessorId,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20075);
  });

  it('RP should create request successfully (mode 3)', async function() {
    this.timeout(15000);
    let requestParams = {
      ...createRequestParams,
      reference_id: rpReferenceIdRequestTimeout,
      request_timeout: 3,
    };
    const responseRp = await rpApi.createRequest('rp1', requestParams);
    const responseBodyRp = await responseRp.json();
    requestIdRequestTimeout = responseBodyRp.request_id;
  });

  it('Request should timeout successfully ', async function() {
    this.timeout(30000);
    const requestTimedout = await requestTimedoutPromise.promise;
    expect(requestTimedout.request_id).to.equal(requestIdRequestTimeout);
    expect(requestTimedout.timed_out).to.equal(true);
  });

  it('IdP should get request message padded hash request already timedout unsuccessfully', async function() {
    this.timeout(15000);
    const identity = db.idp1Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier
    );
    const response = await idpApi.getRequestMessagePaddedHash('idp1', {
      request_id: requestIdRequestTimeout,
      accessor_id: identity.accessors[0].accessorId,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20026);
  });

  it('RP should create request successfully (mode 3)', async function() {
    const responseRp = await rpApi.createRequest('rp1', createRequestParams);
    const responseBodyRp = await responseRp.json();
    requestId = responseBodyRp.request_id;
    initialSalt = responseBodyRp.initial_salt;
  });

  it('IdP should receive incoming request callback', async function() {
    this.timeout(15000);
    const incomingRequest = await incomingRequestPromise.promise;

    const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
      dataRequest => {
        const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
        return {
          ...dataRequestWithoutParams,
        };
      }
    );
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
    expect(incomingRequest.initial_salt).to.equal(initialSalt);
    expect(incomingRequest.reference_group_code).to.be.a('string').that.is.not
      .empty;
    expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
      .empty;
    expect(incomingRequest.creation_time).to.be.a('number');
    expect(incomingRequest.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
      ':'
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('IdP should get request message padded hash without provide accessor_id unsuccessfully', async function() {
    this.timeout(15000);
    const response = await idpApi.getRequestMessagePaddedHash('idp1', {
      request_id: requestId,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20002);
  });

  it('IdP should get request message padded hash without provide request_id unsuccessfully', async function() {
    this.timeout(15000);
    const identity = db.idp1Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    const response = await idpApi.getRequestMessagePaddedHash('idp1', {
      accessor_id: identity.accessors[0].accessorId,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20002);
  });

  it('IdP should get request message padded hash with accessor_id does not exists unsuccessfully', async function() {
    this.timeout(15000);

    const response = await idpApi.getRequestMessagePaddedHash('idp1', {
      request_id: requestId,
      accessor_id: 'not-exists-accessor-id',
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20011);
  });

  it('IdP should get request message padded hash with request_id does not exists unsuccessfully', async function() {
    this.timeout(15000);
    const identity = db.idp1Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    const response = await idpApi.getRequestMessagePaddedHash('idp1', {
      request_id: 'not-exists-request-id',
      accessor_id: identity.accessors[0].accessorId,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20012);
  });

  it('IdP that the request does not concern should get request message padded hash unsuccessfully', async function() {
    this.timeout(15000);
    const identity = db.idp1Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    const response = await idpApi.getRequestMessagePaddedHash('idp2', {
      request_id: requestId,
      accessor_id: identity.accessors[0].accessorId,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20038);
  });

  after(async function() {
    this.timeout(15000);
    await rpApi.closeRequest('rp1', {
      reference_id: generateReferenceId(),
      callback_url: config.RP_CALLBACK_URL,
      request_id: requestId,
    });
  });
});
