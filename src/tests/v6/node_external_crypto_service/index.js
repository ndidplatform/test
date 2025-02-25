import * as config from '../../../config';

describe('Node external crypto service (KMS) tests', function () {
  before(function () {
    if (!config.USE_EXTERNAL_CRYPTO_SERVICE) {
      this.test.parent.pending = true;
      this.skip();
    }
  });

  require('./update_node');
});
