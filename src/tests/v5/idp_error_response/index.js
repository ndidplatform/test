import { ndidAvailable } from '../..';

describe('IdP create response with error code tests', function () {
  before(function () {
    if (!ndidAvailable) {
      this.test.parent.pending = true;
      this.skip();
    }
  });

  require('./idp_error_response_mode_1');
  require('./idp_error_response_mode_2');
  require('./idp_error_response_mode_3');
  require('./idp_error_response_identity_mode3_request');
});
