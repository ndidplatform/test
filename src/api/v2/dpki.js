import { getApiAddressUrl, httpGet, httpPost } from '../helpers';

export function getCallbacks(nodeId) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  return httpGet(`${apiBaseUrl}/dpki/node/callback?node_id=${nodeId}`);
}

export function setCallbacks(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const body = { ...data, node_id: nodeId };
  return httpPost(`${apiBaseUrl}/dpki/node/callback`, body);
}

export function updateNode(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const body = { ...data, node_id: nodeId };
  return httpPost(`${apiBaseUrl}/dpki/node/update`, body);
}
