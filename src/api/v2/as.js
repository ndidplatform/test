import { getApiAddressUrl, httpGet, httpPost } from '../helpers';

export function getService(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const { serviceId } = data;
  return httpGet(`${apiBaseUrl}/as/service/${serviceId}?node_id=${nodeId}`);
}

export function addOrUpdateService(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const { serviceId, ...rest } = data;
  const body = { ...rest, node_id: nodeId };
  return httpPost(`${apiBaseUrl}/as/service/${serviceId}`, body);
}

export function sendData(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const { requestId, serviceId, ...rest } = data;
  const body = { ...rest, node_id: nodeId };
  return httpPost(`${apiBaseUrl}/as/data/${requestId}/${serviceId}`, body);
}

export function getCallbacks(nodeId) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  return httpGet(`${apiBaseUrl}/as/callback?node_id=${nodeId}`);
}

export function setCallbacks(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const body = { ...data, node_id: nodeId };
  return httpPost(`${apiBaseUrl}/as/callback`, body);
}
