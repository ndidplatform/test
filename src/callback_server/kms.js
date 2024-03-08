import path from 'path';
import fs from 'fs';
import EventEmitter from 'events';
import crypto from 'crypto';

import express from 'express';
import bodyParser from 'body-parser';

import * as cryptoUtils from '../utils/crypto';

import * as config from '../config';

export const kmsEventEmitter = new EventEmitter();

const nodeIdList = [
  'ndid1',
  'rp1',
  'rp2',
  'rp3',
  'idp1',
  'idp2',
  'idp3',
  'as1',
  'as2',
  'as3',
  'proxy1',
  'proxy2',
];

const nodeBehindProxyIdList = [
  'proxy1_rp4',
  'proxy1_idp4',
  'proxy1_as4',
  'proxy2_rp5',
  'proxy2_idp5',
  'proxy2_as5',
];

const originalNodeKeysDirectoryPath = path.join(
  __dirname,
  '..',
  '..',
  'dev_key',
  'original_dev_key'
);
const originalNodeBehindProxyKeysDirectoryPath = path.join(
  originalNodeKeysDirectoryPath,
  'behind_proxy'
);

const originalNodeSigningKey = {};
const originalNodeSigningMasterKey = {};
const originalNodeEncryptionKey = {};

const nodeSigningKey = {};
const nodeSigningMasterKey = {};
const nodeEncryptionKey = {};

let keySource = 'internal';

function loadOriginalNodeKeys() {
  for (let i = 0; i < nodeIdList.length; i++) {
    const nodeId = nodeIdList[i];
    const signingKey = fs
      .readFileSync(
        path.join(originalNodeKeysDirectoryPath, 'keys', nodeId),
        'utf8'
      )
      .toString();
    originalNodeSigningKey[nodeId] = {
      privateKey: signingKey,
      keyAlgorithm: cryptoUtils.keyAlgorithm.RSA,
      signingAlgorithm:
        cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256,
    };
    nodeSigningKey[nodeId] = {
      privateKey: signingKey,
      signingAlgorithm:
        cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256,
    };

    const signingMasterKey = fs
      .readFileSync(
        path.join(
          originalNodeKeysDirectoryPath,
          'master_keys',
          `${nodeId}_master`
        ),
        'utf8'
      )
      .toString();
    originalNodeSigningMasterKey[nodeId] = {
      privateKey: signingMasterKey,
      keyAlgorithm: cryptoUtils.keyAlgorithm.RSA,
      signingAlgorithm:
        cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256,
    };
    nodeSigningMasterKey[nodeId] = {
      privateKey: signingMasterKey,
      signingAlgorithm:
        cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256,
    };

    const encryptionKey = fs
      .readFileSync(
        path.join(originalNodeKeysDirectoryPath, 'encryption_keys', nodeId),
        'utf8'
      )
      .toString();
    originalNodeEncryptionKey[nodeId] = {
      privateKey: encryptionKey,
      keyAlgorithm: cryptoUtils.keyAlgorithm.RSA,
      encryptionAlgorithm: cryptoUtils.encryptionAlgorithm.RSAES_PKCS1_V1_5,
    };
    nodeEncryptionKey[nodeId] = {
      privateKey: encryptionKey,
      encryptionAlgorithm: cryptoUtils.encryptionAlgorithm.RSAES_PKCS1_V1_5,
    };
  }

  //
  // node behind proxy
  //

  for (let i = 0; i < nodeBehindProxyIdList.length; i++) {
    const nodeId = nodeBehindProxyIdList[i];
    const signingKey = fs
      .readFileSync(
        path.join(originalNodeBehindProxyKeysDirectoryPath, 'keys', nodeId),
        'utf8'
      )
      .toString();
    originalNodeSigningKey[nodeId] = {
      privateKey: signingKey,
      keyAlgorithm: cryptoUtils.keyAlgorithm.RSA,
      signingAlgorithm:
        cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256,
    };
    nodeSigningKey[nodeId] = {
      privateKey: signingKey,
      signingAlgorithm:
        cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256,
    };

    const signingMasterKey = fs
      .readFileSync(
        path.join(
          originalNodeBehindProxyKeysDirectoryPath,
          'master_keys',
          `${nodeId}_master`
        ),
        'utf8'
      )
      .toString();
    originalNodeSigningMasterKey[nodeId] = {
      privateKey: signingMasterKey,
      keyAlgorithm: cryptoUtils.keyAlgorithm.RSA,
      signingAlgorithm:
        cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256,
    };
    nodeSigningMasterKey[nodeId] = {
      privateKey: signingMasterKey,
      signingAlgorithm:
        cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256,
    };

    const encryptionKey = fs
      .readFileSync(
        path.join(
          originalNodeBehindProxyKeysDirectoryPath,
          'encryption_keys',
          nodeId
        ),
        'utf8'
      )
      .toString();
    originalNodeEncryptionKey[nodeId] = {
      privateKey: encryptionKey,
      keyAlgorithm: cryptoUtils.keyAlgorithm.RSA,
      encryptionAlgorithm: cryptoUtils.encryptionAlgorithm.RSAES_PKCS1_V1_5,
    };
    nodeEncryptionKey[nodeId] = {
      privateKey: encryptionKey,
      encryptionAlgorithm: cryptoUtils.encryptionAlgorithm.RSAES_PKCS1_V1_5,
    };
  }
}

export function setKeySource(source) {
  if (source === 'original' || source === 'internal') {
    keySource = source;
  }
}

export function setNodeSigningKey(nodeId, privateKey, signingAlgorithm) {
  nodeSigningKey[nodeId] = {
    privateKey,
    signingAlgorithm,
  };
}

export function setNodeSigningMasterKey(nodeId, privateKey, signingAlgorithm) {
  nodeSigningMasterKey[nodeId] = {
    privateKey,
    signingAlgorithm,
  };
}

export function setNodeEncryptionKey(nodeId, privateKey, encryptionAlgorithm) {
  nodeEncryptionKey[nodeId] = {
    privateKey,
    encryptionAlgorithm,
  };
}

export function getOriginalNodeSigningKey(nodeId) {
  const privateKey = originalNodeSigningKey[nodeId].privateKey;

  const publicKey = crypto
    .createPublicKey({
      key: privateKey,
      type: 'spki',
      format: 'pem',
    })
    .export({
      type: 'spki',
      format: 'pem',
    });

  return {
    privateKey,
    publicKey,
    keyAlgorithm: originalNodeSigningKey[nodeId].keyAlgorithm,
    signingAlgorithm: originalNodeSigningKey[nodeId].signingAlgorithm,
  };
}

export function getOriginalNodeSigningMasterKey(nodeId) {
  const privateKey = originalNodeSigningMasterKey[nodeId].privateKey;

  const publicKey = crypto
    .createPublicKey({
      key: privateKey,
      type: 'spki',
      format: 'pem',
    })
    .export({
      type: 'spki',
      format: 'pem',
    });

  return {
    privateKey,
    publicKey,
    keyAlgorithm: originalNodeSigningMasterKey[nodeId].keyAlgorithm,
    signingAlgorithm: originalNodeSigningMasterKey[nodeId].signingAlgorithm,
  };
}

export function getOriginalNodeEncryptionKey(nodeId) {
  const privateKey = originalNodeEncryptionKey[nodeId].privateKey;

  const publicKey = crypto
    .createPublicKey({
      key: privateKey,
      type: 'spki',
      format: 'pem',
    })
    .export({
      type: 'spki',
      format: 'pem',
    });

  return {
    privateKey,
    publicKey,
    keyAlgorithm: originalNodeEncryptionKey[nodeId].keyAlgorithm,
    encryptionAlgorithm: originalNodeEncryptionKey[nodeId].encryptionAlgorithm,
  };
}

let kmsServer;
const app = express();
app.use(bodyParser.json({ limit: '10mb' }));

app.post('/kms/decrypt', (req, res) => {
  try {
    const { node_id, encrypted_message, key_type } = req.body;

    kmsEventEmitter.emit('decryptCallback', req.body);

    let key;
    if (keySource === 'original') {
      key = originalNodeEncryptionKey[node_id];
    } else if (keySource === 'internal') {
      key = nodeEncryptionKey[node_id];
    }

    if (key == null) {
      throw new Error('key not found');
    }

    const decryptedMessageBuffer = cryptoUtils.privateDecrypt(
      {
        key: key.privateKey,
        padding: key.encryptionAlgorithm.padding,
        oaepHash: key.encryptionAlgorithm.oaepHash,
      },
      Buffer.from(encrypted_message, 'base64')
    );

    const decryptedMessageBase64 = decryptedMessageBuffer.toString('base64');
    const json = {
      decrypted_message: decryptedMessageBase64,
    };

    res.status(200).json(json);
  } catch (error) {
    console.error('kms err:', error);
    res.status(500).json(error);
  }
});

app.post('/kms/sign', (req, res) => {
  try {
    const {
      request_message,
      request_message_hash,
      hash_method,
      key_type,
      sign_method,
    } = req.body;

    let { node_id } = req.body;

    kmsEventEmitter.emit('signCallback', req.body);

    if (node_id === 'NonExistentRPNode') {
      //for test /create_message/proxy/create_message.js
      node_id = 'rp1';
    }

    let key;
    if (keySource === 'original') {
      key = originalNodeSigningKey[node_id];
    } else if (keySource === 'internal') {
      key = nodeSigningKey[node_id];
    }

    if (key == null) {
      throw new Error('key not found');
    }

    // Optional: Check hash equality

    // Hash then encrypt OR encrypt received hash

    const requestMessageBuffer = Buffer.from(request_message, 'base64');
    const signature = cryptoUtils.createSignature(
      key.signingAlgorithm.name,
      requestMessageBuffer,
      {
        key: key.privateKey,
        padding: key.signingAlgorithm.padding,
      }
    );
    const signatureBase64 = signature.toString('base64');
    const json = {
      signature: signatureBase64,
    };

    res.status(200).json(json);
  } catch (error) {
    console.error('kms err:', error);
    res.status(500).json(error);
  }
});

app.post('/kms/master/sign', (req, res) => {
  try {
    const {
      node_id,
      request_message,
      request_message_hash,
      hash_method,
      key_type,
      sign_method,
    } = req.body;

    kmsEventEmitter.emit('masterSignCallback', req.body);

    let key;
    if (keySource === 'original') {
      key = originalNodeSigningMasterKey[node_id];
    } else if (keySource === 'internal') {
      key = nodeSigningMasterKey[node_id];
    }

    if (key == null) {
      throw new Error('key not found');
    }

    // Optional: Check hash equality

    // Hash then encrypt OR encrypt received hash
    const requestMessageBuffer = Buffer.from(request_message, 'base64');
    const signature = cryptoUtils.createSignature(
      key.signingAlgorithm.name,
      requestMessageBuffer,
      {
        key: key.privateKey,
        padding: key.signingAlgorithm.padding,
      }
    );
    const signatureBase64 = signature.toString('base64');
    const json = {
      signature: signatureBase64,
    };

    res.status(200).json(json);
  } catch (error) {
    console.error('kms err:', error);
    res.status(500).json(error);
  }
});

export function startCallbackServer() {
  loadOriginalNodeKeys();
  kmsServer = app.listen(config.KMS_CALLBACK_PORT);
}

export function stopCallbackServer() {
  kmsServer.close();
}
