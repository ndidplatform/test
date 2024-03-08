import { proxy1Available } from '../..';

describe('Update node (keys) tests with external crypto service', function () {
  require('./update_node_ndid');
  require('./update_node_same_key_algo');
  require('./update_node_different_key_algo');
  require('./update_node_error');

  describe('Node behind proxy', function () {
    before(function () {
      if (!proxy1Available) {
        this.test.parent.pending = true;
        this.skip();
      }
    });

    require('./update_node_proxy_different_key_algo');
  });
});
