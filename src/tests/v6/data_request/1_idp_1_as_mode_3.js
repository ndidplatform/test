import { mode2And3DataRequestFlowTest } from '../_fragments/data_request_mode_2_and_3_flow';
import {
  rpEventEmitter,
  idp1EventEmitter,
  as1EventEmitter,
} from '../../../callback_server';
import { generateReferenceId, createResponseSignature } from '../../../utils';
import * as db from '../../../db';
import * as config from '../../../config';

describe('1 IdP, 1 AS, mode 3', function() {
  const data = JSON.stringify({
    test: 'test',
    withEscapedChar: 'test|fff||ss\\|NN\\\\|',
    arr: [1, 2, 3],
  });

  mode2And3DataRequestFlowTest({
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
              identity.referenceGroupCode === referenceGroupCode
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
              request_message
            );
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

describe('1 IdP, 1 AS, mode 3 (as_id_list is empty array)', function() {
  const data = JSON.stringify({
    test: 'test',
    withEscapedChar: 'test|fff||ss\\|NN\\\\|',
    arr: [1, 2, 3],
  });

  mode2And3DataRequestFlowTest({
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
      data_request_list: [
        {
          service_id: 'bank_statement',
          as_id_list: [],
          min_as: 1,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
      ],
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
              identity.referenceGroupCode === referenceGroupCode
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
              request_message
            );
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

describe('1 IdP, 1 AS, mode 3 (without as_id_list key)', function() {
  const data = JSON.stringify({
    test: 'test',
    withEscapedChar: 'test|fff||ss\\|NN\\\\|',
    arr: [1, 2, 3],
  });

  mode2And3DataRequestFlowTest({
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
      data_request_list: [
        {
          service_id: 'bank_statement',
          min_as: 1,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
      ],
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
              identity.referenceGroupCode === referenceGroupCode
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
              request_message
            );
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

describe('1 IdP, 1 AS, mode 3 (without request_params key)', function() {
  const data = JSON.stringify({
    test: 'test',
    withEscapedChar: 'test|fff||ss\\|NN\\\\|',
    arr: [1, 2, 3],
  });

  mode2And3DataRequestFlowTest({
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
      data_request_list: [
        {
          service_id: 'bank_statement',
          as_id_list: ['as1'],
          min_as: 1,
        },
      ],
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
              identity.referenceGroupCode === referenceGroupCode
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
              request_message
            );
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

describe('1 IdP, 1 AS, mode 3 (with empty string request_params and request_message', function() {
  const data = JSON.stringify({
    test: 'test',
    withEscapedChar: 'test|fff||ss\\|NN\\\\|',
    arr: [1, 2, 3],
  });

  mode2And3DataRequestFlowTest({
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
      data_request_list: [
        {
          service_id: 'bank_statement',
          as_id_list: ['as1'],
          min_as: 1,
          request_params: '',
        },
      ],
      request_message: '',
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
              identity.referenceGroupCode === referenceGroupCode
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
              request_message
            );
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

// describe('1 IdP (idp response with signature), 1 AS, mode 3', function() {
//   const data = JSON.stringify({
//     test: 'test',
//     withEscapedChar: 'test|fff||ss\\|NN\\\\|',
//     arr: [1, 2, 3],
//   });

//   mode2And3DataRequestFlowTest({
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
//       data_request_list: [
//         {
//           service_id: 'bank_statement',
//           as_id_list: ['as1'],
//           min_as: 1,
//           request_params: JSON.stringify({
//             format: 'pdf',
//           }),
//         },
//       ],
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
//     asParams: [
//       {
//         callAsApiAtNodeId: 'as1',
//         asEventEmitter: as1EventEmitter,
//         asResponseParams: [
//           {
//             reference_id: generateReferenceId(),
//             callback_url: config.AS1_CALLBACK_URL,
//             service_id: 'bank_statement',
//             data,
//           },
//         ],
//       },
//     ],
//   });
// });

// describe('1 IdP (idp response with signature), 1 AS, mode 3 (with empty string request_params and request_message', function() {
//   const data = JSON.stringify({
//     test: 'test',
//     withEscapedChar: 'test|fff||ss\\|NN\\\\|',
//     arr: [1, 2, 3],
//   });

//   mode2And3DataRequestFlowTest({
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
//       data_request_list: [
//         {
//           service_id: 'bank_statement',
//           as_id_list: ['as1'],
//           min_as: 1,
//           request_params: '',
//         },
//       ],
//       request_message: '',
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
//     asParams: [
//       {
//         callAsApiAtNodeId: 'as1',
//         asEventEmitter: as1EventEmitter,
//         asResponseParams: [
//           {
//             reference_id: generateReferenceId(),
//             callback_url: config.AS1_CALLBACK_URL,
//             service_id: 'bank_statement',
//             data,
//           },
//         ],
//       },
//     ],
//   });
// });
