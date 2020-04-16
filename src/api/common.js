import { getApiAddressUrl, httpGet, httpPost } from './helpers';

export function getInfo(nodeId) {
  const apiBaseUrl = getApiAddressUrl(nodeId);
  return httpGet(`${apiBaseUrl}/info`);
}

export function reinitNodeKeys(nodeId) {
  const apiBaseUrl = getApiAddressUrl(nodeId);
  return httpGet(`${apiBaseUrl}/reinit_node_keys`);
}

export function setConfig(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId);
  return httpPost(`${apiBaseUrl}/config/set`, data);
}

export function getConfig(nodeId) {
  const apiBaseUrl = getApiAddressUrl(nodeId);
  return httpGet(`${apiBaseUrl}/config`);
}
