import { getApiAddressUrl, httpGet, httpPost } from '../helpers';
import API_VERSION from './apiVersion';

export function createIdentity(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  return httpPost(`${apiBaseUrl}/identity`, data);
}

export function getExistingIdentity(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { namespace, identifier } = data;
  return httpGet(`${apiBaseUrl}/${namespace}/${identifier}`);
}

export function getIdentityIal(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { namespace, identifier } = data;
  return httpGet(`${apiBaseUrl}/${namespace}/${identifier}`);
}

//////////////////////////////////////////////////////////

export function addAccessorMethod(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { namespace, identifier, ...rest } = data;
  return httpPost(
    `${apiBaseUrl}/identity/${namespace}/${identifier}/accessors`,
    rest
  );
}

export function revokeAccessorMethod(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { namespace, identifier, ...rest } = data;
  return httpPost(
    `${apiBaseUrl}/identity/${namespace}/${identifier}/accessors_revoke`,
    rest
  );
}

export function updateIdentityIal(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { namespace, identifier, ...rest } = data;
  return httpPost(
    `${apiBaseUrl}/identity/${namespace}/${identifier}/ial`,
    rest
  );
}

export function closeIdentityRequest(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  return httpPost(`${apiBaseUrl}/identity/requests/close`, data);
}

export function getRequestIdByReferenceId(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { reference_id, node_id } = data;
  return httpGet(
    `${apiBaseUrl}/identity/requests/reference/${reference_id}${
      node_id ? `?node_id=${node_id}` : ''
    }`
  );
}

export function reCalculateSecret(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  return httpPost(`${apiBaseUrl}/identity/secret`, data);
}
