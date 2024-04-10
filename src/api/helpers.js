import fetch from 'node-fetch';
import {
  nodeIdMappingAddress,
  httpHeaderNdidMemberAppType,
  httpHeaderNdidMemberAppVersion,
} from '../config';

export function getApiAddressUrl(nodeId) {
  if (nodeIdMappingAddress && nodeIdMappingAddress[nodeId]) {
    return nodeIdMappingAddress[nodeId];
  }
  if (nodeId === 'rp1') {
    return 'http://localhost:8200';
  } else if (nodeId === 'rp2') {
    return 'http://localhost:8201';
  } else if (nodeId === 'idp1') {
    return 'http://localhost:8100';
  } else if (nodeId === 'idp2') {
    return 'http://localhost:8101';
  } else if (nodeId === 'idp3') {
    return 'http://localhost:8102';
  } else if (nodeId === 'as1') {
    return 'http://localhost:8300';
  } else if (nodeId === 'as2') {
    return 'http://localhost:8301';
  } else if (nodeId === 'ndid1') {
    return 'http://localhost:8080';
  } else if (nodeId === 'proxy1') {
    return 'http://localhost:8400';
  } else if (nodeId === 'proxy2') {
    return 'http://localhost:8401';
  } else {
    throw new Error('Unsupported Node ID');
  }
}

const HTTP_HEADER_FIELDS = {
  ndidMemberAppType: 'ndid-member-app-type',
  ndidMemberAppVersion: 'ndid-member-app-version',
};

export async function httpGet(url) {
  let additionalHeaders = {};
  if (httpHeaderNdidMemberAppType) {
    additionalHeaders[HTTP_HEADER_FIELDS.ndidMemberAppType] =
      httpHeaderNdidMemberAppType;
  }
  if (httpHeaderNdidMemberAppVersion) {
    additionalHeaders[HTTP_HEADER_FIELDS.ndidMemberAppVersion] =
      httpHeaderNdidMemberAppVersion;
  }

  return fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...additionalHeaders,
    },
  });
}

export async function httpPost(url, body) {
  let additionalHeaders = {};
  if (httpHeaderNdidMemberAppType) {
    additionalHeaders[HTTP_HEADER_FIELDS.ndidMemberAppType] =
      httpHeaderNdidMemberAppType;
  }
  if (httpHeaderNdidMemberAppVersion) {
    additionalHeaders[HTTP_HEADER_FIELDS.ndidMemberAppVersion] =
      httpHeaderNdidMemberAppVersion;
  }

  return fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...additionalHeaders,
    },
    body: JSON.stringify(body),
  });
}

export async function httpDelete(url) {
  let additionalHeaders = {};
  if (httpHeaderNdidMemberAppType) {
    additionalHeaders[HTTP_HEADER_FIELDS.ndidMemberAppType] =
      httpHeaderNdidMemberAppType;
  }
  if (httpHeaderNdidMemberAppVersion) {
    additionalHeaders[HTTP_HEADER_FIELDS.ndidMemberAppVersion] =
      httpHeaderNdidMemberAppVersion;
  }

  return fetch(url, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
      ...additionalHeaders,
    },
  });
}

export async function getResponseAndBody(apiFunctionCall) {
  const response = await apiFunctionCall;
  const responseBody = await response.json();
  if (!response.ok) {
    throw new Error(`response: ${JSON.stringify(responseBody)}`);
  }

  return {
    response,
    responseBody,
  };
}
