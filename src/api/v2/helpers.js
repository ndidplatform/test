import fetch from 'node-fetch';

export function getApiBaseUrl(role) {
  if (role === 'rp') {
    return 'http://localhost:8200/v2';
  } else if (role === 'idp') {
    return 'http://localhost:8100/v2';
  } else if (role === 'as') {
    return 'http://localhost:8300/v2';
  } else if (role === 'ndid') {
    return 'http://localhost:8000';
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
