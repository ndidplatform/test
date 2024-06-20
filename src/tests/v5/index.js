describe('API v5', function () {
  require('./node_setup');
  require('./idp_setup');
  require('./as_service_setup');
  require('./kms_callback');
  require('./create_identity');
  require('./create_request');

  require('./node_external_crypto_service');

  require('./supported_ial');
  require('./supported_aal');
});
