describe('Request type tests', function () {
  require('./ndid_add_request_type');
  require('./ndid_remove_request_type');

  require('./create_request_with_type');
  require('./create_request_with_invalid_type');

  // full flow
  require('./create_request_with_type_mode_1');
});
