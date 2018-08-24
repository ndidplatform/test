import { ndidAvailable } from '..';

describe('Token tests', function() {
  before(function() {
    if (!ndidAvailable) {
      this.test.parent.pending = true;
      this.skip();
    }
  });

  require('./node_token');
  require('./spend_and_refill_node_token');

});
