import { getApiAddressUrl, httpGet, httpPost } from '../helpers';

export function getCallbacks(nodeId) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  return httpGet(`${apiBaseUrl}/rp/callback?node_id=${nodeId}`);
}

export function setCallbacks(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const body = { ...data, node_id: nodeId };
  return httpPost(`${apiBaseUrl}/rp/callback`, body);
}

export function createRequest(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const { namespace, identifier, ...rest } = data;
  const body = { ...rest, node_id: nodeId };
  return httpPost(`${apiBaseUrl}/rp/requests/${namespace}/${identifier}`, body);
}

export function closeRequest(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const body = { ...data, node_id: nodeId };
  return httpPost(`${apiBaseUrl}/rp/requests/close`, body);
}

export function getDataFromAS(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const { requestId } = data;
  return httpGet(
    `${apiBaseUrl}/rp/requests/data/${requestId}?node_id=${nodeId}`
  );
}
