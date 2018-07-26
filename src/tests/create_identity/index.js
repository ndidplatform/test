import { wait } from '../../utils';

describe('Create identity', function() {
  require('./1st_idp');
  require('./1st_idp_lock');
  require('./2nd_idp');

  after(async function() {
    //wait for identity to propagate (different abci/tendermint for idp/rp)
    await wait(1000);
  });

});