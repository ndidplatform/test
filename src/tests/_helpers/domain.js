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
