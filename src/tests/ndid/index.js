import { ndidAvailable } from '..';

describe('NDID API tests', function() {
  before(function() {
    if (!ndidAvailable) {
      this.test.parent.pending = true;
      this.skip();
    }
  });

  require('./add_namespace');
  require('./add_service');
  require('./update_node');
  require('./error_response');
});
