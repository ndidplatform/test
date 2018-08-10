import { getApiAddressUrl, httpGet, httpPost } from '../helpers';

export function getRelevantIdpNodesBySid(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const { namespace, identifier } = data;
  return httpGet(`${apiBaseUrl}/utility/idp/${namespace}/${identifier}`);
}

export function getRequest(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const { requestId } = data;
  return httpGet(`${apiBaseUrl}/utility/requests/${requestId}`);
}

export function getNodeInfo(nodeId) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  return httpGet(`${apiBaseUrl}/utility/nodes/${nodeId}`);
}

export function getServices(nodeId) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  return httpGet(`${apiBaseUrl}/utility/services`);
}

export function getToken(nodeId) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  return httpGet(`${apiBaseUrl}/utility/nodes/${nodeId}/token`);
}
