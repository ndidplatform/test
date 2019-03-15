import { expect } from 'chai';
import { exec } from 'child_process';
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
import * as db from '../../db';
import {
  createEventPromise,
  generateReferenceId,
  hashRequestMessageForConsent,
  createResponseSignature,
  wait,
} from '../../utils';
import * as config from '../../config';

describe('2 RP worker create request and timeout request test', function() {
  let namespace = 'citizen_id';
  let identifier = '1234567890123';

  let requests = {};
  let requestId;
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
    request_timeout: 10,
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
          } else if (
            callbackData.status === 'pending' &&
            callbackData.timed_out
          ) {
            requests[callbackData.request_id].timed_out.resolve(callbackData);
          }
        }
      }
    });
  });

  it('All RPs should create request successfully', async function() {
    this.timeout(30000);
    const createRequestPromises = [];
    Array.from({ length: 10 }).forEach(() => {
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
          timed_out: createEventPromise(),
          closed: createEventPromise(),
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

  it('All pending requests should timeout successfully', async function() {
    this.timeout(60000);
    await Promise.all(
      Object.keys(requests).map(async requestId => {
        let requestStatus = await requests[requestId].timed_out.promise;
        expect(requestStatus).to.deep.include({
          node_id: createRequestParams.node_id,
          type: 'request_status',
          request_id: requestId,
          status: 'pending',
          mode: createRequestParams.mode,
          min_idp: createRequestParams.min_idp,
          answered_idp_count: 0,
          closed: false,
          timed_out: true,
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
        expect(parseInt(splittedBlockHeight[1])).to.be.above(
          requests[requestId].createRequestResult.lastStatusUpdateBlockHeight
        );
      })
    );
  });
  after(function() {
    rpEventEmitter.removeAllListeners('callback');
    idp1EventEmitter.removeAllListeners('callback');
    as1EventEmitter.removeAllListeners('callback');
  });
});

describe('2 RP worker create request and timeout request (kill 1 rp worker) test', function() {
  let namespace = 'citizen_id';
  let identifier = '1234567890123';

  const data = JSON.stringify({
    test: 'test',
    withEscapedChar: 'test|fff||ss\\|NN\\\\|',
    arr: [1, 2, 3],
  });

  let requests = {};
  let requestId;
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
    request_timeout: 10,
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
          } else if (
            callbackData.status === 'pending' &&
            callbackData.timed_out
          ) {
            requests[callbackData.request_id].timed_out.resolve(callbackData);
          }
        }
      }
    });
  });

  it('All RPs should create request successfully', async function() {
    this.timeout(1000000);
    const createRequestPromises = [];
    Array.from({ length: 10 }).forEach(() => {
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

    //Response status code
    await Promise.all(
      responses.map(async response => {
        const responseBody = await response.json();
        expect(response.status).to.equal(202);
        expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
        expect(responseBody.initial_salt).to.be.a('string').that.is.not.empty;
        requests[responseBody.request_id] = {
          createRequestResult: createEventPromise(),
          pending: createEventPromise(),
          timed_out: createEventPromise(),
          closed: createEventPromise(),
        };
      })
    );

    //Create request result
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

  // it('Should kill 1 rp worker successfully', function() {
  //   exec('npm run kill-rp-worker-1', error => {
  //     if (error) {
  //       throw Error(`Kill rp worker failed: ${error}`);
  //     }
  //   });
  // });

  it('All pending requests should timeout successfully', async function() {
    this.timeout(60000);
    await Promise.all(
      Object.keys(requests).map(async requestId => {
        let requestStatus = await requests[requestId].timed_out.promise;
        expect(requestStatus).to.deep.include({
          node_id: createRequestParams.node_id,
          type: 'request_status',
          request_id: requestId,
          status: 'pending',
          mode: createRequestParams.mode,
          min_idp: createRequestParams.min_idp,
          answered_idp_count: 0,
          closed: false,
          timed_out: true,
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
        expect(parseInt(splittedBlockHeight[1])).to.be.above(
          requests[requestId].createRequestResult.lastStatusUpdateBlockHeight
        );
      })
    );
  });
});
