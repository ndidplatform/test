import { getApiAddressUrl, httpPost } from './helpers';

export function setTestConfig(nodeId, testConfig) {
  const apiBaseUrl = getApiAddressUrl(nodeId);
  return httpPost(`${apiBaseUrl}/debug/set_test_config`, testConfig);
}

export function getTestConfig(nodeId) {
  const apiBaseUrl = getApiAddressUrl(nodeId);
  return httpPost(`${apiBaseUrl}/debug/get_test_config`);
}
