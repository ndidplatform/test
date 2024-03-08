import { expect } from 'chai';

import { mode1FlowTest } from '../_fragments/verify_identity_mode_1_flow';
import { rpEventEmitter, idp3EventEmitter } from '../../../callback_server';
import { generateReferenceId, wait } from '../../../utils';
import * as config from '../../../config';
import * as commonApi from '../../../api/v6/common';
import * as ndidApi from '../../../api/v6/ndid';
import { ndidAvailable, idp3Available } from '../..';

describe('RP create request mode 1 to IdP agent test', function () {
  before(function () {
    if (!ndidAvailable || !idp3Available) {
      this.skip();
    }
  });

  describe('NDID should update IdP node to IdP agent', function () {
    it('NDID should update IdP node to IdP agent successfully', async function () {
      this.timeout(10000);
      const response = await ndidApi.updateNode('ndid1', {
        node_id: 'idp3',
        agent: true,
      });
      expect(response.status).to.equal(204);

      await wait(3000);

      const responseGetNodeInfo = await commonApi.getNodeInfo('ndid1', {
        node_id: 'idp3',
      });
      const responseBody = await responseGetNodeInfo.json();
      expect(responseGetNodeInfo.status).to.equal(200);
      expect(responseBody.agent).to.be.true;
    });

    it('Should get all IdP filter by agent = true successfully', async function () {
      this.timeout(10000);
      const response = await commonApi.getIdP('ndid1', { agent: true });
      const responseBody = await response.json();
      expect(response.status).to.equal(200);
      expect(responseBody).to.be.an('array');
      expect(responseBody).to.have.length(1);
      expect(responseBody[0].node_id).to.equal('idp3');
    });
  });

  describe('1 IdP (idp3 is agent), accept consent, mode 1', function () {
    mode1FlowTest({
      callRpApiAtNodeId: 'rp1',
      rpEventEmitter,
      createRequestParams: {
        reference_id: generateReferenceId(),
        callback_url: config.RP_CALLBACK_URL,
        mode: 1,
        namespace: 'citizen_id',
        identifier: '1234567890123',
        idp_id_list: ['idp3'],
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
          callIdpApiAtNodeId: 'idp3',
          idpEventEmitter: idp3EventEmitter,
          idpResponseParams: {
            reference_id: generateReferenceId(),
            callback_url: config.IDP3_CALLBACK_URL,
            ial: 2.3,
            aal: 3,
            status: 'accept',
          },
        },
      ],
    });
  });

  after(async function () {
    this.timeout(15000);
    const response = await ndidApi.updateNode('ndid1', {
      node_id: 'idp3',
      agent: false,
    });
    expect(response.status).to.equal(204);
    await wait(3000);
  });
});
