import { ndidAvailable } from '..';

describe('NDID API', function() {
  before(function() {
    if (!ndidAvailable) {
      this.test.parent.pending = true;
      this.skip();
    }
  });

  require('./add_service');
  require('./update_node');
  require('./spent_and_refill_node_token');
  require('./error_response');
});
