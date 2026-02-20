import { getApiAddressUrl, httpGet, httpPost } from '../../helpers';
import API_VERSION from '../apiVersion';

export function createSignedAuthorizationToken(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  return httpPost(`${apiBaseUrl}/yourdata/utility/token`, data);
}

export function getASErrorCodes(nodeId) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  return httpGet(`${apiBaseUrl}/yourdata/utility/as_error_codes`);
}

export function getNodeWhitelist(nodeId) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  return httpGet(`${apiBaseUrl}/yourdata/utility/node_whitelist`);
}

export function getPrivateMessages(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { request_id, node_id } = data;
  return httpGet(
    `${apiBaseUrl}/yourdata/utility/private_messages/${request_id}${
      node_id ? `?node_id=${node_id}` : ''
    }`
  );
}
