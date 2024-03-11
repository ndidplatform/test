import { ndidAvailable } from '../..';

describe('NDID API tests', function () {
  before(function () {
    if (!ndidAvailable) {
      this.test.parent.pending = true;
      this.skip();
    }
  });

  require('./on_the_fly_support');
});
