import { getApiAddressUrl, httpGet, httpPost } from '../helpers';

export function createRequest(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const { namespace, identifier, ...rest } = data;
  return httpPost(`${apiBaseUrl}/rp/requests/${namespace}/${identifier}`, rest);
}

export function closeRequest(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  return httpPost(`${apiBaseUrl}/rp/requests/close`, data);
}

export function getDataFromAS(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const { requestId } = data;
  return httpGet(`${apiBaseUrl}/rp/requests/data/${requestId}`);
}
