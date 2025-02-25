describe('Supported AAL tests', function () {
  require('./create_request');
  require('./create_request_with_invalid_aal');

  //full flow
  require('./create_request_mode_1');
  require('./create_request_mode_2');
});
