import EventEmitter from 'events';

import express from 'express';
import bodyParser from 'body-parser';

import * as db from '../db';
import * as utils from '../utils';
import * as config from '../config';

export const rpEventEmitter = new EventEmitter();
export const idpEventEmitter = new EventEmitter();
export const asEventEmitter = new EventEmitter();

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
  IdP
*/
let idpServer;
const idpApp = express();
idpApp.use(bodyParser.json({ limit: '2mb' }));

idpApp.post('/idp/callback', async function(req, res) {
  const callbackData = req.body;
  idpEventEmitter.emit('callback', callbackData);
  res.status(204).end();
});

idpApp.post('/idp/accessor/sign', async function(req, res) {
  const callbackData = req.body;
  idpEventEmitter.emit('accessor_sign_callback', callbackData);

  const reference = db.createIdentityReferences.find(
    (ref) => ref.referenceId === callbackData.reference_id
  );
  res.status(200).json({
    signature: utils.createSignature(
      reference.accessorPrivateKey,
      callbackData.sid
    ),
  });
});

/*
  AS
*/
let asServer;
const asApp = express();
asApp.use(bodyParser.json({ limit: '2mb' }));

asApp.post('/as/callback', async function(req, res) {
  const callbackData = req.body;
  asEventEmitter.emit('callback', callbackData);
  res.status(204).end();
});

export function startCallbackServers() {
  rpServer = rpApp.listen(config.RP_CALLBACK_PORT);
  idpServer = idpApp.listen(config.IDP_CALLBACK_PORT);
  asServer = asApp.listen(config.AS_CALLBACK_PORT);
}

export function stopCallbackServers() {
  rpServer.close();
  idpServer.close();
  asServer.close();
}
