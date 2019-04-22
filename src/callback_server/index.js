import EventEmitter from 'events';

import express from 'express';
import bodyParser from 'body-parser';

import * as db from '../db';
import * as utils from '../utils';
import * as config from '../config';

export const ndidEventEmitter = new EventEmitter();
export const rpEventEmitter = new EventEmitter();
export const idp1EventEmitter = new EventEmitter();
export const idp2EventEmitter = new EventEmitter();
export const as1EventEmitter = new EventEmitter();
export const as2EventEmitter = new EventEmitter();
export const proxy1EventEmitter = new EventEmitter();
export const proxy2EventEmitter = new EventEmitter();

export let asSendDataThroughCallback = false;
export let idpSignInvalidSignature = false;
let invalidPrivateKey;
let a =
  'Z557rgt9ZdGitBeoKm8eKjGEPEi4tt+GHID/At8asX+YWQGhJiHWjOXEe0VBXgmZdWz4qfYBXqwVaT8BhBtaEX0ussYWnTXxjFr6ifDbuJERLtZCIqPPpCmQxcByRvtTJl/RjswzHRqFqD/qMMrH2QIrO3FElcd5fhyGsHwZKmfy5eRQSsN7esiR0ncQCjiBWkQVg4n6LU4ofGpFUgta5NO6uc4wxuumN+hfnuznGdMsc4f6VhnTSr++kCvod1G6SMsViPnuZmSg4hO4T5pK8rnRMas3wLY/JsgArM5aPuw0zYWMEwBWpFgiVBqgyLS4U3kL9pGbsd7Z98v1Bh+ZYw==';

export function setAsSendDataThroughCallback(sendThroughCallback) {
  asSendDataThroughCallback = sendThroughCallback;
}

export function setIdPSignInvalidSignature(
  signInvalidSignature,
  privateKey = null
) {
  idpSignInvalidSignature = signInvalidSignature;
  invalidPrivateKey = privateKey;
}

/*
  NDID
*/
let ndidServer;
const ndidApp = express();
ndidApp.use(bodyParser.json({ limit: '2mb' }));

ndidApp.post('/ndid/callback', async function(req, res) {
  const callbackData = req.body;
  ndidEventEmitter.emit('callback', callbackData);
  res.status(204).end();
});

/*
  RP
*/
let rpServer;
const rpApp = express();
rpApp.use(bodyParser.json({ limit: '2mb' }));

rpApp.post('/rp/callback', async function(req, res) {
  const callbackData = req.body;
  rpEventEmitter.emit('callback', callbackData);
  res.status(204).end();
});

/*
  IdP-1
*/
let idp1Server;
const idp1App = express();
idp1App.use(bodyParser.json({ limit: '2mb' }));

idp1App.post('/idp/callback', async function(req, res) {
  const callbackData = req.body;
  idp1EventEmitter.emit('callback', callbackData);
  res.status(204).end();
});

idp1App.post('/idp/accessor/sign', async function(req, res) {
  const callbackData = req.body;
  idp1EventEmitter.emit('accessor_sign_callback', callbackData);

  const reference = db.createIdentityReferences.find(
    ref => ref.referenceId === callbackData.reference_id
  );
  res.status(200).json({
    signature: utils.createSignature(
      reference.accessorPrivateKey,
      callbackData.sid
    ),
  });
});

idp1App.post('/idp/accessor/encrypt', async function(req, res) {
  const callbackData = req.body;
  idp1EventEmitter.emit('accessor_encrypt_callback', callbackData);
  let accessorPrivateKey;
  db.idp1Identities.forEach(identity => {
    identity.accessors.forEach(accessor => {
      if (accessor.accessorId === callbackData.accessor_id) {
        accessorPrivateKey = accessor.accessorPrivateKey;
        return;
      }
      if (accessorPrivateKey) return;
    });
  });
  if (idpSignInvalidSignature) {
    res.status(200).json({
      signature: utils.createResponseSignature(
        invalidPrivateKey,
        callbackData.request_message_padded_hash
      ),
    });
  } else {
    res.status(200).json({
      signature: utils.createResponseSignature(
        accessorPrivateKey,
        callbackData.request_message_padded_hash
      ),
    });
  }
});

idp1App.post('/idp/identity/notification', async function(req, res) {
  const callbackData = req.body;
  idp1EventEmitter.emit('identity_notification_callback', callbackData);
  res.status(204).end();
});

/*
  IdP-2
*/
let idp2Server;
const idp2App = express();
idp2App.use(bodyParser.json({ limit: '2mb' }));

idp2App.post('/idp/callback', async function(req, res) {
  const callbackData = req.body;
  idp2EventEmitter.emit('callback', callbackData);
  res.status(204).end();
});

idp2App.post('/idp/accessor/sign', async function(req, res) {
  const callbackData = req.body;
  idp2EventEmitter.emit('accessor_sign_callback', callbackData);

  const reference = db.createIdentityReferences.find(
    ref => ref.referenceId === callbackData.reference_id
  );
  res.status(200).json({
    signature: utils.createSignature(
      reference.accessorPrivateKey,
      callbackData.sid
    ),
  });
});

idp2App.post('/idp/accessor/encrypt', async function(req, res) {
  const callbackData = req.body;
  idp2EventEmitter.emit('accessor_encrypt_callback', callbackData);
  let accessorPrivateKey;
  db.idp2Identities.forEach(identity => {
    identity.accessors.forEach(accessor => {
      if (accessor.accessorId === callbackData.accessor_id) {
        accessorPrivateKey = accessor.accessorPrivateKey;
        return;
      }
      if (accessorPrivateKey) return;
    });
  });
  res.status(200).json({
    signature: utils.createResponseSignature(
      accessorPrivateKey,
      callbackData.request_message_padded_hash
    ),
  });
});

idp2App.post('/idp/identity/notification', async function(req, res) {
  const callbackData = req.body;
  idp2EventEmitter.emit('identity_notification_callback', callbackData);
  res.status(204).end();
});

/*
  AS-1
*/
let as1Server;
const as1App = express();
as1App.use(bodyParser.json({ limit: '2mb' }));

as1App.post('/as/callback', async function(req, res) {
  const callbackData = req.body;
  if (callbackData.type === 'data_request' && asSendDataThroughCallback) {
    as1EventEmitter.emit('callback', callbackData, function(data) {
      res.status(200).json(data);
    });
  } else {
    as1EventEmitter.emit('callback', callbackData);
    res.status(204).end();
  }
});

/*
  AS-2
*/
let as2Server;
const as2App = express();
as2App.use(bodyParser.json({ limit: '2mb' }));

as2App.post('/as/callback', async function(req, res) {
  const callbackData = req.body;
  as2EventEmitter.emit('callback', callbackData);
  res.status(204).end();
});

/*
  Proxy-1
*/
let proxy1Server;
const proxy1App = express();
proxy1App.use(bodyParser.json({ limit: '2mb' }));

proxy1App.post('/proxy/callback', async function(req, res) {
  const callbackData = req.body;
  proxy1EventEmitter.emit('callback', callbackData);
  res.status(204).end();
});

proxy1App.post('/proxy/accessor/sign', async function(req, res) {
  const callbackData = req.body;
  proxy1EventEmitter.emit('accessor_sign_callback', callbackData);

  const reference = db.createIdentityReferences.find(
    ref => ref.referenceId === callbackData.reference_id
  );
  res.status(200).json({
    signature: utils.createSignature(
      reference.accessorPrivateKey,
      callbackData.sid
    ),
  });
});

/*
  Proxy-2
*/
let proxy2Server;
const proxy2App = express();
proxy2App.use(bodyParser.json({ limit: '2mb' }));

proxy2App.post('/proxy/callback', async function(req, res) {
  const callbackData = req.body;
  proxy2EventEmitter.emit('callback', callbackData);
  res.status(204).end();
});

proxy2App.post('/proxy/accessor/sign', async function(req, res) {
  const callbackData = req.body;
  proxy2EventEmitter.emit('accessor_sign_callback', callbackData);

  const reference = db.createIdentityReferences.find(
    ref => ref.referenceId === callbackData.reference_id
  );
  res.status(200).json({
    signature: utils.createSignature(
      reference.accessorPrivateKey,
      callbackData.sid
    ),
  });
});

export function startCallbackServers() {
  ndidServer = ndidApp.listen(config.NDID_CALLBACK_PORT);
  rpServer = rpApp.listen(config.RP_CALLBACK_PORT);
  idp1Server = idp1App.listen(config.IDP1_CALLBACK_PORT);
  idp2Server = idp2App.listen(config.IDP2_CALLBACK_PORT);
  as1Server = as1App.listen(config.AS1_CALLBACK_PORT);
  as2Server = as2App.listen(config.AS2_CALLBACK_PORT);
  proxy1Server = proxy1App.listen(config.PROXY1_CALLBACK_PORT);
  proxy2Server = proxy2App.listen(config.PROXY2_CALLBACK_PORT);
}

export function stopCallbackServers() {
  ndidServer.close();
  rpServer.close();
  idp1Server.close();
  idp2Server.close();
  as1Server.close();
  as2Server.close();
  proxy1Server.close();
  proxy2Server.close();
}
