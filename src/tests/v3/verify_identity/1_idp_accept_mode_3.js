import { mode2And3FlowTest } from '../_fragments/verify_identity_mode_2_and_3_flow';

import { rpEventEmitter, idp1EventEmitter } from '../../../callback_server';
import * as db from '../../../db';
import { generateReferenceId, createResponseSignature } from '../../../utils';
import * as config from '../../../config';

describe('1 IdP, accept consent, mode 3', function() {
  mode2And3FlowTest({
    callRpApiAtNodeId: 'rp1',
    rpEventEmitter,
    getIdentityForRequest: () => {
      return db.idp1Identities.find(identity => identity.mode === 3);
    },
    createRequestParams: {
      reference_id: generateReferenceId(),
      callback_url: config.RP_CALLBACK_URL,
      mode: 3,
      idp_id_list: [],
      data_request_list: [],
      request_message:
        'Test request message (mode 3) ทดสอบภาษาไทย should\\|be|able\\\\|to|send\\\\\\|this',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
      bypass_identity_check: false,
    },
    idpParams: [
      {
        callIdpApiAtNodeId: 'idp1',
        idpEventEmitter: idp1EventEmitter,
        getAccessorForResponse: ({
          namespace,
          identifier,
          referenceGroupCode,
        }) => {
          const identity = db.idp1Identities.find(
            identity =>
              (identity.namespace === namespace &&
                identity.identifier === identifier) ||
              identity.referenceGroupCode === referenceGroupCode,
          );
          return identity.accessors[0];
        },
        idpResponseParams: {
          reference_id: generateReferenceId(),
          callback_url: config.IDP1_CALLBACK_URL,
          ial: 2.3,
          aal: 3,
          status: 'accept',
          createResponseSignature: (privatekey, request_message) => {
            const signature = createResponseSignature(
              privatekey,
              request_message,
            );
            return signature;
          },
        },
      },
    ],
  });
});

describe('1 IdP, accept consent, mode 3 (without idp_id_list key and data_request_list key)', function() {
  mode2And3FlowTest({
    callRpApiAtNodeId: 'rp1',
    rpEventEmitter,
    getIdentityForRequest: () => {
      return db.idp1Identities.find(identity => identity.mode === 3);
    },
    createRequestParams: {
      reference_id: generateReferenceId(),
      callback_url: config.RP_CALLBACK_URL,
      mode: 3,
      request_message:
        'Test request message (mode 3) ทดสอบภาษาไทย should\\|be|able\\\\|to|send\\\\\\|this',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
      bypass_identity_check: false,
    },
    idpParams: [
      {
        callIdpApiAtNodeId: 'idp1',
        idpEventEmitter: idp1EventEmitter,
        getAccessorForResponse: ({
          namespace,
          identifier,
          referenceGroupCode,
        }) => {
          const identity = db.idp1Identities.find(
            identity =>
              (identity.namespace === namespace &&
                identity.identifier === identifier) ||
              identity.referenceGroupCode === referenceGroupCode,
          );
          return identity.accessors[0];
        },
        idpResponseParams: {
          reference_id: generateReferenceId(),
          callback_url: config.IDP1_CALLBACK_URL,
          ial: 2.3,
          aal: 3,
          status: 'accept',
          createResponseSignature: (privatekey, request_message) => {
            const signature = createResponseSignature(
              privatekey,
              request_message,
            );
            return signature;
          },
        },
      },
    ],
  });
});

// describe('1 IdP, accept consent (idp response with signature), mode 3', function() {
//   mode2And3FlowTest({
//     callRpApiAtNodeId: 'rp1',
//     rpEventEmitter,
//     getIdentityForRequest: () => {
//       return db.idp1Identities.find(identity => identity.mode === 3);
//     },
//     createRequestParams: {
//       reference_id: generateReferenceId(),
//       callback_url: config.RP_CALLBACK_URL,
//       mode: 3,
//       idp_id_list: [],
//       data_request_list: [],
//       request_message:
//         'Test request message (mode 3) ทดสอบภาษาไทย should\\|be|able\\\\|to|send\\\\\\|this',
//       min_ial: 1.1,
//       min_aal: 1,
//       min_idp: 1,
//       request_timeout: 86400,
//       bypass_identity_check: false,
//     },
//     idpParams: [
//       {
//         callIdpApiAtNodeId: 'idp1',
//         idpEventEmitter: idp1EventEmitter,
//         getAccessorForResponse: ({
//           namespace,
//           identifier,
//           referenceGroupCode,
//         }) => {
//           const identity = db.idp1Identities.find(
//             identity =>
//               (identity.namespace === namespace &&
//                 identity.identifier === identifier) ||
//               identity.referenceGroupCode === referenceGroupCode
//           );
//           return identity.accessors[0];
//         },
//         idpResponseParams: {
//           reference_id: generateReferenceId(),
//           callback_url: config.IDP1_CALLBACK_URL,
//           ial: 2.3,
//           aal: 3,
//           status: 'accept',
//           createResponseSignature: (privatekey, request_message) => {
//             const signature = createResponseSignature(
//               privatekey,
//               request_message
//             );
//             return signature;
//           },
//         },
//       },
//     ],
//   });
// });

// describe('1 IdP, accept consent (idp response with signature), mode 3 (without idp_id_list key and data_request_list key)', function() {
//   mode2And3FlowTest({
//     callRpApiAtNodeId: 'rp1',
//     rpEventEmitter,
//     getIdentityForRequest: () => {
//       return db.idp1Identities.find(identity => identity.mode === 3);
//     },
//     createRequestParams: {
//       reference_id: generateReferenceId(),
//       callback_url: config.RP_CALLBACK_URL,
//       mode: 3,
//       request_message:
//         'Test request message (mode 3) ทดสอบภาษาไทย should\\|be|able\\\\|to|send\\\\\\|this',
//       min_ial: 1.1,
//       min_aal: 1,
//       min_idp: 1,
//       request_timeout: 86400,
//       bypass_identity_check: false,
//     },
//     idpParams: [
//       {
//         callIdpApiAtNodeId: 'idp1',
//         idpEventEmitter: idp1EventEmitter,
//         getAccessorForResponse: ({
//           namespace,
//           identifier,
//           referenceGroupCode,
//         }) => {
//           const identity = db.idp1Identities.find(
//             identity =>
//               (identity.namespace === namespace &&
//                 identity.identifier === identifier) ||
//               identity.referenceGroupCode === referenceGroupCode
//           );
//           return identity.accessors[0];
//         },
//         idpResponseParams: {
//           reference_id: generateReferenceId(),
//           callback_url: config.IDP1_CALLBACK_URL,
//           ial: 2.3,
//           aal: 3,
//           status: 'accept',
//           createResponseSignature: (privatekey, request_message) => {
//             const signature = createResponseSignature(
//               privatekey,
//               request_message
//             );
//             return signature;
//           },
//         },
//       },
//     ],
//   });
// });
