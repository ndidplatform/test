import crypto from 'crypto';

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
