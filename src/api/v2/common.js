import { getApiBaseUrl, httpGet, httpPost } from './helpers';

export function getRelevantIdpNodesBySid(role, data) {
  const apiBaseUrl = getApiBaseUrl(role);
  return httpGet(
    `${apiBaseUrl}/utility/idp/${data.namespace}/${data.identifier}`
  );
}
