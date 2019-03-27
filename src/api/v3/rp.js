import { getApiAddressUrl, httpGet, httpPost } from '../helpers';
import API_VERSION from './apiVersion';

export function getCallbacks(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  return httpGet(
    `${apiBaseUrl}/rp/callback${data ? `?node_id=${data.node_id}` : ''}`
  );
}

export function setCallbacks(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  return httpPost(`${apiBaseUrl}/rp/callback`, data);
}

export function createRequest(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { namespace, identifier, ...rest } = data;
  return httpPost(`${apiBaseUrl}/rp/requests/${namespace}/${identifier}`, rest);
}

export function closeRequest(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  return httpPost(`${apiBaseUrl}/rp/requests/close`, data);
}

export function getDataFromAS(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { requestId, node_id } = data;
  return httpGet(
    `${apiBaseUrl}/rp/requests/data/${requestId}${
      node_id ? `?node_id=${node_id}` : ''
    }`
  );
}

export function getRequestIdByReferenceId(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { reference_id } = data;
  return httpGet(`${apiBaseUrl}/rp/requests/reference/${reference_id}`);
}

export function removeAllDataRequestedFromAS(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { node_id } = data;
  return httpPost(
    `${apiBaseUrl}/rp/requests/housekeeping/data${
      node_id ? `?node_id=${node_id}` : ''
    }`
  );
}

export function removeDataRequestedFromAS(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { request_id } = data;
  return httpPost(`${apiBaseUrl}/rp/requests/housekeeping/data/${request_id}`);
}
