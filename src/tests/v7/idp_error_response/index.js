import { ndidAvailable } from '../..';

describe('IdP create response with error code tests', function () {
  before(function () {
    if (!ndidAvailable) {
      this.test.parent.pending = true;
      this.skip();
    }
  });

  //Must run this file to prepare identity for test
  require('./create_identity_before_test');

  require('./idp_error_response_mode_1');
  require('./idp_error_response_mode_2');
  require('./idp_error_response_mode_3');
  require('./idp_error_response_identity_mode3_request');

  require('./idp_error_response_error');
});
