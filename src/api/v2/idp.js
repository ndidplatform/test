import { getApiBaseUrl, httpGet, httpPost } from './helpers';

export function setCallback(nodeId, data) {
  const apiBaseUrl = getApiBaseUrl(nodeId);
  return httpPost(`${apiBaseUrl}/idp/callback`, data);
}

export function createIdentity(nodeId, data) {
  const apiBaseUrl = getApiBaseUrl(nodeId);
  return httpPost(`${apiBaseUrl}/identity`, data);
}

export function createResponse(nodeId, data) {
  const apiBaseUrl = getApiBaseUrl(nodeId);
  return httpPost(`${apiBaseUrl}/idp/response`, data);
}
