import { getApiAddressUrl, httpGet, httpPost } from '../helpers';

export function getCallbacks(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  return httpGet(
    `${apiBaseUrl}/dpki/node/callback${data ? `?node_id=${data.node_id}` : ''}`
  );
}

export function setCallbacks(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  return httpPost(`${apiBaseUrl}/dpki/node/callback`, data);
}

export function updateNode(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  return httpPost(`${apiBaseUrl}/dpki/node/update`, data);
}
