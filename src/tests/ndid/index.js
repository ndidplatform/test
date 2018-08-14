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
  require('./disable_enable_service_destination');
  require('./error_response');
});
