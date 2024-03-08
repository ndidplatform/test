import { expect } from 'chai';

import * as ndidApi from '../../../api/v6/ndid';
import * as commonApi from '../../../api/v6/common';

import { ndidAvailable } from '../../';
import { wait } from '../../../utils';

describe('NDID add new namespace test', function() {
  let namespaces;

  before(async function() {
    if (!ndidAvailable) {
      this.skip();
    }

    //Check already added test_add_new_namespace namespace
    const response = await commonApi.getNamespaces('ndid1');
    namespaces = await response.json();
  });

  it('NDID should add new namespace (namespace_with_no_description) successfully', async function() {
    this.timeout(10000);

    let alreadyAddedNamespace = namespaces.find(
      namespace => namespace.namespace === 'namespace_with_no_description'
    );

    const response = await ndidApi.registerNamespace('ndid1', {
      namespace: 'namespace_with_no_description',
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

  it('Namespace (namespace_with_no_description) should be added successfully', async function() {
    this.timeout(10000);

    let alreadyAddedNamespace = namespaces.find(
      namespace => namespace.namespace === 'namespace_with_no_description'
    );

    const response = await commonApi.getNamespaces('ndid1');
    const responseBody = await response.json();
    const namespace = responseBody.find(
      ns => ns.namespace === 'namespace_with_no_description'
    );
    if (alreadyAddedNamespace) {
      expect(namespace).to.deep.equal({
        namespace: 'namespace_with_no_description',
        description: 'test update namespace description',
        active: true,
      });
    } else {
      expect(namespace).to.deep.equal({
        namespace: 'namespace_with_no_description',
        active: true,
      });
    }
  });

  it('NDID should add new namespace (test_add_new_namespace) successfully', async function() {
    this.timeout(10000);

    let alreadyAddedNamespace = namespaces.find(
      namespace => namespace.namespace === 'test_add_new_namespace'
    );

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

    let alreadyAddedNamespace = namespaces.find(
      namespace => namespace.namespace === 'test_add_new_namespace'
    );

    const response = await commonApi.getNamespaces('ndid1');
    const responseBody = await response.json();
    const namespace = responseBody.find(
      ns => ns.namespace === 'test_add_new_namespace'
    );
    if (alreadyAddedNamespace) {
      expect(namespace).to.deep.equal({
        namespace: 'test_add_new_namespace',
        description: 'Test update namespace',
        active: true,
        allowed_identifier_count_in_reference_group: 1,
        allowed_active_identifier_count_in_reference_group: 1,
      });
    } else {
      expect(namespace).to.deep.equal({
        namespace: 'test_add_new_namespace',
        description: 'Test add new namespace',
        active: true,
      });
    }
  });

  it('NDID should update namespace (namespace_with_no_description) successfully', async function() {
    this.timeout(10000);

    const response = await ndidApi.updateNamespace('ndid1', {
      namespace: 'namespace_with_no_description',
      description: 'test update namespace description',
    });
    expect(response.status).to.equal(204);
    await wait(1000);
  });

  it('Namespace (namespace_with_no_description) should be added successfully', async function() {
    this.timeout(10000);

    const response = await commonApi.getNamespaces('ndid1');
    const responseBody = await response.json();
    const namespace = responseBody.find(
      ns => ns.namespace === 'namespace_with_no_description'
    );
    expect(namespace).to.deep.equal({
      namespace: 'namespace_with_no_description',
      description: 'test update namespace description',
      active: true,
    });
  });

  it('NDID should update namespace (test_add_new_namespace) successfully', async function() {
    this.timeout(10000);

    const response = await ndidApi.updateNamespace('ndid1', {
      namespace: 'test_add_new_namespace',
      description: 'Test update namespace',
      allowed_identifier_count_in_reference_group: 1,
      allowed_active_identifier_count_in_reference_group: 1,
    });
    expect(response.status).to.equal(204);
    await wait(1000);
  });

  it('Namespace (test_add_new_namespace) should be added successfully', async function() {
    this.timeout(10000);

    const response = await commonApi.getNamespaces('ndid1');
    const responseBody = await response.json();
    const namespace = responseBody.find(
      ns => ns.namespace === 'test_add_new_namespace'
    );
    expect(namespace).to.deep.equal({
      namespace: 'test_add_new_namespace',
      description: 'Test update namespace',
      active: true,
      allowed_identifier_count_in_reference_group: 1,
      allowed_active_identifier_count_in_reference_group: 1,
    });
  });
});
