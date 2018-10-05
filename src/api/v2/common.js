import { getApiAddressUrl, httpGet, httpPost } from '../helpers';

export function getRelevantIdpNodesBySid(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const { namespace, identifier } = data;
  return httpGet(`${apiBaseUrl}/utility/idp/${namespace}/${identifier}`);
}

export function getIdP(nodeId) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  return httpGet(`${apiBaseUrl}/utility/idp`);
}

export function getRequest(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const { requestId } = data;
  return httpGet(`${apiBaseUrl}/utility/requests/${requestId}`);
}

export function getNodeInfo(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  return httpGet(
    `${apiBaseUrl}/utility/nodes/${data ? `${data.node_id}` : `${nodeId}`}`
  );
}

export function getServices(nodeId) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  return httpGet(`${apiBaseUrl}/utility/services`);
}

export function getToken(nodeId) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  return httpGet(`${apiBaseUrl}/utility/nodes/${nodeId}/token`);
}

export function getNamespaces(nodeId) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  return httpGet(`${apiBaseUrl}/utility/namespaces`);
}

export function getPrivateMessages(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const { request_id, node_id } = data;
  return httpGet(
    `${apiBaseUrl}/utility/private_messages/${request_id}${
      node_id ? `?node_id=${node_id}` : ''
    }`
  );
}

export function removePrivateMessages(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const { request_id, node_id } = data;
  return httpPost(
    `${apiBaseUrl}/utility/private_messages/${request_id}/housekeeping${
      node_id ? `?node_id=${node_id}` : ''
    }`,
    {}
  );
}

export function removeAllPrivateMessages(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const { node_id } = data;
  return httpPost(
    `${apiBaseUrl}/utility/private_messages/housekeeping${
      node_id ? `?node_id=${node_id}` : ''
    }`,
    {}
  );
}
