import { ndidAvailable } from '../..';
describe('NDID tests', function() {
  before(function() {
    if (!ndidAvailable) {
      this.test.parent.pending = true;
      this.skip();
    }
  });
  require('./add_namespace');
  require('./set_allowed_min_ial_for_register_identity_at_first_idp');
  require('./set_allowed_mode_list_for_create_request');
});
