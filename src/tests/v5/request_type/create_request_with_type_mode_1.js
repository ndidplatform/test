import { mode1DataRequestFlowTest } from '../_fragments/data_request_mode_1_flow';

import * as ndidApi from '../../../api/v5/ndid';

import {
  rpEventEmitter,
  idp1EventEmitter,
  as1EventEmitter,
} from '../../../callback_server';

import {
  randomString,
  generateReferenceId,
  createSignature,
  wait,
} from '../../../utils';

import { ndidAvailable } from '../..';

import * as config from '../../../config';

describe('Data request flow, 1 IdP, 1 AS, mode 1 test', function () {
  const requestType = `request_type_test_${randomString(5)}`;

  before(async function () {
    this.timeout(10000);

    if (!ndidAvailable) {
      this.skip();
    }

    await ndidApi.addRequestType('ndid1', {
      name: requestType,
    });

    await wait(3000);
  });

  const data = JSON.stringify({
    test: 'test',
    withEscapedChar: 'test|fff||ss\\|NN\\\\|',
    arr: [1, 2, 3],
  });

  mode1DataRequestFlowTest({
    callRpApiAtNodeId: 'rp1',
    rpEventEmitter,
    createRequestParams: {
      reference_id: generateReferenceId(),
      callback_url: config.RP_CALLBACK_URL,
      mode: 1,
      namespace: 'citizen_id',
      identifier: '1234567890123',
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
      request_message:
        'Test request message (mode 1) ทดสอบภาษาไทย should\\|be|able\\\\|to|send\\\\\\|this',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
      request_type: requestType,
    },
    idpParams: [
      {
        callIdpApiAtNodeId: 'idp1',
        idpEventEmitter: idp1EventEmitter,
        idpResponseParams: {
          reference_id: generateReferenceId(),
          callback_url: config.IDP1_CALLBACK_URL,
          ial: 2.3,
          aal: 3,
          status: 'accept',
          createResponseSignature: (privatekey, request_message) => {
            const signature = createSignature(privatekey, request_message);
            return signature;
          },
        },
      },
    ],
    asParams: [
      {
        callAsApiAtNodeId: 'as1',
        asEventEmitter: as1EventEmitter,
        asResponseParams: [
          {
            reference_id: generateReferenceId(),
            callback_url: config.AS1_CALLBACK_URL,
            service_id: 'bank_statement',
            data,
          },
        ],
      },
    ],
  });
});
