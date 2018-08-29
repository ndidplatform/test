import { ndidAvailable } from '..';
import { wait } from '../../utils';

describe('Token tests', async function() {
  this.timeout(10000)
  before(async function() {
    if (!ndidAvailable) {
      this.test.parent.pending = true;
      this.skip();
    }
    //wait untill all token settle 
    await wait(8000);
  });

  require('./node_token');
  require('./spend_and_refill_node_token');

});
