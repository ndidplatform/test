import { getApiAddressUrl, httpGet } from './helpers';

export function getInfo(nodeId) {
  const apiBaseUrl = getApiAddressUrl(nodeId);
  return httpGet(`${apiBaseUrl}/info`);
}

export function reinitNodeKeys(nodeId) {
  const apiBaseUrl = getApiAddressUrl(nodeId);
  return httpGet(`${apiBaseUrl}/reinit_node_key`);
}
