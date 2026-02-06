import * as ndidApi from '../../../api/v7/ndid';
import * as asApi from '../../../api/v7/as';

import { as1EventEmitter } from '../../../callback_server';

import { createEventPromise, generateReferenceId } from '../../../utils';

import * as config from '../../../config';

export async function ensureASService({
  asNodeId,
  serviceId,
  minIal,
  minAal,
  supportedNamespaceList,
}) {
  let response;

  response = await asApi.getService('ndid1', {
    serviceId,
  });

  if (response.ok) {
    return;
  }

  if (response.status !== 404) {
    throw new Error(`response status: ${response.status}`);
  }

  //

  response = await ndidApi.approveService('ndid1', {
    node_id: asNodeId,
    service_id: serviceId,
  });

  if (!response.ok) {
    throw new Error(
      `error approving AS service, response status: ${response.status}`
    );
  }

  //

  const referenceId = generateReferenceId();

  const resultPromise = createEventPromise();

  const listener = (callbackData) => {
    if (callbackData.type === 'add_or_update_service_result') {
      if (callbackData.reference_id === referenceId) {
        resultPromise.resolve(callbackData);
      }
    }
  };
  as1EventEmitter.on('callback', listener);

  response = await asApi.addOrUpdateService(asNodeId, {
    serviceId,
    reference_id: referenceId,
    callback_url: config.AS1_CALLBACK_URL,
    min_ial: minIal,
    min_aal: minAal,
    url: config.AS1_CALLBACK_URL,
    supported_namespace_list: supportedNamespaceList,
  });

  if (!response.ok) {
    throw new Error(
      `error add or update AS service, response status: ${response.status}`
    );
  }

  const addOrUpdateServiceResult = await resultPromise.promise;

  as1EventEmitter.removeListener('callback', listener);

  if (!addOrUpdateServiceResult.success) {
    throw new Error('error add or update AS service');
  }
}
