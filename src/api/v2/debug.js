import { getApiAddressUrl, httpPost, httpGet } from '../helpers';
import * as config from '../../config';

export function transact(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/debug';
  let { fnName, ...rest } = data;
  return httpPost(`${apiBaseUrl}/tmTransact/${fnName}`, rest);
}

export async function query(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/debug';
  let { fnName, ...rest } = data;
  return httpPost(`${apiBaseUrl}//tmQuery/${fnName}`, rest);
}