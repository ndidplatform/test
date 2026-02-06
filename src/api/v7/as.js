import { getApiAddressUrl, httpGet, httpPost } from '../helpers';
import API_VERSION from './apiVersion';

export function getService(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { serviceId, node_id } = data;
  return httpGet(
    `${apiBaseUrl}/as/service/${serviceId}${
      node_id ? `?node_id=${node_id}` : ''
    }`
  );
}

export function addOrUpdateService(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { serviceId, ...rest } = data;
  return httpPost(`${apiBaseUrl}/as/service/${serviceId}`, rest);
}

export function logPaymentReceived(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { requestId, serviceId, ...rest } = data;
  return httpPost(`${apiBaseUrl}/as/payment_received_log/${requestId}/${serviceId}`, rest);
}

export function setServicePrice(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { serviceId, ...rest } = data;
  return httpPost(`${apiBaseUrl}/as/service_price/${serviceId}`, rest);
}

export function sendData(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { requestId, serviceId, ...rest } = data;
  return httpPost(`${apiBaseUrl}/as/data/${requestId}/${serviceId}`, rest);
}

export function sendDataError(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { requestId, serviceId, ...rest } = data;
  return httpPost(`${apiBaseUrl}/as/error/${requestId}/${serviceId}`, rest);
}

export function getCallbacks(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  return httpGet(
    `${apiBaseUrl}/as/callback${data ? `?node_id=${data.node_id}` : ''}`
  );
}

export function setCallbacks(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  return httpPost(`${apiBaseUrl}/as/callback`, data);
}
