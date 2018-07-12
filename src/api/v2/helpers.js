import fetch from 'node-fetch';

export function getApiBaseUrl(nodeId) {
  if (nodeId === 'rp1') {
    return 'http://localhost:8200/v2';
  } else if (nodeId === 'idp1') {
    return 'http://localhost:8100/v2';
  } else if (nodeId === 'idp2') {
    return 'http://localhost:8101/v2';
  } else if (nodeId === 'as1') {
    return 'http://localhost:8300/v2';
  } else if (nodeId === 'as2') {
    return 'http://localhost:8301/v2';
  } else if (nodeId === 'ndid1') {
    return 'http://localhost:8000';
  } else {
    throw new Error('Unsupported Node ID');
  }
}

export async function httpGet(url) {
  return fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });
}

export async function httpPost(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}
