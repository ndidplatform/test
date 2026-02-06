import * as config from '../../../config';

describe('KMS / external crypto service callback tests', function () {
  before(function () {
    if (!config.USE_EXTERNAL_CRYPTO_SERVICE) {
      this.test.parent.pending = true;
      this.skip();
    }
  });

  require('./sign');
  require('./decrypt');
});
