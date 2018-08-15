import { ndidAvailable } from '..';

describe('NDID disable and enable tests', function() {
  before(function() {
    if (!ndidAvailable) {
      this.test.parent.pending = true;
      this.skip();
    }
  });
  
  require('./disable_namespace');
  require('./enable_namespace');
  require('./disable_service');
  require('./enable_service');
  
});
