import { as1Available, as2Available } from '../..';

describe('(AS) Data response tests', function() {
  before(function() {
    if (!as1Available || !as2Available) {
      this.test.parent.pending = true;
      this.skip();
    }
  });

  require('./error_response');
  require('./error_callback_response');
  require('./data_response_final_stage');
});
