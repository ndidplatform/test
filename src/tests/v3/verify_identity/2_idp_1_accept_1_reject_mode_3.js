import { mode2And3FlowTest } from '../_fragments/verify_identity_mode_2_and_3_flow';

import {
  rpEventEmitter,
  idp1EventEmitter,
  idp2EventEmitter,
} from '../../../callback_server';
import * as db from '../../../db';
import { generateReferenceId } from '../../../utils';
import { idp2Available } from '../../';
import * as config from '../../../config';

describe('2 IdPs, min_idp = 2, 1 IdP accept consent and 1 IdP reject consent mode 3', function() {
  before(function() {
    if (!idp2Available) {
      this.test.parent.pending = true;
      this.skip();
    }
  });
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
      // namespace,
      // identifier,
      idp_id_list: [],
      data_request_list: [],
      request_message:
        'Test request message (mode 3) ทดสอบภาษาไทย should\\|be|able\\\\|to|send\\\\\\|this',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 2,
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
          return identity.accessors[0].accessorId;
        },
        idpResponseParams: {
          reference_id: generateReferenceId(),
          callback_url: config.IDP1_CALLBACK_URL,
          // request_id: requestId,
          ial: 2.3,
          aal: 3,
          status: 'accept',
          // signature: createResponseSignature(
          //   identity.accessors[0].accessorPrivateKey,
          //   requestMessageHash
          // ),
          // accessor_id: identity.accessors[0].accessorId,
        },
      },
      {
        callIdpApiAtNodeId: 'idp2',
        idpEventEmitter: idp2EventEmitter,
        getAccessorForResponse: ({
          namespace,
          identifier,
          referenceGroupCode,
        }) => {
          const identity = db.idp2Identities.find(
            identity =>
              (identity.namespace === namespace &&
                identity.identifier === identifier) ||
              identity.referenceGroupCode === referenceGroupCode
          );
          return identity.accessors[0].accessorId;
        },
        idpResponseParams: {
          reference_id: generateReferenceId(),
          callback_url: config.IDP2_CALLBACK_URL,
          // request_id: requestId,
          ial: 2.3,
          aal: 3,
          status: 'reject',
          // signature: createResponseSignature(
          //   identity.accessors[0].accessorPrivateKey,
          //   requestMessageHash
          // ),
          // accessor_id: identity.accessors[0].accessorId,
        },
      },
    ],
  });
});
