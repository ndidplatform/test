import * as config from '../../../config';

describe('Node external crypto service (KMS) tests', function() {
  before(async function() {
    this.timeout(5000);
    if (!config.USE_EXTERNAL_CRYPTO_SERVICE) {
      this.test.parent.pending = true;
      this.skip();
    }
  });

  require('./update_node');
});
