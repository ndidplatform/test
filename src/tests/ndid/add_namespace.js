import { expect } from 'chai';

import * as ndidApi from '../../api/v2/ndid';
import * as commonApi from '../../api/v2/common';

import { ndidAvailable } from '..';
import { wait } from '../../utils';

describe('NDID add new namespace test', function() {
  let alreadyAddedNamespace;

  before(async function() {
    if (!ndidAvailable) {
      this.skip();
    }

    //Check already added test_add_new_namespace namespace
    const response = await commonApi.getNamespaces('ndid1');
    const responseBody = await response.json();
    alreadyAddedNamespace = responseBody.find(
      (ns) => ns.namespace === 'test_add_new_namespace'
    );
  });

  it('NDID should add new namespace (test_add_new_namespace) successfully', async function() {
    this.timeout(10000);

    const response = await ndidApi.registerNamespace('ndid1', {
      namespace: 'test_add_new_namespace',
      description: 'Test add new namespace',
    });

    if (alreadyAddedNamespace) {
      const responseBody = await response.json();
      expect(response.status).to.equal(400);
      expect(responseBody.error.code).to.equal(25013);
    } else {
      expect(response.status).to.equal(201);
    }
    await wait(1000);
  });

  it('Namespace (test_add_new_namespace) should be added successfully', async function() {
    this.timeout(10000);

    const response = await commonApi.getNamespaces('ndid1');
    const responseBody = await response.json();
    const namespace = responseBody.find(
      (ns) => ns.namespace === 'test_add_new_namespace'
    );
    expect(namespace).to.deep.equal({
      namespace: 'test_add_new_namespace',
      description: 'Test add new namespace',
      active: true,
    });
  });
});
