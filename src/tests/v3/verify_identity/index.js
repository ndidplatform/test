import { proxy1Available } from '../..';

describe('Verify identity flow (no data request)', function() {
  require('./1_idp_accept_mode_3');
  require('./1_idp_reject_mode_3');
  require('./1_idp_accept_mode_1');
  require('./1_idp_reject_mode_1');
  require('./2_idp_accept_mode_3');
  require('./2_idp_1_accept_1_reject_mode_3');
  require('./2_idp_1_accept_1_reject_mode_1');
});

// describe('Verify identity flow (no data request) (Node behind proxy)', function() {
//   before(function() {
//     if (!proxy1Available) {
//       this.test.parent.pending = true;
//       this.skip();
//     }
//   });

//   require('./proxy/1_idp_accept_mode_1_rp_behind_proxy');
//   require('./proxy/1_idp_accept_mode_1_rp_idp_behind_proxy');
//   require('./proxy/1_idp_accept_mode_3_rp_behind_proxy');
//   require('./proxy/1_idp_accept_mode_3_rp_idp_behind_proxy');
// });
