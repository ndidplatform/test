import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import * as ndidApi from '../../api/v2/ndid';
import * as commonApi from '../../api/v2/common';
import * as idpApi from '../../api/v2/idp';
import * as asApi from '../../api/v2/as';
import { createRequest } from '../../api/v2/rp';
import {
  wait,
  generateReferenceId,
  createEventPromise,
  hashRequestMessageForConsent,
} from '../../utils';
import { ndidAvailable, idp1Available } from '..';
import { RP_CALLBACK_URL } from '../../config';
import {
  rpEventEmitter,
  idp1EventEmitter,
  as1EventEmitter,
} from '../../callback_server';
import * as config from '../../config';

describe('Spent and refill node token test', function() {
  let rpNodeTokenBeforeTest = 0;
  let idpNodeTokenBeforeTest = 0;
  let asNodeTokenBeforeTest = 0;

  let namespace = 'cid';
  let identifier = uuidv4();

  const RequestOutOfTokenReferenceId = generateReferenceId();
  const RequestAfterAddNodeTokenReferenceId = generateReferenceId();
  const idpReferenceId = generateReferenceId();
  const idpAfterAddNodeTokenReferenceId = generateReferenceId();
  const asSendDataReferenceId = generateReferenceId();
  const asSendDataAfterAddNodeTokenReferenceId = generateReferenceId();

  const createRequestOutOfTokenResultPromise = createEventPromise();
  const createRequestAfterAddNodeTokenResultPromise = createEventPromise();
  const incomingRequestPromise = createEventPromise(); // IDP
  const incomingRequestAfterAddNodeTokenPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise(); // IDP
  const responseResultAfterAddNodeTokenPromise = createEventPromise(); // IDP
  const dataRequestReceivedPromise = createEventPromise(); // AS
  const dataRequestAfterAddNodeTokenReceivedPromise = createEventPromise(); // AS
  const sendDataResultPromise = createEventPromise(); // AS
  const sendDataAfterAddNodeTokenResultPromise = createEventPromise(); // AS

  let requestId;
  let requestIdAfterAddNodeToken;
  let requestMessageHash;

  before(async function() {
    this.timeout(25000);
    if (!ndidAvailable || !idp1Available) {
      this.skip();
    }

    const responseGetTokenRP = await commonApi.getToken('rp1');
    const responseBodyGetTokenRP = await responseGetTokenRP.json();
    rpNodeTokenBeforeTest = responseBodyGetTokenRP.amount;

    const responseGetTokenIdP = await commonApi.getToken('idp1');
    const responseBodyGetTokenIdP = await responseGetTokenIdP.json();
    idpNodeTokenBeforeTest = responseBodyGetTokenIdP.amount;

    const responseGetTokenAS = await commonApi.getToken('as1');
    const responseBodyGetTokenAS = await responseGetTokenAS.json();
    asNodeTokenBeforeTest = responseBodyGetTokenAS.amount;

    await Promise.all([
      ndidApi.setNodeToken('ndid1', {
        node_id: 'rp1',
        amount: 5,
      }),
      ndidApi.setNodeToken('ndid1', {
        node_id: 'idp1',
        amount: 1,
      }),
      ndidApi.setNodeToken('ndid1', {
        node_id: 'as1',
        amount: 1,
      }),
    ]);

    rpEventEmitter.on('callback', function(callbackData) {
      if (callbackData.type === 'create_request_result') {
        if (callbackData.reference_id === RequestOutOfTokenReferenceId) {
          createRequestOutOfTokenResultPromise.resolve(callbackData);
        } else if (
          callbackData.reference_id === RequestAfterAddNodeTokenReferenceId
        ) {
          createRequestAfterAddNodeTokenResultPromise.resolve(callbackData);
        }
      }
    });

    idp1EventEmitter.on('callback', async function(callbackData) {
      if (callbackData.type === 'incoming_request') {
        if (callbackData.request_id === requestId) {
          incomingRequestPromise.resolve(callbackData);
        } else if (callbackData.request_id === requestIdAfterAddNodeToken) {
          incomingRequestAfterAddNodeTokenPromise.resolve(callbackData);
        }
      } else if (callbackData.type === 'response_result') {
        if (callbackData.reference_id === idpReferenceId) {
          responseResultPromise.resolve(callbackData);
        } else if (
          callbackData.reference_id === idpAfterAddNodeTokenReferenceId
        ) {
          responseResultAfterAddNodeTokenPromise.resolve(callbackData);
        }
      }
    });

    as1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'data_request' &&
        callbackData.service_id === 'bank_statement'
      ) {
        if (callbackData.request_id === requestId) {
          dataRequestReceivedPromise.resolve(callbackData);
        } else if (callbackData.request_id === requestIdAfterAddNodeToken) {
          dataRequestAfterAddNodeTokenReceivedPromise.resolve(callbackData);
        }
      } else if (callbackData.type === 'send_data_result') {
        if (callbackData.reference_id === asSendDataReferenceId) {
          sendDataResultPromise.resolve(callbackData);
        } else if (
          callbackData.reference_id === asSendDataAfterAddNodeTokenReferenceId
        ) {
          sendDataAfterAddNodeTokenResultPromise.resolve(callbackData);
        }
      }
    });

    await wait(5000);
  });

  it('RP should be out of token', async function() {
    this.timeout(30000);
    // flood 5 blocks for spent token
    for (let i of [1, 2, 3, 4]) {
      await createRequest('rp1', {
        reference_id: uuidv4(),
        callback_url: RP_CALLBACK_URL,
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
        request_message: 'Spent Token #' + i.toString(),
        min_ial: 1.1,
        min_aal: 1,
        min_idp: 1,
        request_timeout: 86400,
      });
      await wait(1000);
    }

    const response = await createRequest('rp1', {
      reference_id: uuidv4(),
      callback_url: RP_CALLBACK_URL,
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
      request_message: 'Spent Token #5',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    });

    let responseBody = await response.json();
    requestId = responseBody.request_id;
    await wait(3000);

    const responseGetToken = await commonApi.getToken('rp1');
    const responseBodyGetToken = await responseGetToken.json();

    expect(responseGetToken.status).to.equal(200);
    expect(responseBodyGetToken.amount).to.equal(0);
  });

  it('IdP should receive incoming request callback', async function() {
    this.timeout(30000);
    const incomingRequest = await incomingRequestPromise.promise;
    expect(incomingRequest).to.deep.include({
      mode: 1,
      request_id: requestId,
      namespace: namespace,
      identifier: identifier,
      request_message: 'Spent Token #5',
      request_message_hash: hashRequestMessageForConsent(
        'Spent Token #5',
        incomingRequest.initial_salt,
        requestId
      ),
      requester_node_id: 'rp1',
      min_ial: 1.1,
      min_aal: 1,
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
    });
    expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
      .empty;
    expect(incomingRequest.creation_time).to.be.a('number');

    requestMessageHash = incomingRequest.request_message_hash;
  });

  it('IdP should create response (accept) successfully', async function() {
    this.timeout(30000);
    const response = await idpApi.createResponse('idp1', {
      reference_id: idpReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      namespace: namespace,
      identifier: identifier,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      signature: 'Some signature',
    });
    expect(response.status).to.equal(202);

    const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      reference_id: idpReferenceId,
      request_id: requestId,
      success: true,
    });

    await wait(3000);

    const responseGetToken = await commonApi.getToken('idp1');
    const responseBodyGetToken = await responseGetToken.json();

    expect(responseGetToken.status).to.equal(200);
    expect(responseBodyGetToken.amount).to.equal(0);
  });

  it('AS should receive data request for "bank_statement" service', async function() {
    this.timeout(30000);
    const dataRequest = await dataRequestReceivedPromise.promise;
    expect(dataRequest).to.deep.include({
      request_id: requestId,
      mode: 1,
      namespace,
      identifier,
      service_id: 'bank_statement',
      request_params: JSON.stringify({
        format: 'pdf',
      }),
      max_ial: 2.3,
      max_aal: 3,
    });
    expect(dataRequest.response_signature_list).to.have.lengthOf(1);
    expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is.not
      .empty;
  });

  it('AS should send data successfully (bank_statement)', async function() {
    this.timeout(30000);
    const response = await asApi.sendData('as1', {
      requestId,
      serviceId: 'bank_statement',
      reference_id: asSendDataReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      data: 'Test spent node token',
    });
    expect(response.status).to.equal(202);

    const sendDataResult = await sendDataResultPromise.promise;
    expect(sendDataResult).to.deep.include({
      reference_id: asSendDataReferenceId,
      success: true,
    });

    await wait(3000);

    const responseGetToken = await commonApi.getToken('as1');
    const responseBodyGetToken = await responseGetToken.json();

    expect(responseGetToken.status).to.equal(200);
    expect(responseBodyGetToken.amount).to.equal(0);
  });

  it('RP should get an error making a request when out of token', async function() {
    this.timeout(15000);

    const response = await createRequest('rp1', {
      reference_id: RequestOutOfTokenReferenceId,
      callback_url: RP_CALLBACK_URL,
      mode: 1,
      namespace,
      identifier,
      idp_id_list: ['idp1'],
      data_request_list: [],
      request_message: 'Test making a request when out of token',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

    const requestId = responseBody.request_id;

    const createRequestResult = await createRequestOutOfTokenResultPromise.promise;

    expect(createRequestResult).to.deep.include({
      type: 'create_request_result',
      success: false,
      reference_id: RequestOutOfTokenReferenceId,
      request_id: requestId,
      error: {
        code: 25007,
        message: 'Not enough token to make a transaction',
      },
    });
  });

  it('NDID should add node token successfully', async function() {
    this.timeout(30000);
    await Promise.all([
      ndidApi.addNodeToken('ndid1', {
        node_id: 'rp1',
        amount: 5,
      }),
      ndidApi.addNodeToken('ndid1', {
        node_id: 'idp1',
        amount: 5,
      }),
      ndidApi.addNodeToken('ndid1', {
        node_id: 'as1',
        amount: 5,
      }),
    ]);
    await wait(5000);

    let resultGetToken = await Promise.all([
      commonApi.getToken('rp1'),
      commonApi.getToken('idp1'),
      commonApi.getToken('as1'),
    ]);

    let responseBodyGetToken = await Promise.all([
      resultGetToken[0].json(),
      resultGetToken[1].json(),
      resultGetToken[2].json(),
    ]);

    expect(responseBodyGetToken[0].amount).to.equal(5); // RP node token
    expect(responseBodyGetToken[1].amount).to.equal(5); // IdP node token
    expect(responseBodyGetToken[2].amount).to.equal(5); // AS node token

    // const responseGetTokenRP = await commonApi.getToken('rp1');
    // const responseBodyGetTokenRP = await responseGetTokenRP.json();

    // expect(responseGetTokenRP.status).to.equal(200);
    // expect(responseBodyGetTokenRP.amount).to.equal(5);

    // const responseGetTokenIdP = await commonApi.getToken('idp1');
    // const responseBodyGetTokenIdP = await responseGetTokenIdP.json();

    // expect(responseGetTokenIdP.status).to.equal(200);
    // expect(responseBodyGetTokenIdP.amount).to.equal(5);

    // const responseGetTokenAS = await commonApi.getToken('as1');
    // const responseBodyGetTokenAS = await responseGetTokenAS.json();

    // expect(responseGetTokenAS.status).to.equal(200);
    // expect(responseBodyGetTokenAS.amount).to.equal(5);
  });

  it('RP should making request after add node token successfully', async function() {
    this.timeout(15000);

    const response = await createRequest('rp1', {
      reference_id: RequestAfterAddNodeTokenReferenceId,
      callback_url: RP_CALLBACK_URL,
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
      request_message: 'Test making a request after add node token',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;

    requestIdAfterAddNodeToken = responseBody.request_id;

    const createRequestResult = await createRequestAfterAddNodeTokenResultPromise.promise;
    expect(createRequestResult.success).to.equal(true);
  });

  it('IdP should receive incoming request callback', async function() {
    this.timeout(15000);
    const incomingRequest = await incomingRequestAfterAddNodeTokenPromise.promise;
    expect(incomingRequest).to.deep.include({
      mode: 1,
      request_id: requestIdAfterAddNodeToken,
      namespace: namespace,
      identifier: identifier,
      request_message: 'Test making a request after add node token',
      request_message_hash: hashRequestMessageForConsent(
        'Test making a request after add node token',
        incomingRequest.initial_salt,
        requestIdAfterAddNodeToken
      ),
      requester_node_id: 'rp1',
      min_ial: 1.1,
      min_aal: 1,
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
    });
    expect(incomingRequest.request_message_salt).to.be.a('string').that.is.not
      .empty;
    expect(incomingRequest.creation_time).to.be.a('number');

    requestMessageHash = incomingRequest.request_message_hash;
  });

  it('IdP should create response (accept) successfully', async function() {
    this.timeout(15000);
    const response = await idpApi.createResponse('idp1', {
      reference_id: idpAfterAddNodeTokenReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestIdAfterAddNodeToken,
      namespace: namespace,
      identifier: identifier,
      ial: 2.3,
      aal: 3,
      status: 'accept',
      signature: 'Some signature',
    });
    expect(response.status).to.equal(202);

    const responseResult = await responseResultAfterAddNodeTokenPromise.promise;
    expect(responseResult).to.deep.include({
      reference_id: idpAfterAddNodeTokenReferenceId,
      request_id: requestIdAfterAddNodeToken,
      success: true,
    });
  });

  it('AS should receive data request for "bank_statement" service', async function() {
    this.timeout(15000);
    const dataRequest = await dataRequestAfterAddNodeTokenReceivedPromise.promise;
    expect(dataRequest).to.deep.include({
      request_id: requestIdAfterAddNodeToken,
      mode: 1,
      namespace,
      identifier,
      service_id: 'bank_statement',
      request_params: JSON.stringify({
        format: 'pdf',
      }),
      max_ial: 2.3,
      max_aal: 3,
    });
    expect(dataRequest.response_signature_list).to.have.lengthOf(1);
    expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is.not
      .empty;
  });

  it('AS should send data successfully (bank_statement)', async function() {
    this.timeout(15000);
    const response = await asApi.sendData('as1', {
      requestId: requestIdAfterAddNodeToken,
      serviceId: 'bank_statement',
      reference_id: asSendDataAfterAddNodeTokenReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      data: 'Test spent node token',
    });
    expect(response.status).to.equal(202);

    const sendDataResult = await sendDataAfterAddNodeTokenResultPromise.promise;
    expect(sendDataResult).to.deep.include({
      reference_id: asSendDataAfterAddNodeTokenReferenceId,
      success: true,
    });
  });

  after(async function() {
    this.timeout(10000);
    await Promise.all([
      ndidApi.setNodeToken('ndid1', {
        node_id: 'rp1',
        amount: rpNodeTokenBeforeTest,
      }),
      ndidApi.setNodeToken('ndid1', {
        node_id: 'idp1',
        amount: idpNodeTokenBeforeTest,
      }),
      ndidApi.setNodeToken('ndid1', {
        node_id: 'as1',
        amount: asNodeTokenBeforeTest,
      }),
    ]);
    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
    as1EventEmitter.removeAllListeners('callback');
    await wait(3000);
  });
});
