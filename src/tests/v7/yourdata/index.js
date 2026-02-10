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

  // TODO
  //
  require('./complete_success');

  // AS response through callback
  // - data
  // - error
});
