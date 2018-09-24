import { getApiAddressUrl, httpGet, httpPost } from '../helpers';

export function getCallbacks(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  return httpGet(
    `${apiBaseUrl}/rp/callback${data ? `?node_id=${data.node_id}` : ''}`
  );
}

export function setCallbacks(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  return httpPost(`${apiBaseUrl}/rp/callback`, data);
}

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
  const { requestId, node_id } = data;
  return httpGet(
    `${apiBaseUrl}/rp/requests/data/${requestId}${
      node_id ? `?node_id=${node_id}` : ''
    }`
  );
}

export function getRequestIdByReferenceId(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const { reference_id } = data;
  return httpGet(`${apiBaseUrl}/rp/requests/reference/${reference_id}`);
}
