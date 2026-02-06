import { proxy1Available } from '../..';

describe('RP Create request tests', function () {
  require('./timeout');
  require('./short_timeout');
  require('./long_timeout');
  require('./close_request_2_times');
  require('./close_request_before_idp_response');
  require('./duplicate_reference_id');
  require('./get_request_id');
  require('./create_request');
  require('./error_response');
  require('./unqualified_to_response');
  require('./thai_id_validation');
});

describe('Proxy Create request tests', function () {
  before(function () {
    if (!proxy1Available) {
      this.test.parent.pending = true;
      this.skip();
    }
  });

  require('./proxy/create_request');
});