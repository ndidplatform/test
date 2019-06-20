import { mode1FlowTest } from '../_fragments/verify_identity_mode_1_flow';

import {
  rpEventEmitter,
  idp1EventEmitter,
  idp2EventEmitter,
} from '../../../callback_server';
import { generateReferenceId } from '../../../utils';
import * as config from '../../../config';
import { idp2Available } from '../..';

describe('2 IdPs, min_idp = 2, 1 IdP accept consent and 1 IdP reject consent mode 1', function() {
  before(function() {
    if (!idp2Available) {
      this.test.parent.pending = true;
      this.skip();
    }
  });
  mode1FlowTest({
    callRpApiAtNodeId: 'rp1',
    rpEventEmitter,
    createRequestParams: {
      reference_id: generateReferenceId(),
      callback_url: config.RP_CALLBACK_URL,
      mode: 1,
      namespace: 'citizen_id',
      identifier: '1234567890123',
      idp_id_list: ['idp1', 'idp2'],
      data_request_list: [],
      request_message:
        'Test request message (mode 1) ทดสอบภาษาไทย should\\|be|able\\\\|to|send\\\\\\|this',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 2,
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
      {
        callIdpApiAtNodeId: 'idp2',
        idpEventEmitter: idp2EventEmitter,
        idpResponseParams: {
          reference_id: generateReferenceId(),
          callback_url: config.IDP2_CALLBACK_URL,
          ial: 2.3,
          aal: 3,
          status: 'reject',
        },
      },
    ],
  });
});
