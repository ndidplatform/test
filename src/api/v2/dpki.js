import { getApiAddressUrl, httpGet, httpPost } from '../helpers';

export function getCallbacks(nodeId) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  return httpGet(`${apiBaseUrl}/dpki/node/callback`);
}

export function setCallbacks(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  return httpPost(`${apiBaseUrl}/dpki/node/callback`, data);
}