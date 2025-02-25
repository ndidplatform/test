import { mode1DataRequestFlowTest } from '../_fragments/data_request_mode_1_flow';

import * as commonApi from '../../../api/v5/common';
import * as ndidApi from '../../../api/v6/ndid';
import * as apiHelpers from '../../../api/helpers';
import {
  rpEventEmitter,
  idp1EventEmitter,
  as1EventEmitter,
} from '../../../callback_server';

import { generateReferenceId, createSignature, wait } from '../../../utils';
import { randomThaiIdNumber } from '../../../utils/thai_id';
import { ndidAvailable } from '../..';

import * as config from '../../../config';

describe('Create request (full flow) with new IAL test', function () {
  const supportedIALList = [
    1, 1.1, 1.2, 1.3, 1.9, 2.1, 2.2, 2.3, 3, 3.5, 4, 5, 5.2,
  ];

  let originalSupportedIALList;

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

    await ndidApi.setSupportedIALList('ndid1', {
      supported_ial_list: supportedIALList,
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
      identifier: randomThaiIdNumber(),
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
      request_message: 'Test request message (IAL)',
      min_ial: 1.9,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    },
    idpParams: [
      {
        callIdpApiAtNodeId: 'idp1',
        idpEventEmitter: idp1EventEmitter,
        idpResponseParams: {
          reference_id: generateReferenceId(),
          callback_url: config.IDP1_CALLBACK_URL,
          ial: 1.9,
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
        maxIal: 1.9,
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

  after(async function () {
    this.timeout(5000);

    await ndidApi.setSupportedIALList('ndid1', {
      supported_ial_list: originalSupportedIALList,
    });
  });
});
