import { getApiAddressUrl, httpGet, httpPost } from '../helpers';

export function getCallbacks(nodeId) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  return httpGet(`${apiBaseUrl}/idp/callback`);
}

export function setCallbacks(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  return httpPost(`${apiBaseUrl}/idp/callback`, data);
}

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

export function createResponse(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  return httpPost(`${apiBaseUrl}/idp/response`, data);
}

export function updateIdentityIal(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/v2';
  const { namespace, identifier, ...rest } = data;
  return httpPost(
    `${apiBaseUrl}/identity/${namespace}/${identifier}/ial`,
    rest
  );
}
