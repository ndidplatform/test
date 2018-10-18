import { proxy1Available } from '..';
import { wait } from '../../utils';

describe('Create identity', function() {
  require('./1st_idp');
  require('./2nd_idp');
  require('./lock_timeout');
  require('./update_identity_ial');
  require('./close_identity_request');
  require('./2nd_idp_create_identity_and_close_and_get_request_id');
  require('./error_response');

  after(async function() {
    //wait for identity to propagate (different abci/tendermint for idp/rp)
    await wait(1000);
  });
});

describe('Create identity (IdP behind proxy)', function() {
  before(function() {
    if (!proxy1Available) {
      this.test.parent.pending = true;
      this.skip();
    }
  });

  require('./proxy/1st_idp');

  after(async function() {
    //wait for identity to propagate (different abci/tendermint for idp/rp)
    await wait(1000);
  });
});
