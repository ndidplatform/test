import EventEmitter from 'events';

import express from 'express';
import bodyParser from 'body-parser';

import * as db from '../db';
import * as utils from '../utils';
import * as config from '../config';

export const ndidEventEmitter = new EventEmitter();
export const rpEventEmitter = new EventEmitter();
export const rp2EventEmitter = new EventEmitter();
export const idp1EventEmitter = new EventEmitter();
export const idp2EventEmitter = new EventEmitter();
export const idp3EventEmitter = new EventEmitter();
export const as1EventEmitter = new EventEmitter();
export const as2EventEmitter = new EventEmitter();
export const proxy1EventEmitter = new EventEmitter();
export const proxy2EventEmitter = new EventEmitter();

let asSendDataThroughCallback = false;
let useSpecificPrivateKeyForSign = false;
let responseAccessorEncryptWithRandomByte = false;
let privateKeyForSign;
let responseRandomByte;

export function setAsSendDataThroughCallback(sendThroughCallback) {
  asSendDataThroughCallback = sendThroughCallback;
}

export function setIdPUseSpecificPrivateKeyForSign(
  specificPrivateKeyForSign,
  privateKey = null,
) {
  useSpecificPrivateKeyForSign = specificPrivateKeyForSign;
  privateKeyForSign = privateKey;
}

export function setIdPAccessorEncryptWithRamdomByte(
  accessorEncryptWithRandomByte,
  randomByte = null,
) {
  responseAccessorEncryptWithRandomByte = accessorEncryptWithRandomByte;
  responseRandomByte = randomByte;
}

/*
  NDID
*/
let ndidServer;
const ndidApp = express();
ndidApp.use(bodyParser.json({ limit: '2mb' }));

ndidApp.post('/ndid/callback', async function (req, res) {
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

rpApp.post('/rp/callback', async function (req, res) {
  const callbackData = req.body;
  rpEventEmitter.emit('callback', callbackData);
  res.status(204).end();
});

/*
  RP-2
*/
let rp2Server;
const rp2App = express();
rp2App.use(bodyParser.json({ limit: '2mb' }));

rp2App.post('/rp/callback', async function (req, res) {
  const callbackData = req.body;
  rp2EventEmitter.emit('callback', callbackData);
  res.status(204).end();
});

/*
  IdP-1
*/
let idp1Server;
const idp1App = express();
idp1App.use(bodyParser.json({ limit: '2mb' }));

idp1App.post('/idp/callback', async function (req, res) {
  const callbackData = req.body;
  idp1EventEmitter.emit('callback', callbackData);
  res.status(204).end();
});

idp1App.post('/idp/accessor/sign', async function (req, res) {
  const callbackData = req.body;
  idp1EventEmitter.emit('accessor_sign_callback', callbackData);

  const reference = db.createIdentityReferences.find(
    (ref) => ref.referenceId === callbackData.reference_id,
  );
  res.status(200).json({
    signature: utils.createSignature(
      reference.accessorPrivateKey,
      callbackData.sid,
    ),
  });
});

idp1App.post('/idp/accessor/encrypt', async function (req, res) {
  let signature;
  const callbackData = req.body;
  idp1EventEmitter.emit('accessor_encrypt_callback', callbackData);
  let accessorPrivateKey;
  if (useSpecificPrivateKeyForSign) {
    accessorPrivateKey = privateKeyForSign;
  } else {
    db.idp1Identities.forEach((identity) => {
      identity.accessors.forEach((accessor) => {
        if (accessor.accessorId === callbackData.accessor_id) {
          accessorPrivateKey = accessor.accessorPrivateKey;
          return;
        }
        if (accessorPrivateKey) return;
      });
    });
  }
  if (responseAccessorEncryptWithRandomByte) {
    signature = responseRandomByte;
  } else {
    signature = utils.createResponseSignature(
      accessorPrivateKey,
      callbackData.request_message_padded_hash,
    );
  }
  res.status(200).json({
    signature,
  });
});

idp1App.post('/idp/identity/notification', async function (req, res) {
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

idp2App.post('/idp/callback', async function (req, res) {
  const callbackData = req.body;
  idp2EventEmitter.emit('callback', callbackData);
  res.status(204).end();
});

idp2App.post('/idp/accessor/sign', async function (req, res) {
  const callbackData = req.body;
  idp2EventEmitter.emit('accessor_sign_callback', callbackData);

  const reference = db.createIdentityReferences.find(
    (ref) => ref.referenceId === callbackData.reference_id,
  );
  res.status(200).json({
    signature: utils.createSignature(
      reference.accessorPrivateKey,
      callbackData.sid,
    ),
  });
});

idp2App.post('/idp/accessor/encrypt', async function (req, res) {
  const callbackData = req.body;
  idp2EventEmitter.emit('accessor_encrypt_callback', callbackData);
  let accessorPrivateKey;
  db.idp2Identities.forEach((identity) => {
    identity.accessors.forEach((accessor) => {
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
      callbackData.request_message_padded_hash,
    ),
  });
});

idp2App.post('/idp/identity/notification', async function (req, res) {
  const callbackData = req.body;
  idp2EventEmitter.emit('identity_notification_callback', callbackData);
  res.status(204).end();
});

/*
  IdP-3
*/
let idp3Server;
const idp3App = express();
idp3App.use(bodyParser.json({ limit: '2mb' }));

idp3App.post('/idp/callback', async function (req, res) {
  const callbackData = req.body;
  idp3EventEmitter.emit('callback', callbackData);
  res.status(204).end();
});

idp3App.post('/idp/accessor/sign', async function (req, res) {
  const callbackData = req.body;
  idp3EventEmitter.emit('accessor_sign_callback', callbackData);

  const reference = db.createIdentityReferences.find(
    (ref) => ref.referenceId === callbackData.reference_id,
  );
  res.status(200).json({
    signature: utils.createSignature(
      reference.accessorPrivateKey,
      callbackData.sid,
    ),
  });
});

idp3App.post('/idp/accessor/encrypt', async function (req, res) {
  let signature;
  const callbackData = req.body;
  idp3EventEmitter.emit('accessor_encrypt_callback', callbackData);
  let accessorPrivateKey;
  if (useSpecificPrivateKeyForSign) {
    accessorPrivateKey = privateKeyForSign;
  } else {
    db.idp3Identities.forEach((identity) => {
      identity.accessors.forEach((accessor) => {
        if (accessor.accessorId === callbackData.accessor_id) {
          accessorPrivateKey = accessor.accessorPrivateKey;
          return;
        }
        if (accessorPrivateKey) return;
      });
    });
  }
  if (responseAccessorEncryptWithRandomByte) {
    signature = responseRandomByte;
  } else {
    signature = utils.createResponseSignature(
      accessorPrivateKey,
      callbackData.request_message_padded_hash,
    );
  }
  res.status(200).json({
    signature,
  });
});

idp3App.post('/idp/identity/notification', async function (req, res) {
  const callbackData = req.body;
  idp3EventEmitter.emit('identity_notification_callback', callbackData);
  res.status(204).end();
});


/*
  AS-1
*/
let as1Server;
const as1App = express();
as1App.use(bodyParser.json({ limit: '2mb' }));

as1App.post('/as/callback', async function (req, res) {
  const callbackData = req.body;
  if (callbackData.type === 'data_request' && asSendDataThroughCallback) {
    as1EventEmitter.emit('callback', callbackData, function (data) {
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

as2App.post('/as/callback', async function (req, res) {
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

proxy1App.post('/proxy/callback', async function (req, res) {
  const callbackData = req.body;
  proxy1EventEmitter.emit('callback', callbackData);
  res.status(204).end();
});

proxy1App.post('/proxy/accessor/sign', async function (req, res) {
  const callbackData = req.body;
  proxy1EventEmitter.emit('accessor_sign_callback', callbackData);

  const reference = db.createIdentityReferences.find(
    (ref) => ref.referenceId === callbackData.reference_id,
  );
  res.status(200).json({
    signature: utils.createSignature(
      reference.accessorPrivateKey,
      callbackData.sid,
    ),
  });
});

proxy1App.post('/proxy/accessor/encrypt', async function (req, res) {
  const callbackData = req.body;
  proxy1EventEmitter.emit('accessor_encrypt_callback', callbackData);
  let accessorPrivateKey;
  if (useSpecificPrivateKeyForSign) {
    accessorPrivateKey = privateKeyForSign;
  } else {
    db.proxy1Idp4Identities.forEach((identity) => {
      identity.accessors.forEach((accessor) => {
        if (accessor.accessorId === callbackData.accessor_id) {
          accessorPrivateKey = accessor.accessorPrivateKey;
          return;
        }
        if (accessorPrivateKey) return;
      });
    });
  }
  res.status(200).json({
    signature: utils.createResponseSignature(
      accessorPrivateKey,
      callbackData.request_message_padded_hash,
    ),
  });
});

proxy1App.post('/proxy/identity/notification', async function (req, res) {
  const callbackData = req.body;
  proxy1App.emit('identity_notification_callback', callbackData);
  res.status(204).end();
});

/*
  Proxy-2
*/
let proxy2Server;
const proxy2App = express();
proxy2App.use(bodyParser.json({ limit: '2mb' }));

proxy2App.post('/proxy/callback', async function (req, res) {
  const callbackData = req.body;
  proxy2EventEmitter.emit('callback', callbackData);
  res.status(204).end();
});

proxy2App.post('/proxy/accessor/sign', async function (req, res) {
  const callbackData = req.body;
  proxy2EventEmitter.emit('accessor_sign_callback', callbackData);

  const reference = db.createIdentityReferences.find(
    (ref) => ref.referenceId === callbackData.reference_id,
  );
  res.status(200).json({
    signature: utils.createSignature(
      reference.accessorPrivateKey,
      callbackData.sid,
    ),
  });
});

proxy2App.post('/proxy/accessor/encrypt', async function (req, res) {
  const callbackData = req.body;
  proxy2EventEmitter.emit('accessor_encrypt_callback', callbackData);
  let accessorPrivateKey;
  if (useSpecificPrivateKeyForSign) {
    accessorPrivateKey = privateKeyForSign;
  } else {
    // db.proxy2Idp5Identities.forEach(identity => {
    //   identity.accessors.forEach(accessor => {
    //     if (accessor.accessorId === callbackData.accessor_id) {
    //       accessorPrivateKey = accessor.accessorPrivateKey;
    //       return;
    //     }
    //     if (accessorPrivateKey) return;
    //   });
    // });
  }
  res.status(200).json({
    signature: utils.createResponseSignature(
      accessorPrivateKey,
      callbackData.request_message_padded_hash,
    ),
  });
});

proxy2App.post('/proxy/identity/notification', async function (req, res) {
  const callbackData = req.body;
  proxy2App.emit('identity_notification_callback', callbackData);
  res.status(204).end();
});

export function startCallbackServers() {
  ndidServer = ndidApp.listen(config.NDID_CALLBACK_PORT);
  rpServer = rpApp.listen(config.RP_CALLBACK_PORT);
  rp2Server = rp2App.listen(config.RP2_CALLBACK_PORT);
  idp1Server = idp1App.listen(config.IDP1_CALLBACK_PORT);
  idp2Server = idp2App.listen(config.IDP2_CALLBACK_PORT);
  idp3Server = idp3App.listen(config.IDP3_CALLBACK_PORT);
  as1Server = as1App.listen(config.AS1_CALLBACK_PORT);
  as2Server = as2App.listen(config.AS2_CALLBACK_PORT);
  proxy1Server = proxy1App.listen(config.PROXY1_CALLBACK_PORT);
  proxy2Server = proxy2App.listen(config.PROXY2_CALLBACK_PORT);
}

export function stopCallbackServers() {
  ndidServer.close();
  rpServer.close();
  rp2Server.close();
  idp1Server.close();
  idp2Server.close();
  idp3Server.close();
  as1Server.close();
  as2Server.close();
  proxy1Server.close();
  proxy2Server.close();
}
