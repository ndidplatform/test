describe('Supported IAL tests', function () {
  require('./ndid_set_supported_ial');

  require('./create_request');
  require('./create_request_with_invalid_ial');
  // full flow
  require('./create_request_mode_1');

  require('./create_identity');
  require('./create_identity_with_invalid_ial');
});
