describe('Your Data', async function () {
  require('./as_setup');
  require('./as_service_setup');

  // normal scenarios
  require('./complete_success');
  require('./error_response');
  require('./as_response_through_callback');
  require('./request_timeout');

  // edge cases
  require('./multiple_as_data_responses'); // NOTE: each test run may not be deterministic
});
