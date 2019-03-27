import { getApiAddressUrl, httpGet, httpPost } from '../helpers';
import API_VERSION from './apiVersion';

export function getCallbacks(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  return httpGet(
    `${apiBaseUrl}/idp/callback${data ? `node_id=${data.node_id}` : ''}`
  );
}

export function setCallbacks(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  return httpPost(`${apiBaseUrl}/idp/callback`, data);
}

export function createResponse(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  return httpPost(`${apiBaseUrl}/idp/response`, data);
}
