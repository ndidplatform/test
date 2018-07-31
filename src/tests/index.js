import { startCallbackServers, stopCallbackServers } from '../callback_server';
import {
  startCallbackServer as startDpkiCallbackServer,
  stopCallbackServer as stopDpkiCallbackServer,
} from '../callback_server/dpki';
import { isNodeAvailable } from '../helpers';
import * as config from '../config';

export let rpAvailable;
export let idp1Available;
export let idp2Available;
export let as1Available;
export let as2Available;

async function checkForAvailableNodes() {
  const [
    _rpAvailable,
    _idp1Available,
    _idp2Available,
    _as1Available,
    _as2Available,
  ] = await Promise.all([
    isNodeAvailable('rp1'),
    isNodeAvailable('idp1'),
    isNodeAvailable('idp2'),
    isNodeAvailable('as1'),
    isNodeAvailable('as2'),
  ]);

  rpAvailable = _rpAvailable;
  idp1Available = _idp1Available;
  idp2Available = _idp2Available;
  as1Available = _as1Available;
  as2Available = _as2Available;
}

describe('End-to-End NDID API test (API v2)', function() {
  before(async function() {
    startCallbackServers();
    if (config.USE_EXTERNAL_CRYPTO_SERVICE) {
      startDpkiCallbackServer();
    }
    await checkForAvailableNodes();
    if (!rpAvailable || !idp1Available) {
      throw new Error('Could not connect to RP and IdP-1 nodes');
    }
  });

  require('./dpki_setup');
  require('./idp_setup');
  require('./as_service_setup');
  require('./create_identity');
  require('./verify_identity');
  require('./data_request');
  require('./create_request');
  require('./as_data_response');

  after(function() {
    stopCallbackServers();
    if (config.USE_EXTERNAL_CRYPTO_SERVICE) {
      stopDpkiCallbackServer();
    }
  });
});
