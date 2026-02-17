import { ndidAvailable } from '../..';
import { wait } from '../../../utils';

describe('Your Data', async function () {
  // this.timeout(10000);
  // before(async function () {
  //   if (!ndidAvailable) {
  //     this.test.parent.pending = true;
  //     this.skip();
  //   }
  //   //wait untill all token settle
  //   await wait(8000);
  // });

  require('./as_setup');
  require('./as_service_setup');

  // TODO
  //
  require('./complete_success');
  require('./error_response');
  require('./request_timeout');

  // AS response through callback
  // - data
  // - error
});
