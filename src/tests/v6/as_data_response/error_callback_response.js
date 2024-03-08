import { expect } from 'chai';

import { as1Available, ndidAvailable } from '../..';
import * as asApi from '../../../api/v6/as';
import * as ndidApi from '../../../api/v6/ndid';
import { as1EventEmitter } from '../../../callback_server';
import { createEventPromise, generateReferenceId, wait } from '../../../utils';
import * as config from '../../../config';

describe('AS error callback response tests', function() {
  const customerAssetsInfoReferenceId = generateReferenceId(); //NDID is not registered this service
  const disapprovedReferenceId = generateReferenceId(); //NDID disapproved this service

  const addOrUpdateServiceCustomerAssetsInfoResultPromise = createEventPromise();
  const addOrUpdateServiceDisapprovedResultPromise = createEventPromise();

  before(async function() {
    if (!as1Available) {
      this.skip();
    }

    this.timeout(10000);
    as1EventEmitter.on('callback', function(callbackData) {
      if (callbackData.type === 'add_or_update_service_result') {
        if (callbackData.reference_id === customerAssetsInfoReferenceId) {
          addOrUpdateServiceCustomerAssetsInfoResultPromise.resolve(
            callbackData
          );
        } else if (callbackData.reference_id === disapprovedReferenceId) {
          addOrUpdateServiceDisapprovedResultPromise.resolve(callbackData);
        }
      }
    });

    if (ndidAvailable) {
      await ndidApi.addService('ndid1', {
        service_id: 'disapproved_service',
        service_name: 'Disapproved service for test',
      });
    }

    // wait for it to propagate to all other Tendermint nodes
    await wait(2000);
  });

  it('should get an error callback response when add offered service (customerAssets_Info) that NDID is not registered', async function() {
    this.timeout(10000);
    const response = await asApi.addOrUpdateService('as1', {
      serviceId: 'customerAssets_Info',
      reference_id: customerAssetsInfoReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      min_ial: 1.1,
      min_aal: 1,
      url: config.AS1_CALLBACK_URL,
      supported_namespace_list: ['citizen_id'],
    });
    expect(response.status).to.equal(202);

    const addOrUpdateServiceResult = await addOrUpdateServiceCustomerAssetsInfoResultPromise.promise;
    expect(addOrUpdateServiceResult).to.deep.include({
      reference_id: customerAssetsInfoReferenceId,
      success: false,
      error: { code: 25018, message: 'Service ID could not be found' },
    });
  });

  it('should get an error callback response when add offered service (disapproved_service) that NDID disapproved service for AS', async function() {
    if (!ndidAvailable) {
      this.skip();
    }

    this.timeout(10000);
    const response = await asApi.addOrUpdateService('as1', {
      serviceId: 'disapproved_service',
      reference_id: disapprovedReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      min_ial: 1.1,
      min_aal: 1,
      url: config.AS1_CALLBACK_URL,
      supported_namespace_list: ['citizen_id'],
    });
    expect(response.status).to.equal(202);

    const addOrUpdateServiceResult = await addOrUpdateServiceDisapprovedResultPromise.promise;
    expect(addOrUpdateServiceResult).to.deep.include({
      reference_id: disapprovedReferenceId,
      success: false,
      error: {
        code: 25028,
        message:
          'Unauthorized to register a service (NDID may have not granted this node the right to register this service)',
      },
    });
  });

  after(function() {
    as1EventEmitter.removeAllListeners('callback');
  });
});
