import { getApiBaseUrl, httpGet, httpPost } from './helpers';

export function createRequest(nodeId, data) {
  const apiBaseUrl = getApiBaseUrl(nodeId);
  const { namespace, identifier, ...rest } = data;
  return httpPost(`${apiBaseUrl}/rp/requests/${namespace}/${identifier}`, rest);
}

export function closeRequest(nodeId, data) {
  const apiBaseUrl = getApiBaseUrl(nodeId);
  return httpPost(`${apiBaseUrl}/rp/requests/close`, data);
}

export function getDataFromAS(nodeId, data) {
  const apiBaseUrl = getApiBaseUrl(nodeId);
  const { requestId } = data;
  return httpGet(`${apiBaseUrl}/rp/requests/data/${requestId}`);
}
