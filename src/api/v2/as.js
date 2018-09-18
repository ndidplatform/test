import { getApiAddressUrl, httpGet, httpPost } from '../helpers';

export function getService(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const { serviceId, node_id } = data;
  return httpGet(
    `${apiBaseUrl}/as/service/${serviceId}${
      node_id ? `?node_id=${nodeId}` : ''
    }`
  );
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

export function getCallbacks(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  return httpGet(
    `${apiBaseUrl}/as/callback${data ? `?node_id=${data.node_id}` : ''}`
  );
}

export function setCallbacks(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  return httpPost(`${apiBaseUrl}/as/callback`, data);
}
