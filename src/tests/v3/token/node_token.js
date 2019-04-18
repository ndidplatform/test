import { expect } from 'chai';

import * as ndidApi from '../../../api/v3/ndid';
import * as commonApi from '../../../api/v3/common';
import { wait } from '../../../utils';
import { ndidAvailable, rpAvailable } from '../..';

describe('Set Add Reduce tokens tests', function() {
  let nodeTokenBeforeTest = 0;

  before(async function() {
    if (!ndidAvailable || !rpAvailable) {
      this.skip();
    }

    const response = await commonApi.getToken('rp1');
    const responseBody = await response.json();
    nodeTokenBeforeTest = responseBody.amount;
  });

  it('NDID should set node token successfully', async function() {
    this.timeout(10000);

    const response = await ndidApi.setNodeToken('ndid1', {
      node_id: 'rp1',
      amount: 100,
    });

    expect(response.status).to.equal(204);
    await wait(2000);
  });

  it('Node token should be set successfully', async function() {
    this.timeout(10000);

    const response = await commonApi.getToken('rp1');
    const responseBody = await response.json();

    expect(response.status).to.equal(200);
    expect(responseBody.amount).to.equal(100);
  });

  it('NDID should add node token successfully', async function() {
    this.timeout(10000);

    const response = await ndidApi.addNodeToken('ndid1', {
      node_id: 'rp1',
      amount: 50,
    });

    expect(response.status).to.equal(204);
    await wait(2000);
  });

  it('Node token should be added successfully', async function() {
    this.timeout(10000);

    const response = await commonApi.getToken('rp1');
    const responseBody = await response.json();

    expect(response.status).to.equal(200);
    expect(responseBody.amount).to.equal(150);
  });

  it('NDID should reduce node token successfully', async function() {
    this.timeout(10000);

    const response = await ndidApi.reduceNodeToken('ndid1', {
      node_id: 'rp1',
      amount: 50,
    });

    expect(response.status).to.equal(204);
    await wait(2000);
  });

  it('Node token should be reduced successfully', async function() {
    this.timeout(10000);

    const response = await commonApi.getToken('rp1');
    const responseBody = await response.json();

    expect(response.status).to.equal(200);
    expect(responseBody.amount).to.equal(100);
  });

  after(async function() {
    this.timeout(5000);
    await ndidApi.setNodeToken('ndid1', {
      node_id: 'rp1',
      amount: nodeTokenBeforeTest,
    });
    await wait(2000);
  });
});
