import { ndidAvailable } from '..';

describe('NDID disable and enable tests', function() {
  before(function() {
    if (!ndidAvailable) {
      this.test.parent.pending = true;
      this.skip();
    }
  });
  require('./disable_first_idp');
  require('./disable_enable_node');
  require('./disable_namespace');
  require('./enable_namespace');
  require('./disable_service');
  require('./enable_service');
  require('./disable_service_destination');
  require('./enable_service_destination');
});
