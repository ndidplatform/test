import * as commonApi from '../../../api/v5/common';

export async function createIdpIdList({
  createRequestParams,
  callRpApiAtNodeId,
}) {
  let idp_id_list;
  if (
    createRequestParams.idp_id_list &&
    createRequestParams.idp_id_list.length > 0
  ) {
    idp_id_list = createRequestParams.idp_id_list;
  } else {
    const responseGetRelevantIdpNodesBySid = await commonApi.getRelevantIdpNodesBySid(
      callRpApiAtNodeId,
      {
        namespace: createRequestParams.namespace,
        identifier: createRequestParams.identifier,
        mode: createRequestParams.mode,
        min_ial: createRequestParams.min_ial,
      },
    );
    const responseBody = await responseGetRelevantIdpNodesBySid.json();
    idp_id_list = responseBody.map((idp) => idp.node_id);
  }
  return idp_id_list;
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
        (response) => response.as_id === asId,
      );
      if (response) {
        response.received_data = true;
      }
    }
    return service;
  });
  return newDataRequestList;
}
