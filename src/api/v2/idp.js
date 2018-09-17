import { getApiAddressUrl, httpGet, httpPost } from '../helpers';

//idp
export function getCallbacks(nodeId) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  return httpGet(`${apiBaseUrl}/idp/callback?node_id=${nodeId}`);
}

export function setCallbacks(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const body = { ...data, node_id: nodeId };
  return httpPost(`${apiBaseUrl}/idp/callback`, body);
}

export function createResponse(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const body = { ...data, node_id: nodeId };
  return httpPost(`${apiBaseUrl}/idp/response`, body);
}

//identity
export function createIdentity(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const body = { ...data, node_id: nodeId };
  return httpPost(`${apiBaseUrl}/identity`, body);
}

export function addAccessorMethod(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const { namespace, identifier, ...rest } = data;
  const body = { ...rest, node_id: nodeId };
  return httpPost(
    `${apiBaseUrl}/identity/${namespace}/${identifier}/accessors`,
    body
  );
}

export function updateIdentityIal(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const { namespace, identifier, ...rest } = data;
  const body = { ...rest, node_id: nodeId };
  return httpPost(
    `${apiBaseUrl}/identity/${namespace}/${identifier}/ial`,
    body
  );
}

export function closeIdentityRequest(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const body = { ...data, node_id: nodeId };
  return httpPost(`${apiBaseUrl}/identity/requests/close`, body);
}

export function getRequestIdByReferenceId(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const { reference_id } = data;
  return httpGet(
    `${apiBaseUrl}/identity/requests/reference/${reference_id}?node_id=${nodeId}`
  );
}

export function reCalculateSecret(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  return httpPost(`${apiBaseUrl}/identity/secret`, data);
}
