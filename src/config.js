export const CALLBACK_IP = process.env.CALLBACK_IP || 'localhost';

export const nodeIdMappingAddress = false;

export const RP_CALLBACK_PORT = 9200;
export const RP2_CALLBACK_PORT = 9201;

export const IDP1_CALLBACK_PORT = 9100;
export const IDP2_CALLBACK_PORT = 9101;
export const IDP3_CALLBACK_PORT = 9102;

export const AS1_CALLBACK_PORT = 9300;
export const AS2_CALLBACK_PORT = 9301;

export const PROXY1_CALLBACK_PORT = 9400;
export const PROXY2_CALLBACK_PORT = 9401;

export const NDID_CALLBACK_PORT = 9000;

export const KMS_CALLBACK_PORT = 12000;

export const NODE_CALLBACK_PORT = 14000;

export const DCONTRACT_SERVER_PORT = 19900;

export const RP_CALLBACK_URL = `http://${CALLBACK_IP}:${RP_CALLBACK_PORT}/rp/callback`;
export const RP2_CALLBACK_URL = `http://${CALLBACK_IP}:${RP2_CALLBACK_PORT}/rp/callback`;

export const IDP1_CALLBACK_URL = `http://${CALLBACK_IP}:${IDP1_CALLBACK_PORT}/idp/callback`;
export const IDP1_ACCESSOR_SIGN_CALLBACK_URL = `http://${CALLBACK_IP}:${IDP1_CALLBACK_PORT}/idp/accessor/sign`;
export const IDP1_ACCESSOR_ENCRYPT_CALLBACK_URL = `http://${CALLBACK_IP}:${IDP1_CALLBACK_PORT}/idp/accessor/encrypt`;
export const IDP1_NOTIFICATION_CALLBACK_URL = `http://${CALLBACK_IP}:${IDP1_CALLBACK_PORT}/idp/identity/notification`;

export const IDP2_CALLBACK_URL = `http://${CALLBACK_IP}:${IDP2_CALLBACK_PORT}/idp/callback`;
export const IDP2_ACCESSOR_SIGN_CALLBACK_URL = `http://${CALLBACK_IP}:${IDP2_CALLBACK_PORT}/idp/accessor/sign`;
export const IDP2_ACCESSOR_ENCRYPT_CALLBACK_URL = `http://${CALLBACK_IP}:${IDP2_CALLBACK_PORT}/idp/accessor/encrypt`;
export const IDP2_NOTIFICATION_CALLBACK_URL = `http://${CALLBACK_IP}:${IDP2_CALLBACK_PORT}/idp/identity/notification`;

export const IDP3_CALLBACK_URL = `http://${CALLBACK_IP}:${IDP3_CALLBACK_PORT}/idp/callback`;
export const IDP3_ACCESSOR_SIGN_CALLBACK_URL = `http://${CALLBACK_IP}:${IDP3_CALLBACK_PORT}/idp/accessor/sign`;
export const IDP3_ACCESSOR_ENCRYPT_CALLBACK_URL = `http://${CALLBACK_IP}:${IDP3_CALLBACK_PORT}/idp/accessor/encrypt`;
export const IDP3_NOTIFICATION_CALLBACK_URL = `http://${CALLBACK_IP}:${IDP3_CALLBACK_PORT}/idp/identity/notification`;

export const AS1_CALLBACK_URL = `http://${CALLBACK_IP}:${AS1_CALLBACK_PORT}/as/callback`;
export const AS2_CALLBACK_URL = `http://${CALLBACK_IP}:${AS2_CALLBACK_PORT}/as/callback`;

export const PROXY1_CALLBACK_URL = `http://${CALLBACK_IP}:${PROXY1_CALLBACK_PORT}/proxy/callback`;
export const PROXY1_ACCESSOR_SIGN_CALLBACK_URL = `http://${CALLBACK_IP}:${PROXY1_CALLBACK_PORT}/proxy/accessor/sign`;
export const PROXY1_ACCESSOR_ENCRYPT_CALLBACK_URL = `http://${CALLBACK_IP}:${PROXY1_CALLBACK_PORT}/proxy/accessor/encrypt`;
export const PROXY1_NOTIFICATION_CALLBACK_URL = `http://${CALLBACK_IP}:${PROXY1_CALLBACK_PORT}/proxy/identity/notification`;

export const PROXY2_CALLBACK_URL = `http://${CALLBACK_IP}:${PROXY2_CALLBACK_PORT}/proxy/callback`;
export const PROXY2_ACCESSOR_SIGN_CALLBACK_URL = `http://${CALLBACK_IP}:${PROXY2_CALLBACK_PORT}/proxy/accessor/sign`;
export const PROXY2_ACCESSOR_ENCRYPT_CALLBACK_URL = `http://${CALLBACK_IP}:${PROXY2_CALLBACK_PORT}/proxy/accessor/encrypt`;
export const PROXY2_NOTIFICATION_CALLBACK_URL = `http://${CALLBACK_IP}:${PROXY2_CALLBACK_PORT}/proxy/identity/notification`;

export const NDID_CALLBACK_URL = `http://${CALLBACK_IP}:${NDID_CALLBACK_PORT}/ndid/callback`;

export const USE_EXTERNAL_CRYPTO_SERVICE =
  process.env.USE_EXTERNAL_CRYPTO_SERVICE === 'true';

export const KMS_SIGN_CALLBACK_URL = `http://${CALLBACK_IP}:${KMS_CALLBACK_PORT}/kms/sign`;
export const KMS_MASTER_SIGN_CALLBACK_URL = `http://${CALLBACK_IP}:${KMS_CALLBACK_PORT}/kms/master/sign`;
export const KMS_DECRYPT_CALLBACK_URL = `http://${CALLBACK_IP}:${KMS_CALLBACK_PORT}/kms/decrypt`;

export const MQ_SEND_SUCCESS_CALLBACK_URL = `http://${CALLBACK_IP}:${NODE_CALLBACK_PORT}/node/mq_send_success`;

export const DCONTRACT_BASE_URL = `http://${CALLBACK_IP}:${DCONTRACT_SERVER_PORT}/dcontract`;

export const httpHeaderNdidMemberAppType =
  process.env.HTTP_HEADER_NDID_MEMBER_APP_TYPE;
export const httpHeaderNdidMemberAppVersion =
  process.env.HTTP_HEADER_NDID_MEMBER_APP_VERSION;
