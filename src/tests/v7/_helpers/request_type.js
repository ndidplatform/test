import * as commonApi from '../../../api/v7/common';
import * as ndidApi from '../../../api/v7/ndid';
import * as apiHelpers from '../../../api/helpers';

export async function ensureRequestType({ requestType }) {
  const res = await apiHelpers.getResponseAndBody(
    commonApi.getRequestTypeList('ndid1')
  );

  const foundRequestType = res.responseBody.find(
    (type) => type === requestType
  );

  if (foundRequestType == null) {
    await apiHelpers.getResponseAndBody(
      ndidApi.addRequestType('ndid1', {
        name: requestType,
      })
    );
  }
}
