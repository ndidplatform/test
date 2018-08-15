import { ndidAvailable } from '..';

describe('NDID API', function() {
  before(function() {
    if (!ndidAvailable) {
      this.test.parent.pending = true;
      this.skip();
    }
  });

  require('./add_namespace');
  require('./add_service');
  require('./update_node');
  require('./disable_enable_service');
  require('./disable_enable_service_destination_by_ndid');
  require('./disable_enable_namespace');
  require('./error_response');
});
