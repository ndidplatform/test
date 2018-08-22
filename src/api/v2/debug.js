import { getApiAddressUrl, httpPost, httpGet } from '../helpers';

export function transact(nodeId, data) {
  const apiBaseUrl = getApiAddressUrl(nodeId) + '/debug';
  let { fnName, ...rest } = data;
  return httpPost(`${apiBaseUrl}/tmTransact/${fnName}`, rest);
}

export async function query(nodeId, data) {
  let { fnName, ...rest } = data;
  let dataStr = JSON.stringify(rest);
  let base64String = Buffer.from(dataStr).toString('base64');
  let queryData = `${fnName}|${base64String}`;
  let EncodeURIparamString = encodeURIComponent(queryData);
  let uri = `http://localhost:45000/abci_query?data="${EncodeURIparamString}"`;
  let response = await httpGet(uri);
  let responseJson = await response.json();
  let queryResultString = Buffer.from(
    responseJson.result.response.value,
    'base64'
  ).toString();
  try {
    let queryResult = JSON.parse(queryResultString);
    return queryResult;
  } catch (error) {
    new Error('Cannot parse Tendermint query result JSON');
  }
}
