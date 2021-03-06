import { getApiAddressUrl, httpGet, httpPost } from '../helpers';
import API_VERSION from './apiVersion';

export function getRelevantIdpNodesBySid(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { namespace, identifier, ...queryParams } = data;
  // const { min_ial, min_aal, mode } = data;

  let arrayQueryString = [];

  Object.keys(queryParams).forEach((key) => {
    if (data[key] !== '') {
      arrayQueryString.push(`${key}=${data[key]}`);
    }
  });

  let queryString = arrayQueryString.join('&');

  return httpGet(
    `${apiBaseUrl}/utility/idp/${namespace}/${identifier}${
      queryString ? `?${queryString}` : ''
    }`,
  );
}

export function getIdP(nodeId, data = {}) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;

  let arrayQueryString = Object.keys(data).map((key) => `${key}=${data[key]}`);
  let queryString = arrayQueryString.join('&');

  return httpGet(
    `${apiBaseUrl}/utility/idp${queryString ? `?${queryString}` : ''}`,
  );
}

export function getRequest(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { requestId } = data;
  return httpGet(`${apiBaseUrl}/utility/requests/${requestId}`);
}

export function getNodeInfo(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  return httpGet(
    `${apiBaseUrl}/utility/nodes/${data ? `${data.node_id}` : `${nodeId}`}`,
  );
}

export function getServices(nodeId) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  return httpGet(`${apiBaseUrl}/utility/services`);
}

export function getASByServiceId(nodeId, serviceId) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  return httpGet(`${apiBaseUrl}/utility/as/${serviceId}`);
}

export function getServiceDataSchema(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { serviceId } = data;
  return httpGet(`${apiBaseUrl}/utility/services/${serviceId}`);
}

export function getToken(nodeId) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  return httpGet(`${apiBaseUrl}/utility/nodes/${nodeId}/token`);
}

export function getNamespaces(nodeId) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  return httpGet(`${apiBaseUrl}/utility/namespaces`);
}

export function getPrivateMessages(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { request_id, node_id } = data;
  return httpGet(
    `${apiBaseUrl}/utility/private_messages/${request_id}${
      node_id ? `?node_id=${node_id}` : ''
    }`,
  );
}

export function removeAllPrivateMessages(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { node_id } = data;
  return httpPost(
    `${apiBaseUrl}/utility/private_message_removal`,
    node_id ? { node_id } : {},
  );
}

export function removePrivateMessages(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { request_id, node_id } = data;
  return httpPost(
    `${apiBaseUrl}/utility/private_message_removal/${request_id}`,
    node_id ? { node_id } : {},
  );
}

export function getIdPErrorCodes(nodeId) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  return httpGet(`${apiBaseUrl}/utility/idp_error_codes`);
}

export function getASErrorCodes(nodeId) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  return httpGet(`${apiBaseUrl}/utility/as_error_codes`);
}
