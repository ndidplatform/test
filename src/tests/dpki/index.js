import * as config from '../../config';

describe('DPKI tests', function() {
  before(async function() {
    this.timeout(600000);
    if (!config.USE_EXTERNAL_CRYPTO_SERVICE) {
      this.test.parent.pending = true;
      this.skip();
    }
  });

  require('./update_node');
});
