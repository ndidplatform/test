import { ndidAvailable } from '../..';
import { proxy1Available } from '../..';

describe('NDID API tests', function () {
  before(function () {
    if (!ndidAvailable) {
      this.test.parent.pending = true;
      this.skip();
    }
  });
  require('./add_namespace');
  require('./add_service');
  require('./add_service_with_data_schema');
  require('./update_node');
  require('./set_allowed_min_ial_for_register_identity_at_first_idp');
  require('./set_allowed_mode_list_for_create_request');
  require('./error_response');
  require('./on_the_fly_support');
});

describe('NDID API tests (proxy)', function () {
  before(function () {
    if (!proxy1Available || !ndidAvailable) {
      this.test.parent.pending = true;
      this.skip();
    }
  });
  require('./proxy/add_and_remove_RP_node_from_proxy_node');
  require('./proxy/add_and_remove_IdP_node_from_proxy_node');
  require('./proxy/add_and_remove_AS_node_from_proxy_node');
  require('./proxy/update_node_proxy_node');
  require('./proxy/error_response');
});
