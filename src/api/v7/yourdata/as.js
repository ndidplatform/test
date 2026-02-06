import { getApiAddressUrl, httpGet, httpPost } from '../../helpers';
import API_VERSION from '../apiVersion';

export function getCallbacks(nodeId) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  return httpGet(`${apiBaseUrl}/yourdata/as/callback`);
}

export function setCallbacks(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  return httpPost(`${apiBaseUrl}/yourdata/as/callback`, data);
}

export function getService(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { serviceId, as_node_id } = data;
  return httpGet(
    `${apiBaseUrl}/yourdata/as/service/${serviceId}${
      as_node_id ? `?as_node_id=${as_node_id}` : ''
    }`
  );
}

export function addOrUpdateService(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { serviceId, ...rest } = data;
  return httpPost(`${apiBaseUrl}/yourdata/as/service/${serviceId}`, rest);
}

export function sendData(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  return httpPost(`${apiBaseUrl}/yourdata/as/data`, data);
}

export function sendError(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  return httpPost(`${apiBaseUrl}/yourdata/as/error`, data);
}
