import crypto from 'crypto';

import uuidv4 from 'uuid/v4';

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

export function hash(stringToHash) {
  const hash = crypto.createHash('sha256');
  hash.update(stringToHash);
  const hashStrBase64 = hash.digest('base64');
  return hashStrBase64;
}

export function createSignature(privateKey, message) {
  return crypto
    .createSign('SHA256')
    .update(message)
    .sign(privateKey, 'base64');
}

export function createResponseSignature(privateKey, message_hash) {
  return crypto.privateEncrypt({
    key: privateKey,
    padding: crypto.constants.RSA_NO_PADDING,
  },Buffer.from(message_hash, 'base64')).toString('base64');
}

function generateCustomPadding(initialSalt, blockLength = 2048) {
  let hashLength = 256;
  let padLengthInbyte = parseInt(Math.floor((blockLength - hashLength)/8));
  let paddingBuffer = Buffer.from([]);
  
  for(let i = 1 ; paddingBuffer.length + 16 <= padLengthInbyte ; i++) {
    paddingBuffer = Buffer.concat([
      paddingBuffer,
      Buffer.from(
        hash(initialSalt + i.toString()),
        'base64'
      ).slice(0,16)
    ]);
  }
  //set most significant bit to 0
  paddingBuffer[0] = paddingBuffer[0] & 0x7f;
  return paddingBuffer;
}

export function hashRequestMessage(request_message, request_message_salt) {
  let paddingBuffer = generateCustomPadding(request_message_salt);
  let derivedSalt = Buffer.from( 
    hash(request_message_salt), 'base64'
  ).slice(0,16).toString('base64');

  let normalHashBuffer = Buffer.from(
    hash(request_message + derivedSalt),
  'base64');

  return Buffer.concat([
    paddingBuffer,
    normalHashBuffer
  ]).toString('base64');
}