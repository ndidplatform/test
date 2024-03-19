import { mode1FlowTest } from '../../_fragments/verify_identity_mode_1_flow';
import {
  proxy1EventEmitter,
  proxy2EventEmitter,
} from '../../../../callback_server';
import { generateReferenceId, createSignature } from '../../../../utils';
import * as config from '../../../../config';

describe('1 IdP, accept consent, mode 1, RP (proxy2_rp5) and IDP (proxy1_idp4) behind proxy', function() {
  mode1FlowTest({
    callRpApiAtNodeId: 'proxy2',
    rpEventEmitter: proxy2EventEmitter,
    createRequestParams: {
      node_id: 'proxy2_rp5',
      reference_id: generateReferenceId(),
      callback_url: config.PROXY2_CALLBACK_URL,
      mode: 1,
      namespace: 'citizen_id',
      identifier: '1345951597671',
      idp_id_list: ['proxy1_idp4'],
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
        callIdpApiAtNodeId: 'proxy1',
        idpEventEmitter: proxy1EventEmitter,
        idpResponseParams: {
          node_id: 'proxy1_idp4',
          reference_id: generateReferenceId(),
          callback_url: config.PROXY1_CALLBACK_URL,
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
  });
});

// describe('1 IdP, accept consent (idp response with signature), mode 1, RP (proxy2_rp5) and IDP (proxy1_idp4) behind proxy', function() {
//   mode1FlowTest({
//     callRpApiAtNodeId: 'proxy2',
//     rpEventEmitter: proxy2EventEmitter,
//     createRequestParams: {
//       node_id: 'proxy2_rp5',
//       reference_id: generateReferenceId(),
//       callback_url: config.PROXY2_CALLBACK_URL,
//       mode: 1,
//       namespace: 'citizen_id',
//       identifier: '1345951597671',
//       idp_id_list: ['proxy1_idp4'],
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
//         callIdpApiAtNodeId: 'proxy1',
//         idpEventEmitter: proxy1EventEmitter,
//         idpResponseParams: {
//           node_id: 'proxy1_idp4',
//           reference_id: generateReferenceId(),
//           callback_url: config.PROXY1_CALLBACK_URL,
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
