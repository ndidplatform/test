import * as commonApi from '../../../api/v7/common';
import * as ndidApi from '../../../api/v7/ndid';

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
