import { getApiAddressUrl, httpGet, httpPost } from '../helpers';
import API_VERSION from './apiVersion';

export function createIdentity(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  return httpPost(`${apiBaseUrl}/identity`, data);
}

export function addIdentity(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { namespace, identifier, ...rest } = data;
  return httpPost(`${apiBaseUrl}/identity/${namespace}/${identifier}`, rest);
}

export function getIdentityInfo(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { namespace, identifier } = data;
  return httpGet(`${apiBaseUrl}/identity/${namespace}/${identifier}`);
}

export function getIdentityIal(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { namespace, identifier, node_id } = data;
  return httpGet(
    `${apiBaseUrl}/identity/${namespace}/${identifier}/ial${
      node_id ? `?node_id=${node_id}` : ''
    }`,
  );
}

export function addAccessor(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { namespace, identifier, ...rest } = data;
  return httpPost(
    `${apiBaseUrl}/identity/${namespace}/${identifier}/accessors`,
    rest,
  );
}

export function revokeAccessor(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { namespace, identifier, ...rest } = data;
  return httpPost(
    `${apiBaseUrl}/identity/${namespace}/${identifier}/accessor_revoke`,
    rest,
  );
}

export function revokeIdentityAssociation(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { namespace, identifier, ...rest } = data;
  return httpPost(
    `${apiBaseUrl}/identity/${namespace}/${identifier}/association_revoke`,
    rest,
  );
}

export function closeIdentityRequest(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  return httpPost(`${apiBaseUrl}/identity_request/request_close`, data);
}

export function getRequestIdByReferenceId(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { reference_id, node_id } = data;
  return httpGet(
    `${apiBaseUrl}/identity_request/request_references/${reference_id}${
      node_id ? `?node_id=${node_id}` : ''
    }`,
  );
}

export function updateIdentityIal(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { namespace, identifier, ...rest } = data;
  return httpPost(
    `${apiBaseUrl}/identity/${namespace}/${identifier}/ial`,
    rest,
  );
}

export function upgradeIdentityMode(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { namespace, identifier, ...rest } = data;
  return httpPost(
    `${apiBaseUrl}/identity/${namespace}/${identifier}/mode`,
    rest,
  );
}

export function revokeAndAddAccessor(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { namespace, identifier, ...rest } = data;
  return httpPost(
    `${apiBaseUrl}/identity/${namespace}/${identifier}/accessor_revoke_and_add`,
    rest,
  );
}
