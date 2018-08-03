import { getApiAddressUrl, httpGet, httpPost } from '../helpers';

export function getService(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const { serviceId } = data;
  return httpGet(`${apiBaseUrl}/as/service/${serviceId}`);
}

export function addOrUpdateService(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const { serviceId, ...rest } = data;
  return httpPost(`${apiBaseUrl}/as/service/${serviceId}`, rest);
}

export function sendData(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const { requestId, serviceId, ...rest } = data;
  return httpPost(`${apiBaseUrl}/as/data/${requestId}/${serviceId}`, rest);
}

export function getCallbacks(nodeId) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  return httpGet(`${apiBaseUrl}/as/callback`);
}

export function setCallbacks(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  return httpPost(`${apiBaseUrl}/as/callback`, data);
}