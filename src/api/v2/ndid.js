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

export function disableServiceDestination(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId);
  return httpPost(`${apiBaseUrl}/ndid/disableServiceDestination`, data);
}

export function enableServiceDestination(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId);
  return httpPost(`${apiBaseUrl}/ndid/enableServiceDestination`, data);
}

export function disableService(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId);
  const { service_id } = data;
  return httpPost(`${apiBaseUrl}/ndid/services/${service_id}/disable`, data);
}

export function enableService(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId);
  const { service_id } = data;
  return httpPost(`${apiBaseUrl}/ndid/services/${service_id}/enable`, data);
}

export function disableNamespace(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId);
  const { namespace } = data;
  return httpPost(`${apiBaseUrl}/ndid/namespaces/${namespace}/disable`, data);
}

export function enableNamespace(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId);
  const { namespace } = data;
  return httpPost(`${apiBaseUrl}/ndid/namespaces/${namespace}/enable`, data);
}

export function approveService(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId);
  return httpPost(`${apiBaseUrl}/ndid/approveService`, data);
}

export function setNodeToken(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId);
  return httpPost(`${apiBaseUrl}/ndid/setNodeToken`, data);
}

export function addNodeToken(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId);
  return httpPost(`${apiBaseUrl}/ndid/addNodeToken`, data);
}

export function reduceNodeToken(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId);
  return httpPost(`${apiBaseUrl}/ndid/reduceNodeToken`, data);
}
