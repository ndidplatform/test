import * as commonApi from '../../../api/v6/common';
import * as utils from '../../../utils';
import { idpReceiveCreateResponseResultCallbackTest } from './request_flow_fragments/idp';

export async function createIdpIdList({
  createRequestParams,
  callRpApiAtNodeId,
  mimeType,
  filterForNodeId,
}) {
  let idp_id_list;
  let filter_for_node_id = filterForNodeId ? filterForNodeId : '';
  if (
    createRequestParams.idp_id_list &&
    createRequestParams.idp_id_list.length > 0
  ) {
    idp_id_list = createRequestParams.idp_id_list;
  } else {
    const responseGetRelevantIdpNodesBySid =
      await commonApi.getRelevantIdpNodesBySid(callRpApiAtNodeId, {
        namespace: createRequestParams.namespace,
        identifier: createRequestParams.identifier,
        mode: createRequestParams.mode,
        min_ial: createRequestParams.min_ial,
        filter_for_node_id,
      });
    let responseBody = await responseGetRelevantIdpNodesBySid.json();
    let idpIdListResult = [];
    if (mimeType) {
      let resultIdp = [];
      mimeType.forEach((mimeType) => {
        let resultFilterMimeType = responseBody.filter((idp) =>
          idp.supported_request_message_data_url_type_list.includes(mimeType)
        );
        let result = resultFilterMimeType.map((result) => result.node_id);
        resultIdp = resultIdp.concat(result);
      });
      idpIdListResult = [...new Set(resultIdp)];
      idp_id_list = idpIdListResult;
    } else {
      idpIdListResult = responseBody;
      idp_id_list = idpIdListResult.map((idp) => idp.node_id);
    }
  }
  return idp_id_list;
}

export async function createDataRequestList({
  createRequestParams,
  requestId,
  initialSalt,
  callRpApiAtNodeId,
}) {
  let data_request_list = [];
  if (createRequestParams.data_request_list) {
    data_request_list = await Promise.all(
      createRequestParams.data_request_list.map(async (service) => {
        let request_params_salt = utils.generateRequestParamSalt({
          requestId,
          serviceId: service.service_id,
          initialSalt,
        });

        let request_params_hash = utils.hash(
          (service.request_params != null ? service.request_params : '') +
            request_params_salt
        );

        let as_id_list = service.as_id_list;
        if (as_id_list == null || as_id_list.length === 0) {
          const responseGetASByServiceId = await commonApi.getASByServiceId(
            callRpApiAtNodeId,
            service.service_id
          );
          const responseBody = await responseGetASByServiceId.json();
          as_id_list = responseBody.map((as) => as.node_id);
        }

        return {
          service_id: service.service_id,
          as_id_list,
          min_as: service.min_as,
          request_params_hash: request_params_hash,
          response_list: [],
        };
      })
    );
  }
  return data_request_list;
}

export function createRequestMessageHash({ createRequestParams, initialSalt }) {
  let request_message_salt = utils.generateRequestMessageSalt({
    initialSalt,
    namespace: createRequestParams.namespace,
    identifier: createRequestParams.identifier,
  });
  let request_message_hash = utils.hash(
    createRequestParams.request_message + request_message_salt
  );
  return request_message_hash;
}

export function setDataSigned(dataRequestList, serviceId, asId) {
  let newDataRequestList = dataRequestList.map((service) => {
    if (service.service_id === serviceId) {
      service.response_list.push({
        as_id: asId,
        signed: true,
        received_data: false,
      });
    }
    return service;
  });
  return newDataRequestList;
}

export function setDataReceived(dataRequestList, serviceId, asId) {
  let newDataRequestList = dataRequestList.map((service) => {
    if (service.service_id === serviceId) {
      let response = service.response_list.find(
        (response) => response.as_id === asId
      );
      if (response) {
        response.received_data = true;
      }
    }
    return service;
  });
  return newDataRequestList;
}

export function setASResponseError(
  dataRequestList,
  serviceId,
  asId,
  errorCode
) {
  let newDataRequestList = dataRequestList.map((service) => {
    if (service.service_id === serviceId) {
      service.response_list.push({
        as_id: asId,
        error_code: errorCode,
      });
    }
    return service;
  });
  return newDataRequestList;
}
