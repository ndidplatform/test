import { as1Available } from '..';

describe('Data request flow', function() {
  before(function() {
    if (!as1Available) {
      this.test.parent.pending = true;
      this.skip();
    }
  });

  require('./1_idp_1_as_mode_3');
  require('./1_idp_1_as_mode_1');
  require('./1_idp_1_as_2_services_mode_3');
  require('./large_data_size');
});
