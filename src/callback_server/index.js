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

export let asSendDataThroughCallback = false;

export function setAsSendDataThroughCallback(sendThroughCallback) {
  asSendDataThroughCallback = sendThroughCallback;
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

export function startCallbackServers() {
  ndidServer = ndidApp.listen(config.NDID_CALLBACK_PORT);
  rpServer = rpApp.listen(config.RP_CALLBACK_PORT);
  idp1Server = idp1App.listen(config.IDP1_CALLBACK_PORT);
  idp2Server = idp2App.listen(config.IDP2_CALLBACK_PORT);
  as1Server = as1App.listen(config.AS1_CALLBACK_PORT);
  as2Server = as2App.listen(config.AS2_CALLBACK_PORT);
}

export function stopCallbackServers() {
  ndidServer.close();
  rpServer.close();
  idp1Server.close();
  idp2Server.close();
  as1Server.close();
  as2Server.close();
}
