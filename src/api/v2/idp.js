import { getApiAddressUrl, httpGet, httpPost } from '../helpers';

//idp
export function getCallbacks(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  return httpGet(
    `${apiBaseUrl}/idp/callback${data ? `node_id=${data.node_id}` : ''}`
  );
}

export function setCallbacks(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  return httpPost(`${apiBaseUrl}/idp/callback`, data);
}

export function createResponse(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  return httpPost(`${apiBaseUrl}/idp/response`, data);
}

//identity
export function createIdentity(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  return httpPost(`${apiBaseUrl}/identity`, data);
}

export function addAccessorMethod(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const { namespace, identifier, ...rest } = data;
  return httpPost(
    `${apiBaseUrl}/identity/${namespace}/${identifier}/accessors`,
    rest
  );
}

export function updateIdentityIal(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const { namespace, identifier, ...rest } = data;
  return httpPost(
    `${apiBaseUrl}/identity/${namespace}/${identifier}/ial`,
    rest
  );
}

export function closeIdentityRequest(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  return httpPost(`${apiBaseUrl}/identity/requests/close`, data);
}

export function getRequestIdByReferenceId(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const { reference_id, node_id } = data;
  return httpGet(
    `${apiBaseUrl}/identity/requests/reference/${reference_id}${
      node_id ? `?node_id=${node_id}` : ''
    }`
  );
}

export function reCalculateSecret(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  return httpPost(`${apiBaseUrl}/identity/secret`, data);
}
