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

export function createErrorResponse(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  return httpPost(`${apiBaseUrl}/idp/error_response`, data);
}

export function getRequestMessagePaddedHash(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;

  let arrayQueryString = Object.keys(data).map(key => {
    return `${key}=${data[key]}`;
  });

  const queryString = arrayQueryString.join('&');

  return httpGet(
    `${apiBaseUrl}/idp/request_message_padded_hash?${queryString}`
  );
}
