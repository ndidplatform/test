import { expect } from 'chai';

import * as commonApi from '../../../api/v2/common';
import * as util from '../../../utils';

export async function verifyRequestParamsHash({
  callApiAtNodeId,
  createRequestParams,
  requestId,
  initialSalt,
}) {
  const response = await commonApi.getRequest(callApiAtNodeId, { requestId });
  const requestDetail = await response.json();
  createRequestParams.data_request_list.forEach(dataRequestList => {
    const serviceId = dataRequestList.service_id;
    const requestParamsSalt = util.generateRequestParamSalt({
      requestId,
      serviceId,
      initialSalt,
    });
    const requestParams = dataRequestList.request_params
      ? dataRequestList.request_params
      : '';

    const requestParamsHash = util.hash(requestParams + requestParamsSalt);
    const requestParamsHashFromRequestDetail = requestDetail.data_request_list.find(
      request => request.service_id === serviceId
    );

    expect(requestParamsHashFromRequestDetail.request_params_hash).to.equal(
      requestParamsHash
    );
  });
}
