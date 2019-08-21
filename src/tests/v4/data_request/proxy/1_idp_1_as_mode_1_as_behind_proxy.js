import { mode1DataRequestFlowTest } from '../../_fragments/data_request_mode_1_flow';
import {
  rpEventEmitter,
  idp1EventEmitter,
  proxy1EventEmitter,
} from '../../../../callback_server';
import { generateReferenceId, createSignature } from '../../../../utils';
import * as config from '../../../../config';

describe('1 IdP, 1 AS, mode 1, AS (proxy1_as4) behind proxy', function() {
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
          as_id_list: ['proxy1_as4'],
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
        callAsApiAtNodeId: 'proxy1',
        asEventEmitter: proxy1EventEmitter,
        asResponseParams: [
          {
            node_id: 'proxy1_as4',
            reference_id: generateReferenceId(),
            callback_url: config.PROXY1_CALLBACK_URL,
            service_id: 'bank_statement',
            data,
          },
        ],
      },
    ],
  });
});

// describe('1 IdP (idp response with signature), 1 AS, mode 1, AS (proxy1_as4) behind proxy', function() {
//   const data = JSON.stringify({
//     test: 'test',
//     withEscapedChar: 'test|fff||ss\\|NN\\\\|',
//     arr: [1, 2, 3],
//   });

//   mode1DataRequestFlowTest({
//     callRpApiAtNodeId: 'rp1',
//     rpEventEmitter,
//     createRequestParams: {
//       reference_id: generateReferenceId(),
//       callback_url: config.RP_CALLBACK_URL,
//       mode: 1,
//       namespace: 'citizen_id',
//       identifier: '1234567890123',
//       idp_id_list: ['idp1'],
//       data_request_list: [
//         {
//           service_id: 'bank_statement',
//           as_id_list: ['proxy1_as4'],
//           min_as: 1,
//           request_params: JSON.stringify({
//             format: 'pdf',
//           }),
//         },
//       ],
//       request_message:
//         'Test request message (mode 1) ทดสอบภาษาไทย should\\|be|able\\\\|to|send\\\\\\|this',
//       min_ial: 1.1,
//       min_aal: 1,
//       min_idp: 1,
//       request_timeout: 86400,
//     },
//     idpParams: [
//       {
//         callIdpApiAtNodeId: 'idp1',
//         idpEventEmitter: idp1EventEmitter,
//         idpResponseParams: {
//           reference_id: generateReferenceId(),
//           callback_url: config.IDP1_CALLBACK_URL,
//           ial: 2.3,
//           aal: 3,
//           status: 'accept',
//           createResponseSignature: (privatekey, request_message) => {
//             const signature = createSignature(privatekey, request_message);
//             return signature;
//           },
//         },
//       },
//     ],
//     asParams: [
//       {
//         callAsApiAtNodeId: 'proxy1',
//         asEventEmitter: proxy1EventEmitter,
//         asResponseParams: [
//           {
//             node_id: 'proxy1_as4',
//             reference_id: generateReferenceId(),
//             callback_url: config.PROXY1_CALLBACK_URL,
//             service_id: 'bank_statement',
//             data,
//           },
//         ],
//       },
//     ],
//   });
// });
