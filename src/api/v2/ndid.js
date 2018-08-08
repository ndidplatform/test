import { getApiAddressUrl, httpGet, httpPost } from '../helpers';

export function registerNamespace(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId);
  return httpPost(`${apiBaseUrl}/ndid/namespaces`, data);
}

export function updateNode(nodeId, data){
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
