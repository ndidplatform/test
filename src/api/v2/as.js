import { getApiBaseUrl, httpGet, httpPost } from './helpers';

export function addOrUpdateService(nodeId, data) {
  const apiBaseUrl = getApiBaseUrl(nodeId);
  const { serviceId, ...rest } = data;
  return httpPost(`${apiBaseUrl}/as/service/${serviceId}`, rest);
}

export function sendData(nodeId, data) {
  const apiBaseUrl = getApiBaseUrl(nodeId);
  const { requestId, serviceId, ...rest } = data;
  return httpPost(`${apiBaseUrl}/as/data/${requestId}/${serviceId}`, rest);
}
