import { expect } from 'chai';

import * as commonApi from '../../../api/v5/common';
import * as rpApi from '../../../api/v5/rp';
import * as ndidApi from '../../../api/v5/ndid';
import { rpEventEmitter } from '../../../callback_server';

import {
  randomString,
  generateReferenceId,
  createEventPromise,
  wait,
} from '../../../utils';
import { ndidAvailable } from '../..';

import * as config from '../../../config';

describe('Create request with request type test', function () {
  const requestType = `request_type_test_${randomString(5)}`;

  const rpReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise();

  const createRequestParams = {
    reference_id: rpReferenceId,
    callback_url: config.RP_CALLBACK_URL,
    mode: 1,
    namespace: 'citizen_id',
    identifier: randomString(13, '0123456789'),
    idp_id_list: ['idp1'],
    data_request_list: [],
    request_message: 'Test request message (request type)',
    min_ial: 2.3,
    min_aal: 3,
    min_idp: 1,
    request_timeout: 86400,
    bypass_identity_check: false,
    request_type: requestType,
  };  

  before(async function () {
    this.timeout(10000);

    if (!ndidAvailable) {
      this.skip();
    }

    await ndidApi.addRequestType('ndid1', {
      name: requestType,
    });

    await wait(3000);

    rpEventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'create_request_result' &&
        callbackData.reference_id === rpReferenceId
      ) {
        createRequestResultPromise.resolve(callbackData);
      }
    });
  });

  let requestId;
  it('RP should create a request with type successfully', async function () {
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
    const splittedCreationBlockHeight =
      createRequestResult.creation_block_height.split(':');
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('Should get request status successfully', async function () {
    this.timeout(3000);

    const response = await commonApi.getRequest('rp1', {
      requestId,
    });
    expect(response.status).to.equal(200);
    const responseBody = await response.json();
    expect(responseBody).to.deep.include({
      request_id: requestId,
      min_idp: createRequestParams.min_idp,
      min_aal: createRequestParams.min_aal,
      min_ial: createRequestParams.min_ial,
      request_timeout: createRequestParams.request_timeout,
      idp_id_list: createRequestParams.idp_id_list,
      data_request_list: createRequestParams.data_request_list,
      // response_list,
      closed: false,
      timed_out: false,
      mode: 1,
      request_type: requestType,
      requester_node_id: 'rp1',
      status: 'pending',
    });
  });

  after(function () {
    rpEventEmitter.removeAllListeners('callback');
  });
});
