import { getApiBaseUrl, httpGet, httpPost } from './helpers';

export function getRelevantIdpNodesBySid(nodeId, data) {
  const apiBaseUrl = getApiBaseUrl(nodeId);
  const { namespace, identifier } = data;
  return httpGet(`${apiBaseUrl}/utility/idp/${namespace}/${identifier}`);
}
