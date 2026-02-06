import { mode1FlowTest } from '../_fragments/verify_identity_mode_1_flow';

import { rpEventEmitter, idp1EventEmitter } from '../../../callback_server';
import { generateReferenceId, createSignature } from '../../../utils';
import * as config from '../../../config';

describe('1 IdP, accept consent, mode 1', function() {
  mode1FlowTest({
    callRpApiAtNodeId: 'rp1',
    rpEventEmitter,
    createRequestParams: {
      reference_id: generateReferenceId(),
      callback_url: config.RP_CALLBACK_URL,
      mode: 1,
      namespace: 'citizen_id',
      identifier: '1345951597671',
      idp_id_list: ['idp1'],
      data_request_list: [],
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
        },
      },
    ],
  });
});

describe('1 IdP, accept consent, mode 1 (with empty string request_message)', function() {
  mode1FlowTest({
    callRpApiAtNodeId: 'rp1',
    rpEventEmitter,
    createRequestParams: {
      reference_id: generateReferenceId(),
      callback_url: config.RP_CALLBACK_URL,
      mode: 1,
      namespace: 'citizen_id',
      identifier: '1345951597671',
      idp_id_list: ['idp1'],
      data_request_list: [],
      request_message: '',
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
        },
      },
    ],
  });
});

// describe('1 IdP, accept consent (idp response with signature), mode 1', function() {
//   mode1FlowTest({
//     callRpApiAtNodeId: 'rp1',
//     rpEventEmitter,
//     createRequestParams: {
//       reference_id: generateReferenceId(),
//       callback_url: config.RP_CALLBACK_URL,
//       mode: 1,
//       namespace: 'citizen_id',
//       identifier: '1345951597671',
//       idp_id_list: ['idp1'],
//       data_request_list: [],
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
//   });
// });

// describe('1 IdP, accept consent (idp response with signature), mode 1 (with empty string request_message)', function() {
//   mode1FlowTest({
//     callRpApiAtNodeId: 'rp1',
//     rpEventEmitter,
//     createRequestParams: {
//       reference_id: generateReferenceId(),
//       callback_url: config.RP_CALLBACK_URL,
//       mode: 1,
//       namespace: 'citizen_id',
//       identifier: '1345951597671',
//       idp_id_list: ['idp1'],
//       data_request_list: [],
//       request_message: '',
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
//         },
//       },
//     ],
//   });
// });
