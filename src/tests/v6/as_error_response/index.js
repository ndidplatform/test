import { ndidAvailable } from '../..';

describe('AS response with error code tests', function () {
  before(function () {
    if (!ndidAvailable) {
      this.test.parent.pending = true;
      this.skip();
    }
  });
  require('./as_error_response_mode_1');
  require('./as_error_response_mode_2');

  require('./as_error_response_error');
});
