import { proxy1Available } from '..';
import { wait } from '../../utils';

describe('Create identity', function() {
  require('./1st_idp');
  require('./2nd_idp');
  // require('./lock_timeout');
  // require('./update_identity_ial');
  // require('./reject_2nd_IdP_create_identity');
  // require('./duplicate_reference_id');
  // require('./close_identity_request');
  // require('./error_response');

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

  // require('./proxy/1st_idp');

  after(async function() {
    //wait for identity to propagate (different abci/tendermint for idp/rp)
    await wait(1000);
  });
});
