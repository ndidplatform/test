export const CALLBACK_IP = process.env.CALLBACK_IP || 'localhost';

export const nodeIdMappingAddress = false;

export const RP_CALLBACK_PORT = 9200;

export const IDP1_CALLBACK_PORT = 9100;
export const IDP2_CALLBACK_PORT = 9101;

export const AS1_CALLBACK_PORT = 9300;
export const AS2_CALLBACK_PORT = 9301;

export const NDID_CALLBACK_PORT = 9000;

export const DPKI_CALLBACK_PORT = 12000;

export const RP_CALLBACK_URL = `http://${CALLBACK_IP}:${RP_CALLBACK_PORT}/rp/callback`;

export const IDP1_CALLBACK_URL = `http://${CALLBACK_IP}:${IDP1_CALLBACK_PORT}/idp/callback`;
export const IDP1_ACCESSOR_SIGN_CALLBACK_URL = `http://${CALLBACK_IP}:${IDP1_CALLBACK_PORT}/idp/accessor/sign`;
export const IDP2_CALLBACK_URL = `http://${CALLBACK_IP}:${IDP2_CALLBACK_PORT}/idp/callback`;
export const IDP2_ACCESSOR_SIGN_CALLBACK_URL = `http://${CALLBACK_IP}:${IDP2_CALLBACK_PORT}/idp/accessor/sign`;

export const AS1_CALLBACK_URL = `http://${CALLBACK_IP}:${AS1_CALLBACK_PORT}/as/callback`;
export const AS2_CALLBACK_URL = `http://${CALLBACK_IP}:${AS2_CALLBACK_PORT}/as/callback`;

export const NDID_CALLBACK_URL = `http://${CALLBACK_IP}:${NDID_CALLBACK_PORT}/ndid/callback`;

export const USE_EXTERNAL_CRYPTO_SERVICE =
  process.env.USE_EXTERNAL_CRYPTO_SERVICE === 'true';

export const DPKI_SIGN_CALLBACK_URL = `http://${CALLBACK_IP}:${DPKI_CALLBACK_PORT}/dpki/sign`;
export const DPKI_MASTER_SIGN_CALLBACK_URL = `http://${CALLBACK_IP}:${DPKI_CALLBACK_PORT}/dpki/master/sign`;
export const DPKI_DECRYPT_CALLBACK_URL = `http://${CALLBACK_IP}:${DPKI_CALLBACK_PORT}/dpki/decrypt`;
