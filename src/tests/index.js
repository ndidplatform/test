import { startCallbackServers, stopCallbackServers } from '../callback_server';

describe('End-to-End NDID API test (API v2)', function() {
  before(function() {
    startCallbackServers();
  });

  require('./idp_setup');
  require('./create_identity');
  require('./verify_identity');
  require('./as_service_setup');
  require('./data_request');

  after(function() {
    stopCallbackServers();
  });
});
