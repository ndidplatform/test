import { getApiAddressUrl, httpGet, httpPost } from '../../helpers';
import API_VERSION from '../apiVersion';

export function createRequest(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  return httpPost(`${apiBaseUrl}/yourdata/rp/requests`, data);
}

export function getRequestIdByReferenceId(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { reference_id } = data;
  return httpGet(
    `${apiBaseUrl}/yourdata/rp/request_references/${reference_id}`
  );
}

export function createDataDecryptionKeyRetryRequest(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  return httpPost(
    `${apiBaseUrl}/yourdata/rp/data_decryption_key_retry_requests`,
    data
  );
}

export function getDataDecryptionKeyRetryRequestIdByReferenceId(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { reference_id } = data;
  return httpGet(
    `${apiBaseUrl}/yourdata/rp/data_decryption_key_retry_request_references/${reference_id}`
  );
}

export function getDataFromAS(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { requestId, node_id } = data;
  return httpGet(
    `${apiBaseUrl}/yourdata/rp/request_data/${requestId}${
      node_id ? `?node_id=${node_id}` : ''
    }`
  );
}

export function removeAllDataFromAS(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  return httpPost(`${apiBaseUrl}/yourdata//rp/request_data_removal`, data);
}

export function removeDataFromAS(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + API_VERSION;
  const { node_id, request_id } = data;
  return httpPost(
    `${apiBaseUrl}/yourdata/rp/request_data_removal/${request_id}`,
    node_id ? { node_id } : {}
  );
}
