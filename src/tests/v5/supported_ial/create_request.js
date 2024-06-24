import { expect } from 'chai';

import * as commonApi from '../../../api/v5/common';
import * as rpApi from '../../../api/v5/rp';
import * as ndidApiV6 from '../../../api/v6/ndid';
import * as apiHelpers from '../../../api/helpers';
import { rpEventEmitter } from '../../../callback_server';

import { generateReferenceId, createEventPromise, wait } from '../../../utils';
import { randomThaiIdNumber } from '../../../utils/thai_id';
import { ndidAvailable } from '../..';

import * as config from '../../../config';
import { waitUntilBlockHeightMatch } from '../../../tendermint';

describe('Create request with new IAL test', function () {
  const supportedIALList = [
    1, 1.1, 1.2, 1.3, 1.9, 2.1, 2.2, 2.3, 3, 3.5, 4, 5, 5.2,
  ];

  let originalSupportedIALList;

  const rpReferenceId = generateReferenceId();

  const createRequestResultPromise = createEventPromise();

  const createRequestParams = {
    reference_id: rpReferenceId,
    callback_url: config.RP_CALLBACK_URL,
    mode: 1,
    namespace: 'citizen_id',
    identifier: randomThaiIdNumber(),
    idp_id_list: ['idp1'],
    data_request_list: [],
    request_message: 'Test request message (IAL)',
    min_ial: 1.9,
    min_aal: 3,
    min_idp: 1,
    request_timeout: 86400,
    bypass_identity_check: false,
  };

  before(async function () {
    this.timeout(10000);

    if (!ndidAvailable) {
      this.skip();
    }

    let response;

    response = await apiHelpers.getResponseAndBody(
      commonApi.getSupportedIALList('ndid1')
    );
    originalSupportedIALList = response.responseBody;

    await ndidApiV6.setSupportedIALList('ndid1', {
      supported_ial_list: supportedIALList,
    });

    rpEventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'create_request_result' &&
        callbackData.reference_id === rpReferenceId
      ) {
        createRequestResultPromise.resolve(callbackData);
      }
    });

    await waitUntilBlockHeightMatch('rp1', 'ndid1');
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
      requester_node_id: 'rp1',
      status: 'pending',
    });
  });

  after(async function () {
    this.timeout(5000);

    rpEventEmitter.removeAllListeners('callback');

    await ndidApiV6.setSupportedIALList('ndid1', {
      supported_ial_list: originalSupportedIALList,
    });
  });
});
