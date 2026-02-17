import { ndidAvailable } from '../../..';

describe('Domain', function () {
  before(function () {
    if (!ndidAvailable) {
      this.test.parent.pending = true;
      this.skip();
    }
  });
  require('./domain');
  require('./error_code');
});
