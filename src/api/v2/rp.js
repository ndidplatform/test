import { getApiBaseUrl, httpGet, httpPost } from './helpers';

const ROLE = 'rp';
const apiBaseUrl = getApiBaseUrl(ROLE);

export function createRequest(data) {
  return httpPost(
    `${apiBaseUrl}/rp/requests/${data.namespace}/${data.identifier}`,
    data
  );
}
