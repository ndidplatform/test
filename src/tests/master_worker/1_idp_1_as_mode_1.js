import { expect } from 'chai';
import forge from 'node-forge';

import * as rpApi from '../../api/v2/rp';
import * as idpApi from '../../api/v2/idp';
import * as asApi from '../../api/v2/as';
import * as commonApi from '../../api/v2/common';
import {
  rpEventEmitter,
  idp1EventEmitter,
  as1EventEmitter,
} from '../../callback_server';
import {
  createEventPromise,
  generateReferenceId,
  hashRequestMessageForConsent,
  createResponseSignature,
} from '../../utils';
import * as config from '../../config';

describe('Master worker 1 IdP, 1 AS, mode 1 test', function() {
  let namespace = 'citizen_id';
  let identifier = '1234567890123';
  const keypair = forge.pki.rsa.generateKeyPair(2048);
  const userPrivateKey = forge.pki.privateKeyToPem(keypair.privateKey);

  const createRequestResultPromise = createEventPromise(); // RP
  const requestStatusPendingPromise = createEventPromise(); // RP
  const incomingRequestPromise = createEventPromise(); // IDP
  const responseResultPromise = createEventPromise(); // IDP
  const requestStatusConfirmedPromise = createEventPromise(); // RP
  const dataRequestReceivedPromise = createEventPromise(); // AS
  const sendDataResultPromise = createEventPromise(); // AS
  const requestStatusSignedDataPromise = createEventPromise(); // RP
  const requestStatusCompletedPromise = createEventPromise(); // RP
  const requestClosedPromise = createEventPromise(); // RP

  const data = JSON.stringify({
    test: 'test',
    withEscapedChar: 'test|fff||ss\\|NN\\\\|',
    arr: [1, 2, 3],
  });

  let requests = {};

  const requestStatusUpdates = [];
  let lastStatusUpdateBlockHeight;

  let createRequestParams = {
    node_id: 'rp1',
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
    request_timeout: 3600,
  };

  before(function() {
    rpEventEmitter.on('callback', async function(callbackData) {
      if (callbackData.type === 'create_request_result') {
        if (requests[callbackData.request_id]) {
          requests[callbackData.request_id].createRequestResult.resolve(
            callbackData
          );
        }
      } else if (callbackData.type === 'request_status') {
        if (requests[callbackData.request_id]) {
          if (callbackData.status === 'pending' && !callbackData.timed_out) {
            requests[callbackData.request_id].pending.resolve(callbackData);
          } else if (callbackData.status === 'confirmed') {
            if (callbackData.service_list[0].signed_data_count === 1) {
              requests[callbackData.request_id].signed_data.resolve(
                callbackData
              );
            } else {
              requests[callbackData.request_id].confirmed.resolve(callbackData);
            }
          } else if (callbackData.status === 'completed') {
            if (callbackData.closed) {
              requests[callbackData.request_id].closed.resolve(callbackData);
            } else {
              requests[callbackData.request_id].completed.resolve(callbackData);
            }
          }
        }
      }
    });

    idp1EventEmitter.on('callback', function(callbackData) {
      if (requests[callbackData.request_id]) {
        if (callbackData.type === 'incoming_request') {
          requests[callbackData.request_id].incoming_request.resolve(
            callbackData
          );
        } else if (callbackData.type === 'response_result') {
          requests[callbackData.request_id].response_result.resolve(
            callbackData
          );
        }
      }
    });

    as1EventEmitter.on('callback', function(callbackData) {
      if (requests[callbackData.request_id]) {
        if (callbackData.type === 'data_request') {
          requests[callbackData.request_id].data_request.resolve(callbackData);
        } else if (callbackData.type === 'send_data_result') {
          requests[callbackData.request_id].send_data_result.resolve(
            callbackData
          );
        }
      }
    });
  });

  it('RP should create a requests successfully', async function() {
    this.timeout(30000);
    const createRequestPromises = [];
    Array.from({ length: 5 }).forEach(() => {
      const rpReferenceId = generateReferenceId();

      createRequestParams = {
        ...createRequestParams,
        reference_id: rpReferenceId,
      };

      const createRequestPromise = rpApi.createRequest(
        'rp1',
        createRequestParams
      );
      createRequestPromises.push(createRequestPromise);
    });

    const responses = await Promise.all(createRequestPromises);

    //Expected response status code
    await Promise.all(
      responses.map(async response => {
        const responseBody = await response.json();
        expect(response.status).to.equal(202);
        expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
        expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;
        requests[responseBody.request_id] = {
          createRequestResult: createEventPromise(),
          pending: createEventPromise(),
          confirmed: createEventPromise(),
          signed_data: createEventPromise(),
          received_data: createEventPromise(),
          completed: createEventPromise(),
          timed_out: createEventPromise(),
          closed: createEventPromise(),
          incoming_request: createEventPromise(),
          response_result: createEventPromise(),
          data_request: createEventPromise(),
          send_data_result: createEventPromise(),
        };
      })
    );

    //Expected create request result
    await Promise.all(
      Object.keys(requests).map(async requestId => {
        let createRequestResult = await requests[requestId].createRequestResult
          .promise;
        expect(createRequestResult.success).to.equal(true);
        expect(createRequestResult.creation_block_height).to.be.a('string');
        const splittedCreationBlockHeight = createRequestResult.creation_block_height.split(
          ':'
        );
        expect(splittedCreationBlockHeight).to.have.lengthOf(2);
        expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
        expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
        requests[
          requestId
        ].createRequestResult.lastStatusUpdateBlockHeight = parseInt(
          splittedCreationBlockHeight[1]
        );
      })
    );
  });

  it('RP should receive pending request status', async function() {
    this.timeout(30000);
    //Expected request status pending
    await Promise.all(
      Object.keys(requests).map(async requestId => {
        let requestStatus = await requests[requestId].pending.promise;
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
          requests[requestId].createRequestResult.lastStatusUpdateBlockHeight
        );
      })
    );
  });

  it('IdP should receive incoming request callback', async function() {
    this.timeout(30000);

    const dataRequestListWithoutParams = createRequestParams.data_request_list.map(
      dataRequest => {
        const { request_params, ...dataRequestWithoutParams } = dataRequest; // eslint-disable-line no-unused-vars
        return {
          ...dataRequestWithoutParams,
        };
      }
    );

    await Promise.all(
      Object.keys(requests).map(async requestId => {
        let incomingRequest = await requests[requestId].incoming_request
          .promise;
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
          request_timeout: createRequestParams.request_timeout,
        });

        expect(incomingRequest.request_message_salt).to.be.a('string').that.is
          .not.empty;
        expect(incomingRequest.creation_time).to.be.a('number');
        expect(incomingRequest.creation_block_height).to.be.a('string');
        const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
          ':'
        );
        expect(splittedCreationBlockHeight).to.have.lengthOf(2);
        expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
        expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);

        requests[requestId].incoming_request.request_message_hash =
          incomingRequest.request_message_hash;
      })
    );
  });

  it('IdP should create response (accept) successfully', async function() {
    this.timeout(30000);
    const responseRequestPromises = [];
    Object.keys(requests).map(requestId => {
      const idpReferenceId = generateReferenceId();
      const response = idpApi.createResponse('idp1', {
        reference_id: idpReferenceId,
        callback_url: config.IDP1_CALLBACK_URL,
        request_id: requestId,
        namespace: createRequestParams.namespace,
        identifier: createRequestParams.identifier,
        ial: 2.3,
        aal: 3,
        status: 'accept',
        signature: createResponseSignature(
          userPrivateKey,
          requests[requestId].incoming_request.request_message_hash
        ),
      });
      requests[requestId].response_result.idpReferenceId = idpReferenceId;
      responseRequestPromises.push(response);
    });

    let responses = await Promise.all(responseRequestPromises);

    responses.map(response => {
      expect(response.status).to.equal(202);
    });

    await Promise.all(
      Object.keys(requests).map(async requestId => {
        let responseResult = await requests[requestId].response_result.promise;
        expect(responseResult).to.deep.include({
          reference_id: requests[requestId].response_result.idpReferenceId,
          request_id: requestId,
          success: true,
        });
      })
    );
  });

  it('RP should receive confirmed request status', async function() {
    this.timeout(30000);
    await Promise.all(
      Object.keys(requests).map(async requestId => {
        const requestStatus = await requests[requestId].confirmed.promise;
        expect(requestStatus).to.deep.include({
          request_id: requestId,
          status: 'confirmed',
          mode: createRequestParams.mode,
          min_idp: createRequestParams.min_idp,
          answered_idp_count: 1,
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
          response_valid_list: [
            {
              idp_id: 'idp1',
              valid_signature: null,
              valid_proof: null,
              valid_ial: null,
            },
          ],
        });
        expect(requestStatus).to.have.property('block_height');
        expect(requestStatus.block_height).is.a('string');
        const splittedBlockHeight = requestStatus.block_height.split(':');
        expect(splittedBlockHeight).to.have.lengthOf(2);
        expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
        expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
        expect(parseInt(splittedBlockHeight[1])).to.be.above(
          requests[requestId].createRequestResult.lastStatusUpdateBlockHeight
        );
        requests[
          requestId
        ].createRequestResult.lastStatusUpdateBlockHeight = parseInt(
          splittedBlockHeight[1]
        );
        // lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
      })
    );
  });

  it('AS should receive data request', async function() {
    this.timeout(30000);
    await Promise.all(
      Object.keys(requests).map(async requestId => {
        const dataRequest = await requests[requestId].data_request.promise;

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
          request_timeout: createRequestParams.request_timeout,
        });
        expect(dataRequest.response_signature_list).to.have.lengthOf(1);
        expect(dataRequest.response_signature_list[0]).to.be.a('string').that.is
          .not.empty;
        expect(dataRequest.creation_time).to.be.a('number');
        expect(dataRequest.creation_block_height).to.be.a('string');
        const splittedCreationBlockHeight = dataRequest.creation_block_height.split(
          ':'
        );
        expect(splittedCreationBlockHeight).to.have.lengthOf(2);
        expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
        expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
      })
    );
  });

  it('AS should send data successfully', async function() {
    this.timeout(15000);
    let responseSendDataPromises = [];
    Object.keys(requests).map(requestId => {
      const asReferenceId = generateReferenceId();
      const response = asApi.sendData('as1', {
        requestId,
        serviceId: createRequestParams.data_request_list[0].service_id,
        reference_id: asReferenceId,
        callback_url: config.AS1_CALLBACK_URL,
        data,
      });
      requests[requestId].send_data_result.asReferenceId = asReferenceId;
      responseSendDataPromises.push(response);
    });

    let responses = await Promise.all(responseSendDataPromises);

    responses.map(response => {
      expect(response.status).to.equal(202);
    });

    await Promise.all(
      Object.keys(requests).map(async requestId => {
        const sendDataResult = await requests[requestId].send_data_result
          .promise;
        expect(sendDataResult).to.deep.include({
          reference_id: requests[requestId].send_data_result.asReferenceId,
          success: true,
        });
      })
    );
  });

  it('RP should receive request status with signed data count = 1', async function() {
    this.timeout(30000);
    await Promise.all(
      Object.keys(requests).map(async requestId => {
        const requestStatus = await requests[requestId].signed_data.promise;

        expect(requestStatus).to.deep.include({
          request_id: requestId,
          status: 'confirmed',
          mode: createRequestParams.mode,
          min_idp: createRequestParams.min_idp,
          answered_idp_count: 1,
          closed: false,
          timed_out: false,
          service_list: [
            {
              service_id: createRequestParams.data_request_list[0].service_id,
              min_as: createRequestParams.data_request_list[0].min_as,
              signed_data_count: 1,
              received_data_count: 0,
            },
          ],
          response_valid_list: [
            {
              idp_id: 'idp1',
              valid_signature: null,
              valid_proof: null,
              valid_ial: null,
            },
          ],
        });
        expect(requestStatus).to.have.property('block_height');
        expect(requestStatus.block_height).is.a('string');
        const splittedBlockHeight = requestStatus.block_height.split(':');
        expect(splittedBlockHeight).to.have.lengthOf(2);
        expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
        expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
        expect(parseInt(splittedBlockHeight[1])).to.be.above(
          requests[requestId].createRequestResult.lastStatusUpdateBlockHeight
        );
        requests[
          requestId
        ].createRequestResult.lastStatusUpdateBlockHeight = parseInt(
          splittedBlockHeight[1]
        );
        //lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
      })
    );
  });

  it('RP should receive completed request status with received data count = 1', async function() {
    this.timeout(30000);

    await Promise.all(
      Object.keys(requests).map(async requestId => {
        const requestStatus = await requests[requestId].completed.promise;
        expect(requestStatus).to.deep.include({
          request_id: requestId,
          status: 'completed',
          mode: createRequestParams.mode,
          min_idp: createRequestParams.min_idp,
          answered_idp_count: 1,
          closed: false,
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
              valid_signature: null,
              valid_proof: null,
              valid_ial: null,
            },
          ],
        });
        expect(requestStatus).to.have.property('block_height');
        expect(requestStatus.block_height).is.a('string');
        const splittedBlockHeight = requestStatus.block_height.split(':');
        expect(splittedBlockHeight).to.have.lengthOf(2);
        expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
        expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
        expect(parseInt(splittedBlockHeight[1])).to.be.above(
          requests[requestId].createRequestResult.lastStatusUpdateBlockHeight
        );
        requests[
          requestId
        ].createRequestResult.lastStatusUpdateBlockHeight = parseInt(
          splittedBlockHeight[1]
        );
        //lastStatusUpdateBlockHeight = parseInt(splittedBlockHeight[1]);
      })
    );
  });

  it('RP should receive request closed status', async function() {
    this.timeout(30000);
    await Promise.all(
      Object.keys(requests).map(async requestId => {
        const requestStatus = await requests[requestId].closed.promise;

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
              valid_signature: null,
              valid_proof: null,
              valid_ial: null,
            },
          ],
        });
        expect(requestStatus).to.have.property('block_height');
        expect(requestStatus.block_height).is.a('string');
        const splittedBlockHeight = requestStatus.block_height.split(':');
        expect(splittedBlockHeight).to.have.lengthOf(2);
        expect(splittedBlockHeight[0]).to.have.lengthOf.at.least(1);
        expect(splittedBlockHeight[1]).to.have.lengthOf.at.least(1);
        expect(parseInt(splittedBlockHeight[1])).to.be.above(
          requests[requestId].createRequestResult.lastStatusUpdateBlockHeight
        );
      })
    );
  });

  it('RP should get the correct data received from AS', async function() {
    this.timeout(30000);
    let responseGetDataFromASPromises = [];
    Object.keys(requests).map(requestId => {
      const response = rpApi.getDataFromAS('rp1', {
        requestId,
      });
      responseGetDataFromASPromises.push(response);
    });

    let responses = await Promise.all(responseGetDataFromASPromises);

    responses.map(async response => {
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
  });

  //   it('RP should receive 5 request status updates', function() {
  //     expect(requestStatusUpdates).to.have.lengthOf(5);
  //   });

  it('RP should remove data requested from AS successfully', async function() {
    this.timeout(10000);
    let responseRemoveDataRequestedFromASPromises = [];

    Object.keys(requests).map(requestId => {
      const response = rpApi.removeDataRequestedFromAS('rp1', {
        request_id: requestId,
      });
      responseRemoveDataRequestedFromASPromises.push(response);
    });

    let responses = await Promise.all(
      responseRemoveDataRequestedFromASPromises
    );

    responses.map(response => {
      expect(response.status).to.equal(204);
    });
  });

  it('RP should have no saved data requested from AS left after removal', async function() {
    this.timeout(10000);
    let responseGetDataFromASPromises = [];

    Object.keys(requests).map(requestId => {
      const response = rpApi.getDataFromAS('rp1', {
        requestId,
      });
      responseGetDataFromASPromises.push(response);
    });

    let responses = await Promise.all(responseGetDataFromASPromises);

    await Promise.all(
      responses.map(async response => {
        const responseBody = await response.json();
        expect(response.status).to.equal(200);
        expect(responseBody).to.be.an('array').that.is.empty;
      })
    );
  });

  it('RP should have and able to get saved private messages', async function() {
    this.timeout(10000);
    let responseGetDataFromASPromises = [];

    Object.keys(requests).map(requestId => {
      const response = commonApi.getPrivateMessages('rp1', {
        request_id: requestId,
      });
      responseGetDataFromASPromises.push(response);
    });

    let responses = await Promise.all(responseGetDataFromASPromises);

    await Promise.all(
      responses.map(async response => {
        const responseBody = await response.json();
        expect(response.status).to.equal(200);
        expect(responseBody).to.be.an('array').that.is.not.empty;
      })
    );
  });

  it('RP should remove saved private messages successfully', async function() {
    this.timeout(10000);
    let responseRemovePrivateMessagesPromises = [];

    Object.keys(requests).map(requestId => {
      const response = commonApi.removePrivateMessages('rp1', {
        request_id: requestId,
      });
      responseRemovePrivateMessagesPromises.push(response);
    });

    let responses = await Promise.all(responseRemovePrivateMessagesPromises);

    responses.map(response => {
      expect(response.status).to.equal(204);
    });
  });

  it('RP should have no saved private messages left after removal', async function() {
    this.timeout(10000);
    let responseGetPrivateMessagesPromises = [];

    Object.keys(requests).map(requestId => {
      const response = commonApi.getPrivateMessages('rp1', {
        request_id: requestId,
      });
      responseGetPrivateMessagesPromises.push(response);
    });

    let responses = await Promise.all(responseGetPrivateMessagesPromises);

    await Promise.all(
      responses.map(async response => {
        const responseBody = await response.json();
        expect(response.status).to.equal(200);
        expect(responseBody).to.be.an('array').that.is.empty;
      })
    );
  });

  it('IdP should have and able to get saved private messages', async function() {
    this.timeout(10000);
    let responseGetPrivateMessagesPromises = [];

    Object.keys(requests).map(requestId => {
      const response = commonApi.getPrivateMessages('idp1', {
        request_id: requestId,
      });
      responseGetPrivateMessagesPromises.push(response);
    });

    let responses = await Promise.all(responseGetPrivateMessagesPromises);

    await Promise.all(
      responses.map(async response => {
        const responseBody = await response.json();
        expect(response.status).to.equal(200);
        expect(responseBody).to.be.an('array').that.is.not.empty;
      })
    );
  });

  it('IdP should remove saved private messages successfully', async function() {
    this.timeout(10000);
    let responseRemovePrivateMessagesPromises = [];

    Object.keys(requests).map(requestId => {
      const response = commonApi.removePrivateMessages('idp1', {
        request_id: requestId,
      });
      responseRemovePrivateMessagesPromises.push(response);
    });

    let responses = await Promise.all(responseRemovePrivateMessagesPromises);

    responses.map(response => {
      expect(response.status).to.equal(204);
    });
  });

  it('IdP should have no saved private messages left after removal', async function() {
    this.timeout(10000);
    let responseGetPrivateMessagesPromises = [];

    Object.keys(requests).map(requestId => {
      const response = commonApi.getPrivateMessages('idp1', {
        request_id: requestId,
      });
      responseGetPrivateMessagesPromises.push(response);
    });
    let responses = await Promise.all(responseGetPrivateMessagesPromises);

    await Promise.all(
      responses.map(async response => {
        const responseBody = await response.json();
        expect(response.status).to.equal(200);
        expect(responseBody).to.be.an('array').that.is.empty;
      })
    );
  });

  it('AS should have and able to get saved private messages', async function() {
    this.timeout(10000);
    let responseGetPrivateMessagesPromises = [];

    Object.keys(requests).map(requestId => {
      const response = commonApi.getPrivateMessages('as1', {
        request_id: requestId,
      });
      responseGetPrivateMessagesPromises.push(response);
    });
    let responses = await Promise.all(responseGetPrivateMessagesPromises);

    await Promise.all(
      responses.map(async response => {
        const responseBody = await response.json();
        expect(response.status).to.equal(200);
        expect(responseBody).to.be.an('array').that.is.not.empty;
      })
    );
  });

  it('AS should remove saved private messages successfully', async function() {
    this.timeout(10000);
    let responseRemovePrivateMessagesPromises = [];

    Object.keys(requests).map(requestId => {
      const response = commonApi.removePrivateMessages('as1', {
        request_id: requestId,
      });
      responseRemovePrivateMessagesPromises.push(response);
    });

    let responses = await Promise.all(responseRemovePrivateMessagesPromises);

    responses.map(response => {
      expect(response.status).to.equal(204);
    });
  });

  it('AS should have no saved private messages left after removal', async function() {
    this.timeout(10000);
    let responseGetPrivateMessagesPromises = [];

    Object.keys(requests).map(requestId => {
      const response = commonApi.getPrivateMessages('as1', {
        request_id: requestId,
      });
      responseGetPrivateMessagesPromises.push(response);
    });
    let responses = await Promise.all(responseGetPrivateMessagesPromises);

    await Promise.all(
      responses.map(async response => {
        const responseBody = await response.json();
        expect(response.status).to.equal(200);
        expect(responseBody).to.be.an('array').that.is.empty;
      })
    );
  });

  after(function() {
    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
    as1EventEmitter.removeAllListeners('callback');
  });
});
