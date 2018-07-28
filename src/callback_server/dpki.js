import path from 'path';
import fs from 'fs';
import EventEmitter from 'events';
import crypto from 'crypto';

import express from 'express';
import bodyParser from 'body-parser';

import * as config from '../config';

export const dpkiEventEmitter = new EventEmitter();

/**
 *
 * @param {(Object|string)} privateKey
 * @param {string} ciphertext base64 encoded ciphertext
 * @returns {Buffer} decrypted text
 */
function privateDecrypt(privateKey, ciphertext) {
  const buffer = Buffer.from(ciphertext, 'base64');
  const decrypted = crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    buffer
  );
  return decrypted;
}

function createSignature(privateKey, hashMethod, message) {
  return crypto
    .createSign(hashMethod)
    .update(message)
    .sign(privateKey, 'base64');
}

let dpkiServer;
const app = express();
app.use(bodyParser.json({ limit: '2mb' }));

app.post('/dpki/decrypt', (req, res) => {
  try {
    const { node_id, encrypted_message, key_type } = req.body;

    dpkiEventEmitter.emit('decryptCallback', req.body);

    const keyPath = path.join(__dirname, '..', '..', 'dev_key', node_id);

    const key = fs.readFileSync(keyPath, 'utf8').toString();

    const decryptedMessageBuffer = privateDecrypt(key, encrypted_message);

    const decryptedMessageBase64 = decryptedMessageBuffer.toString('base64');
    const json = {
      decrypted_message: decryptedMessageBase64,
    };

    res.status(200).json(json);
  } catch (error) {
    res.status(500).json(error);
  }
});

app.post('/dpki/sign', (req, res) => {
  try {
    const {
      node_id,
      request_message,
      request_message_hash,
      hash_method,
      key_type,
      sign_method,
    } = req.body;

    dpkiEventEmitter.emit('signCallback', req.body);

    const keyPath = path.join(__dirname, '..', '..', 'dev_key', node_id);

    const key = fs.readFileSync(keyPath, 'utf8').toString();

    // Optional: Check hash equality

    // Hash then encrypt OR encrypt received hash
    const signature = createSignature(key, hash_method, request_message);
    const json = {
      signature,
    };

    res.status(200).json(json);
  } catch (error) {
    res.status(500).json(error);
  }
});

app.post('/dpki/master/sign', (req, res) => {
  try {
    const {
      node_id,
      request_message,
      request_message_hash,
      hash_method,
      key_type,
      sign_method,
    } = req.body;

    dpkiEventEmitter.emit('masterSignCallback', req.body);

    const keyPath = path.join(
      __dirname,
      '..',
      '..',
      'dev_key',
      node_id + '_master'
    );

    const key = fs.readFileSync(keyPath, 'utf8').toString();

    // Optional: Check hash equality

    // Hash then encrypt OR encrypt received hash
    const signature = createSignature(key, hash_method, request_message);
    const json = {
      signature,
    };

    res.status(200).json(json);
  } catch (error) {
    res.status(500).json(error);
  }
});

export function startCallbackServer() {
  dpkiServer = app.listen(config.DPKI_CALLBACK_PORT);
}

export function stopCallbackServer() {
  dpkiServer.close();
}
