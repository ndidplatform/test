import * as commonApi from '../../api/v7/common';
import * as ndidApi from '../../api/v7/ndid';
import * as apiHelpers from '../../api/helpers';

export async function ensureService({
  serviceId,
  serviceName,
  dataSchema,
  dataSchemaVersion,
  domain,
  requesterNodeWhitelistEnabled,
}) {
  let response;

  response = await commonApi.getService('ndid1', {
    serviceId,
  });

  if (response.ok) {
    return;
  }

  if (response.status !== 404) {
    throw new Error(`response status: ${response.status}`);
  }

  response = await ndidApi.addService('ndid1', {
    service_id: serviceId,
    service_name: serviceName,
    data_schema: dataSchema,
    data_schema_version: dataSchemaVersion,
    domain,
    requester_node_whitelist_enabled: requesterNodeWhitelistEnabled,
  });

  if (!response.ok) {
    throw new Error(
      `error creating service, response status: ${response.status}`
    );
  }
}

export async function ensureServiceRequesterNodeWhitelistEnabled({
  serviceId,
}) {
  let response;

  let res = await apiHelpers.getResponseAndBody(
    commonApi.getService('ndid1', { serviceId })
  );

  if (res.responseBody.requester_node_whitelist_enabled) {
    return;
  }

  response = await ndidApi.enableServiceRequesterNodeWhitelist('ndid1', {
    service_id: serviceId,
  });

  if (!response.ok) {
    throw new Error(
      `error enabling service requester node whitelist, response status: ${response.status}`
    );
  }
}

export async function ensureNodeInServiceRequesterNodeWhitelist({
  serviceId,
  nodeId,
}) {
  let response;

  let res = await apiHelpers.getResponseAndBody(
    commonApi.getServiceRequesterNodeWhitelistByServiceId('ndid1', {
      serviceId,
    })
  );

  const foundNode = res.responseBody.node_id_list.find((nid) => nid === nodeId);

  if (foundNode != null) {
    return;
  }

  response = await ndidApi.addNodeToServiceRequesterNodeWhitelist('ndid1', {
    service_id: serviceId,
    node_id: nodeId,
  });

  if (!response.ok) {
    throw new Error(
      `error adding node to service requester node whitelist, response status: ${response.status}`
    );
  }
}
