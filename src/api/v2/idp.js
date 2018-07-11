import { getApiBaseUrl, httpGet, httpPost } from './common';

const ROLE = 'idp';
const apiBaseUrl = getApiBaseUrl(ROLE);

export function setCallback(data) {
  return httpPost(`${apiBaseUrl}/idp/callback`, data);
}

export function createIdentity(data) {
  return httpPost(`${apiBaseUrl}/identity`, data);
}

export function createResponse(data) {
  return httpPost(`${apiBaseUrl}/idp/response`, data);
}
