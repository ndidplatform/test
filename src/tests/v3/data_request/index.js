import { proxy1Available } from '../..';

describe('Data request flow', function() {
  require('./1_idp_1_as_mode_1');
  require('./1_idp_1_as_mode_2');
  require('./1_idp_1_as_mode_3');
  require('./2_idp_1_as_mode_3');
  require('./1_idp_1_as_2_services_mode_3');
  require('./1_idp_2_as_1_service_mode_3');
  require('./1_idp_2_as_2_service_mode_3');
  require('./large_data_size');
  require('./large_data_size_response_through_callback');
  require('./too_large_data_size_response_through_callback');
  require('./base64_data_url_data');
});

describe('Data request flow (Node behind proxy)', function() {
  before(function() {
    if (!proxy1Available) {
      this.test.parent.pending = true;
      this.skip();
    }
  });

  require('./proxy/1_idp_1_as_mode_1_as_behind_proxy');
  require('./proxy/1_idp_1_as_mode_3_as_behind_proxy');
});
