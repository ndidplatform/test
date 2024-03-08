import { proxy1Available } from '../..';

describe('RP Create message tests', function () {
  require('./duplicate_reference_id');
  require('./create_message');
  require('./error_response');
});

describe('Proxy Create message tests', function () {
  before(function () {
    if (!proxy1Available) {
      this.test.parent.pending = true;
      this.skip();
    }
  });

  require('./proxy/create_message');
});