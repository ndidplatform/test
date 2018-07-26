import { getApiAddressUrl, httpPost } from '../helpers';

export function transact(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/debug';
  let { fnName, ...rest } = data;
  return httpPost(`${apiBaseUrl}/tmTransact/${fnName}`, rest);
}