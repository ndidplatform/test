import * as commonApi from '../../api/v7/common';
import * as ndidApi from '../../api/v7/ndid';
import * as apiHelpers from '../../api/helpers';

export async function ensureDomain({ domain }) {
  const res = await apiHelpers.getResponseAndBody(
    commonApi.getDomainList('ndid1')
  );

  const foundDomain = res.responseBody.find(({ domain: d }) => d === domain);

  if (foundDomain == null) {
    await apiHelpers.getResponseAndBody(
      ndidApi.addDomain('ndid1', {
        domain,
      })
    );
  }
}

export async function ensureDomainNodeWhitelistEnabled({ domain }) {
  const res = await apiHelpers.getResponseAndBody(
    commonApi.getDomainNodeWhitelistByDomain('ndid1', { domain })
  );

  const enabled = res.responseBody.enabled;

  if (!enabled) {
    await apiHelpers.getResponseAndBody(
      ndidApi.enableDomainNodeWhitelist('ndid1', {
        domain,
      })
    );
  }
}

export async function ensureNodeInDomainNodeWhitelist({ domain, nodeId }) {
  const res = await apiHelpers.getResponseAndBody(
    commonApi.getDomainNodeWhitelistByDomain('ndid1', { domain })
  );

  const foundNode = res.responseBody.node_id_list.find((nid) => nid === nodeId);

  if (foundNode == null) {
    await apiHelpers.getResponseAndBody(
      ndidApi.addNodeToDomainNodeWhitelist('ndid1', {
        domain,
        node_id: nodeId,
      })
    );
  }
}
