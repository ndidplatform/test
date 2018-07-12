import { getApiAddressUrl, httpGet } from './helpers';

export function getInfo(nodeId) {
  const apiBaseUrl = getApiAddressUrl(nodeId);
  return httpGet(`${apiBaseUrl}/info`);
}
