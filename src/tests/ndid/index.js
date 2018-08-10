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
  require('./error_response');
});
