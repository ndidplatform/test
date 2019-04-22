import { expect } from 'chai';

import * as ndidApi from '../../../api/v3/ndid';
import { ndidAvailable } from '../..';

describe('NDID response errors', function() {
  before(function() {
    if (!ndidAvailable) {
      this.skip();
    }
  });

//   it('NDID should get an error when register namespace with reserved word (requests)', async function() {
//     this.timeout(10000);
//     const response = await ndidApi.registerNamespace('ndid1', {
//       namespace: 'requests',
//       description: 'test register namespace with reserved word (requests)',
//     });
//     const responseBody = await response.json();
//     expect(response.status).to.equal(400);
//     expect(responseBody).to.deep.include({
//       message:
//         'Input namespace cannot be reserved words ("requests" and "housekeeping")',
//     });
//   });

//   it('NDID should get an error when register namespace with reserved word (housekeeping)', async function() {
//     this.timeout(10000);
//     const response = await ndidApi.registerNamespace('ndid1', {
//       namespace: 'housekeeping',
//       description: 'test register namespace with reserved word (housekeeping)',
//     });
//     const responseBody = await response.json();
//     expect(response.status).to.equal(400);
//     expect(responseBody).to.deep.include({
//       message:
//         'Input namespace cannot be reserved words ("requests" and "housekeeping")',
//     });
//   });

  it('NDID should get an error when set node token with not existing node id', async function() {
    this.timeout(10000);
    const response = await ndidApi.setNodeToken('ndid1', {
      node_id: 'notExistingNodeId',
      amount: 100,
    });

    const responseBody = await response.json();

    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(25006);
  });

  it('NDID should get an error when set node token with negative number', async function() {
    this.timeout(10000);

    const response = await ndidApi.setNodeToken('ndid1', {
      node_id: 'rp1',
      amount: -1000,
    });

    const responseBody = await response.json();

    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20003);
  });

  it('NDID should get an error when add node token with negative number', async function() {
    this.timeout(10000);
    const response = await ndidApi.addNodeToken('ndid1', {
      node_id: 'rp1',
      amount: -1000,
    });

    const responseBody = await response.json();

    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20003);
  });

  it('NDID should get an error when reduce node token with negative number', async function() {
    this.timeout(10000);
    const response = await ndidApi.reduceNodeToken('ndid1', {
      node_id: 'rp1',
      amount: -1000,
    });

    const responseBody = await response.json();

    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20003);
  });

  it('NDID should get an error when reduce node token greater than existing token (negative token value)', async function() {
    this.timeout(10000);
    const response = await ndidApi.reduceNodeToken('ndid1', {
      node_id: 'rp1',
      amount: 9999999,
    });

    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(25007);
  });
  it('NDID should get an error when add service with data_schema = {} (cannot JSON.parse())', async function() {
    this.timeout(15000);
    const response = await ndidApi.addService('ndid1', {
      service_id: 'service_with_data_schema',
      service_name: 'Test add new service with data schema',
      data_schema: {},
    });
    expect(response.status).to.equal(500);
    // const responseBody = await response.json();
    // expect(responseBody.error.message).to.equal(
    //   'Cannot validate data schema'
    // );
  });

  it('NDID should get an error when add service with data_schema (cannot JSON.parse())', async function() {
    this.timeout(15000);
    const response = await ndidApi.addService('ndid1', {
      service_id: 'service_with_data_schema',
      service_name: 'Test add new service with data schema',
      data_schema: {
        // Not use JSON.stringify()
        properties: {
          namespace: { type: 'string', minLength: 1 },
          identifier: { type: 'string', minLength: 1 },
        },
        required: ['namespace', 'identifier'],
      },
    });
    expect(response.status).to.equal(500);
    // const responseBody = await response.json();
    // expect(responseBody.error.message).to.equal(
    //   'Cannot validate data schema'
    // );
  });

  it('NDID should get an error when add service with Invalid data schema (minLength: -1)', async function() {
    this.timeout(15000);
    const response = await ndidApi.addService('ndid1', {
      service_id: 'service_with_data_schema',
      service_name: 'Test add new service with data schema',
      data_schema: JSON.stringify({
        properties: {
          namespace: { type: 'string', minLength: -1 }, //minLength: -1 (Invalid data schema)
          identifier: { type: 'string', minLength: -1 },
        },
        required: ['namespace', 'identifier'],
      }),
    });
    expect(response.status).to.equal(500);
    const responseBody = await response.json();
    expect(responseBody.error.message).to.equal('Invalid data schema schema');
  });

  it('NDID should get an error when approve service with not existing node id', async function() {
    this.timeout(15000);
    const response = await ndidApi.approveService('ndid1', {
      node_id: 'notExistingNodeId',
      service_id: 'bank_statement',
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(25015);
  });

  it('NDID should get an error when approve service with not existing service_id', async function() {
    this.timeout(15000);
    const response = await ndidApi.approveService('ndid1', {
      node_id: 'as1',
      service_id: 'notExistingServiceId',
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(25018);
  });

  it("NDID should get an error when approve service with node's role is not AS", async function() {
    this.timeout(15000);
    const response = await ndidApi.approveService('ndid1', {
      node_id: 'idp1',
      service_id: 'bank_statement',
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(25053);
  });
});
