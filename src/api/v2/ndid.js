import { getApiAddressUrl, httpGet, httpPost, httpDelte } from '../helpers';

export function registerNamespace(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId);
  return httpPost(`${apiBaseUrl}/ndid/namespaces`, data);
}

export function updateNode(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId);
  return httpPost(`${apiBaseUrl}/ndid/updateNode`, data);
}

export function setTimeoutBlockRegisterMqDestination(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId);
  return httpPost(
    `${apiBaseUrl}/ndid/setTimeoutBlockRegisterMqDestination`,
    data
  );
}

export function addService(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId);
  return httpPost(`${apiBaseUrl}/ndid/services`, data);
}

export function updateService(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId);
  const { service_id, ...rest } = data;
  return httpPost(`${apiBaseUrl}/ndid/services/${service_id}`, rest);
}

export function disableService(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId);
  const { service_id } = data;
  return httpDelte(`${apiBaseUrl}/ndid/services/${service_id}`);
}

export function approveService(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId);
  return httpPost(`${apiBaseUrl}/ndid/approveService`, data);
}
