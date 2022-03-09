import { mode2And3DataRequestFlowTest } from '../_fragments/data_request_mode_2_and_3_flow';
import {
  rpEventEmitter,
  idp1EventEmitter,
  as1EventEmitter,
  as2EventEmitter,
  proxy1EventEmitter,
} from '../../../callback_server';
import { generateReferenceId, createResponseSignature } from '../../../utils';
import { as2Available, proxy1Available } from '../../';
import * as db from '../../../db';
import * as config from '../../../config';

describe('No min AS, 2 AS, 1 Service, mode 2', function () {
  before(function () {
    if (!as2Available) {
      this.test.parent.pending = true;
      this.skip();
    }
  });

  const data = JSON.stringify({
    test: 'test',
    withEscapedChar: 'test|fff||ss\\|NN\\\\|',
    arr: [1, 2, 3],
  });

  mode2And3DataRequestFlowTest({
    callRpApiAtNodeId: 'rp1',
    rpEventEmitter,
    getIdentityForRequest: () => {
      return db.idp1Identities.find((identity) => identity.mode === 2);
    },
    createRequestParams: {
      reference_id: generateReferenceId(),
      callback_url: config.RP_CALLBACK_URL,
      mode: 2,
      idp_id_list: [],
      data_request_list: [
        {
          service_id: 'bank_statement',
          as_id_list: ['as1', 'as2'],
          min_as: 0,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
      ],
      request_message:
        'Test request message (data request 1 IdP, 2 AS, 1 Service) (mode 3)',
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
            (identity) =>
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
      {
        callAsApiAtNodeId: 'as2',
        asEventEmitter: as2EventEmitter,
        asResponseParams: [
          {
            reference_id: generateReferenceId(),
            callback_url: config.AS2_CALLBACK_URL,
            service_id: 'bank_statement',
            data,
          },
        ],
      },
    ],
  });
});

describe('No min AS, unspecified AS list, 1 Service, mode 2', function () {
  before(function () {
    if (!as2Available || !proxy1Available) {
      this.test.parent.pending = true;
      this.skip();
    }
  });

  const data = JSON.stringify({
    test: 'test',
    withEscapedChar: 'test|fff||ss\\|NN\\\\|',
    arr: [1, 2, 3],
  });

  mode2And3DataRequestFlowTest({
    callRpApiAtNodeId: 'rp1',
    rpEventEmitter,
    getIdentityForRequest: () => {
      return db.idp1Identities.find((identity) => identity.mode === 2);
    },
    createRequestParams: {
      reference_id: generateReferenceId(),
      callback_url: config.RP_CALLBACK_URL,
      mode: 2,
      idp_id_list: [],
      data_request_list: [
        {
          service_id: 'bank_statement',
          as_id_list: [],
          min_as: 0,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
      ],
      request_message:
        'Test request message (data request 1 IdP, 2 AS, 1 Service) (mode 3)',
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
            (identity) =>
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
      {
        callAsApiAtNodeId: 'as2',
        asEventEmitter: as2EventEmitter,
        asResponseParams: [
          {
            reference_id: generateReferenceId(),
            callback_url: config.AS2_CALLBACK_URL,
            service_id: 'bank_statement',
            data,
          },
        ],
      },
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

describe('No min AS, 2 AS, with error response, 1 Service, mode 2', function () {
  before(function () {
    if (!as2Available) {
      this.test.parent.pending = true;
      this.skip();
    }
  });

  const data = JSON.stringify({
    test: 'test',
    withEscapedChar: 'test|fff||ss\\|NN\\\\|',
    arr: [1, 2, 3],
  });

  mode2And3DataRequestFlowTest({
    callRpApiAtNodeId: 'rp1',
    rpEventEmitter,
    getIdentityForRequest: () => {
      return db.idp1Identities.find((identity) => identity.mode === 2);
    },
    createRequestParams: {
      reference_id: generateReferenceId(),
      callback_url: config.RP_CALLBACK_URL,
      mode: 2,
      idp_id_list: [],
      data_request_list: [
        {
          service_id: 'bank_statement',
          as_id_list: ['as1', 'as2'],
          min_as: 0,
          request_params: JSON.stringify({
            format: 'pdf',
          }),
        },
      ],
      request_message:
        'Test request message (data request 1 IdP, 2 AS, 1 Service) (mode 3)',
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
            (identity) =>
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
      {
        callAsApiAtNodeId: 'as2',
        asEventEmitter: as2EventEmitter,
        asResponseParams: [
          {
            reference_id: generateReferenceId(),
            callback_url: config.AS2_CALLBACK_URL,
            service_id: 'bank_statement',
            data,
          },
        ],
      },
    ],
  });
});
