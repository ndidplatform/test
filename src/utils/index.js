import crypto from 'crypto';
import uuidv4 from 'uuid/v4';
import { parseKey } from '../asn1parser';
import { toBigIntBE, toBufferBE } from 'bigint-buffer';
import fs from 'fs';
import path from 'path';

const saltLength = 32;

export function wait(ms, stoppable) {
  let setTimeoutFn;
  const promise = new Promise(
    (resolve) => (setTimeoutFn = setTimeout(resolve, ms))
  );
  if (stoppable) {
    return {
      promise,
      stopWaiting: () => clearTimeout(setTimeoutFn),
    };
  }
  return promise;
}

export function createEventPromise() {
  let resolve, reject;
  const promise = new Promise((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  return {
    promise,
    resolve,
    reject,
  };
}

export function generateReferenceId() {
  return uuidv4();
}

export function sha256(dataToHash) {
  const hash = crypto.createHash('sha256');
  hash.update(dataToHash);
  const hashBuffer = hash.digest();
  return hashBuffer;
}

export function hash(stringToHash) {
  const hash = crypto.createHash('sha256');
  hash.update(stringToHash);
  const hashStrBase64 = hash.digest('base64');
  return hashStrBase64;
}

export function createSignature(privateKey, message) {
  return crypto.createSign('SHA256').update(message).sign(privateKey, 'base64');
}

export function createResponseSignature(privateKey, message_hash) {
  return crypto
    .privateEncrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_NO_PADDING,
      },
      Buffer.from(message_hash, 'base64')
    )
    .toString('base64');
}

function generateCustomPadding(initialSalt, blockLength = 2048) {
  const hashLength = 256;
  const padLengthInbyte = parseInt(Math.floor((blockLength - hashLength) / 8));
  let paddingBuffer = Buffer.alloc(0);

  for (let i = 1; paddingBuffer.length + 16 <= padLengthInbyte; i++) {
    paddingBuffer = Buffer.concat([
      paddingBuffer,
      Buffer.from(hash(initialSalt + i.toString()), 'base64').slice(0, 16),
    ]);
  }
  //set most significant bit to 0
  paddingBuffer[0] = paddingBuffer[0] & 0x7f;
  return paddingBuffer;
}

export function randomByte(length) {
  return crypto.randomBytes(length);
}

export function generateRequestParamSalt({
  requestId,
  serviceId,
  initialSalt,
}) {
  const bufferHash = sha256(requestId + serviceId + initialSalt);
  return bufferHash.slice(0, saltLength).toString('base64');
}

export function generateRequestMessageSalt({
  initialSalt,
  namespace,
  identifier,
}) {
  const bufferHash = sha256(namespace + identifier + initialSalt);
  return bufferHash.slice(0, saltLength).toString('base64');
}

function getDataHashWithCustomPadding(
  initialSalt,
  keyModulus,
  dataHash,
  blockLengthBits = 2048
) {
  const hashLength = 256;
  const padLengthInbyte = parseInt(
    Math.floor((blockLengthBits - hashLength) / 8)
  );
  let paddingBuffer = Buffer.alloc(0);

  for (let i = 1; paddingBuffer.length + saltLength <= padLengthInbyte; i++) {
    paddingBuffer = Buffer.concat([
      paddingBuffer,
      sha256(initialSalt + i.toString()).slice(0, saltLength),
    ]);
  }

  const hashWithPaddingBeforeMod = Buffer.concat([paddingBuffer, dataHash]);

  const hashWithPaddingBN = toBigIntBE(hashWithPaddingBeforeMod);
  const keyModulusBN = toBigIntBE(keyModulus);

  const hashWithPaddingModKeyModulusBN = hashWithPaddingBN % keyModulusBN;
  const hashWithPadding = toBufferBE(
    hashWithPaddingModKeyModulusBN,
    blockLengthBits / 8
  ); // Zeros padded in-front

  return hashWithPadding;
}

export function hashRequestMessageForConsent(
  request_message,
  initial_salt,
  request_id,
  accessorPublicKey
) {
  const parsedKey = parseKey(accessorPublicKey);
  const keyModulus = parsedKey.data.modulus.toBuffer();

  const derivedSalt = sha256(request_id + initial_salt)
    .slice(0, saltLength)
    .toString('base64');

  const normalHashBuffer = sha256(request_message + derivedSalt);

  //should find block length if use another sign method
  const hashWithPadding = getDataHashWithCustomPadding(
    initial_salt,
    keyModulus,
    normalHashBuffer
  );

  return hashWithPadding.toString('base64');
}

export function getPrivatekey(nodeId) {
  try {
    let publicKey = fs.readFileSync(
      path.join(__dirname, '..', 'dev_key', `${nodeId}`),
      'utf8'
    );
    return publicKey;
  } catch (error) {
    throw error;
  }
}
