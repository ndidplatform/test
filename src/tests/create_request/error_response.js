import { expect } from 'chai';

import * as rpApi from '../../api/v2/rp';
// import { rpEventEmitter } from '../../callback_server';
import * as db from '../../db';
import { createEventPromise, generateReferenceId } from '../../utils';
import * as config from '../../config';

describe('RP create request errors', function() {
  let namespace;
  let identifier;

  const rpReferenceId = generateReferenceId();

  // const createRequestResultPromise = createEventPromise(); // RP

  before(function() {
    if (db.idp1Identities[0] == null) {
      throw new Error('No created identity to use');
    }

    namespace = db.idp1Identities[0].namespace;
    identifier = db.idp1Identities[0].identifier;

    // rpEventEmitter.on('callback', function(callbackData) {
    //   if (
    //     callbackData.type === 'create_request_result' &&
    //     callbackData.reference_id === rpReferenceId
    //   ) {
    //     createRequestResultPromise.resolve(callbackData);
    //   } else if (
    //     callbackData.type === 'request_status' &&
    //     callbackData.request_id === requestId
    //   ) {
    //     requestStatusUpdates.push(callbackData);
    //     if (callbackData.status === 'pending') {
    //       if (callbackData.timed_out) {
    //         requestStatusTimedOutPromise.resolve(callbackData);
    //       } else {
    //         requestStatusPendingPromise.resolve(callbackData);
    //       }
    //     }
    //   }
    // });
  });

  it('RP should get an error when creating a request with AS ID that does not provide the requested service', async function() {
    this.timeout(10000);
    const createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 3,
      namespace,
      identifier,
      idp_id_list: [],
      data_request_list: [
        {
          service_id: 'bank_statement',
          as_id_list: ['as1', 'as2', 'as3'],
          min_as: 1,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
        {
          service_id: 'customer_info',
          as_id_list: ['as3'],
          min_as: 1,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
      ],
      request_message: 'Test request message (error create request) (mode 3)',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    };

    const response = await rpApi.createRequest('rp1', createRequestParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20043);
  });

  after(function() {
    // rpEventEmitter.removeAllListeners('callback');
  });
});
