import {
  startCallbackServers,
  stopCallbackServers,
} from '../callback_server';

describe('End-to-End NDID API test', function() {
  before(function() {
    startCallbackServers();
  });

  require('./idp_setup');
  require('./create_identity');
  require('./verify_identity');

  after(function() {
    stopCallbackServers();
  });
});