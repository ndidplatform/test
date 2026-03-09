describe('Your Data', function () {
  require('./as_setup');
  require('./as_service_setup');

  // create signed token
  require('./create_signed_token');

  // normal scenarios
  require('./complete_success');
  require('./error_response');
  require('./as_response_through_callback');
  require('./request_timeout');

  // decryption key retry scenarios
  //
  // IMPORTANT: need code modification
  //
  // require('./data_decryption_key_retry');

  // edge cases
  require('./multiple_as_data_responses'); // NOTE: each test run may not be deterministic

  require('./create_request');
  require('./as_response');
});
