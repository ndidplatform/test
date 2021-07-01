import { proxy1Available } from '../..';
import { wait } from '../../../utils';

describe('Create identity', function() {
  require('./1st_idp_mode_2');
  require('./2nd_idp_mode_2');
  require('./1st_idp_mode_3');
  require('./2nd_idp_mode_3');
  require('./1st_idp_mode_2_2nd_idp_mode_3');
  require('./1st_idp_mode_3_2nd_idp_mode_2');
  require('./create_multiple_identifier_mode_2');
  require('./create_multiple_identifier_mode_3');
  require('./update_identity_ial');
  require('./update_identity_lial');
  require('./update_identity_laal');
  require('./reject_2nd_IdP_create_identity');
  require('./duplicate_reference_id');
  require('./close_identity_request');
  require('./error_response');
  // require('./lock_timeout'); // UNUSED TEST CASE
});

describe('Create identity (IdP behind proxy)', function() {
  before(function() {
    if (!proxy1Available) {
      this.test.parent.pending = true;
      this.skip();
    }
  });

  require('./proxy/1st_idp_mode_2');
  require('./proxy/1st_idp_mode_3');

  after(async function() {
    //wait for identity to propagate (different abci/tendermint for idp/rp)
    await wait(1000);
  });
});