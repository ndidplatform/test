import { expect } from 'chai';

import * as ndidApi from '../../api/v2/ndid';
import { ndidAvailable } from '..';

describe('NDID response errors', function() {
  before(function() {
    if (!ndidAvailable) {
      this.skip();
    }
  });

  it('NDID should get an error when register namespace with reserved word (requests)', async function() {
    this.timeout(10000);
    const response = await ndidApi.registerNamespace('ndid1', {
      namespace: 'requests',
      description: 'test register namespace with reserved word (requests)',
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody).to.deep.include({
      message:
        'Input namespace cannot be reserved words ("requests" and "housekeeping")',
    });
  });

  it('NDID should get an error when register namespace with reserved word (housekeeping)', async function() {
    this.timeout(10000);
    const response = await ndidApi.registerNamespace('ndid1', {
      namespace: 'housekeeping',
      description: 'test register namespace with reserved word (housekeeping)',
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody).to.deep.include({
      message:
        'Input namespace cannot be reserved words ("requests" and "housekeeping")',
    });
  });

  it('NDID should get an error when set node token with not existing node id', async function() {
    this.timeout(10000);
    const response = await ndidApi.setNodeToken('ndid1', {
      node_id: 'notExitingNodeId',
      amount: 100,
    });

    const responseBody = await response.json();

    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(25006); //Token account (Node ID) could not be found
  });

  it('NDID should get an error when set node token with negative number', async function() {
    this.timeout(10000);

    const response = await ndidApi.setNodeToken('ndid1', {
      node_id: 'rp1',
      amount: -1000,
    });

    const responseBody = await response.json();

    //TODO: Expect error code and message
    expect(response.status).to.equal(400);
  });

  it('NDID should get an error when add node token with negative number', async function() {
    this.timeout(10000);
    const response = await ndidApi.addNodeToken('ndid1', {
      node_id: 'rp1',
      amount: -1000,
    });

    const responseBody = await response.json();

    //TODO: Expect error code and message
    expect(response.status).to.equal(400);
  });

  it('NDID should get an error when reduce node token with negative number', async function() {
    this.timeout(10000);
    const response = await ndidApi.reduceNodeToken('ndid1', {
      node_id: 'rp1',
      amount: -1000,
    });

    const responseBody = await response.json();

    //TODO: Expect error code and message
    expect(response.status).to.equal(400);
  });

  //TODO: Wait For Error code
  it('NDID should get an error when reduce node token greater than existing token (negative token value)', async function() {
    this.timeout(10000);
    const response = await ndidApi.reduceNodeToken('ndid1', {
      node_id: 'rp1',
      amount: 9999999,
    });

    const responseBody = await response.json();

    //TODO: Expect error code and message
    expect(response.status).to.equal(400);
  });
});
