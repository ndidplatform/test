import { proxy1Available } from '../..';
import * as idpApi from '../../../api/v3/idp';
import * as config from '../../../config';
import { wait } from '../../../utils';

describe('Verify identity flow (no data request)', function() {
  require('./1_idp_accept_mode_1');
  require('./1_idp_accept_mode_2');
  require('./1_idp_accept_mode_3');
  require('./1_idp_reject_mode_1');
  require('./1_idp_reject_mode_2');
  require('./1_idp_reject_mode_3');
  require('./2_idp_accept_mode_3');
  require('./2_idp_1_accept_1_reject_mode_3');
  require('./2_idp_1_accept_1_reject_mode_1');
});

describe('Verify identity flow (no data request) (Node behind proxy)', function() {
  before(async function() {
    this.timeout(15000);
    if (!proxy1Available) {
      this.test.parent.pending = true;
      this.skip();
    }
    await idpApi.setCallbacks('proxy1', {
      incoming_request_status_update_url: config.PROXY1_CALLBACK_URL,
    });
    await wait(2000);
  });

  require('./proxy/1_idp_accept_mode_1_rp_behind_proxy');
  require('./proxy/1_idp_accept_mode_1_rp_idp_behind_proxy');
  require('./proxy/1_idp_accept_mode_3_rp_behind_proxy');
  require('./proxy/1_idp_accept_mode_3_rp_idp_behind_proxy');

  after(async function() {
    this.timeout(15000);
    await idpApi.setCallbacks('proxy1', {
      incoming_request_status_update_url: config.PROXY2_CALLBACK_URL,
    });
  });
});
