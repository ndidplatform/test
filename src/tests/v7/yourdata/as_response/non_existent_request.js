import { expect } from 'chai';

import * as ndidApi from '../../../../api/v7/ndid';
import * as yourDataAsApi from '../../../../api/v7/yourdata/as';
import { randomNumber } from '../../../../utils/random';
import { waitUntilBlockHeightMatch } from '../../../../tendermint';

describe('Non-existent request', function () {
  const errorCode = randomNumber(10000, 99999);
  const type = 'as';
  const description = `Test error code - ${errorCode}`;

  const errorMessage = 'Test error response';

  before(async function () {
    this.timeout(10000);

    let response;
    let responseBody;

    // add error code
    response = await ndidApi.addDomainErrorCode('ndid1', {
      domain: 'YourData',
      error_code: errorCode,
      type,
      description,
    });
    if (!response.ok) {
      throw new Error('error adding YourData error code');
    }

    await waitUntilBlockHeightMatch('as1', 'ndid1');
  });

  it('AS should NOT be able to respond data', async function () {
    this.timeout(10000);
    const response = await yourDataAsApi.sendData('as1', {
      // node_id: asNodeId,
      request_id: 'non-existent',
      data: '<DATA>',
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20114);
  });

  it('AS should NOT be able to respond error', async function () {
    this.timeout(10000);
    const response = await yourDataAsApi.sendError('as1', {
      // node_id: asNodeId,
      request_id: 'non-existent',
      error_code: errorCode,
      error_message: errorMessage,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20114);
  });
});
