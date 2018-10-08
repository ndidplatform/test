import { expect } from 'chai';

import * as ndidApi from '../../../api/v2/ndid';

describe('NDID response errors (proxy)', function() {
  it('NDID should get an error when add node to proxy without node_id', async function() {
    this.timeout(600000);
    const response = await ndidApi.addNodeToProxyNode('ndid1', {
      proxy_node_id: 'proxy1',
      config: 'KEY_ON_PROXY',
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20003);
  });

  it('NDID should get an error when add node to proxy without proxy_node_id', async function() {
    this.timeout(600000);
    const response = await ndidApi.addNodeToProxyNode('ndid1', {
      node_id: 'proxy1_rp4',
      config: 'KEY_ON_PROXY',
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20003);
  });

  it('NDID should get an error when add node to proxy without config', async function() {
    this.timeout(600000);
    const response = await ndidApi.addNodeToProxyNode('ndid1', {
      node_id: 'proxy1_rp4',
      proxy_node_id: 'proxy1',
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20003);
  });

  it('NDID should get an error when add node to proxy with empty string node_id', async function() {
    this.timeout(600000);
    const response = await ndidApi.addNodeToProxyNode('ndid1', {
      node_id: '',
      proxy_node_id: 'proxy1',
      config: 'KEY_ON_PROXY',
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20003);
  });

  it('NDID should get an error when add node to proxy with empty string proxy_node_id', async function() {
    this.timeout(600000);
    const response = await ndidApi.addNodeToProxyNode('ndid1', {
      node_id: 'proxy1_rp4',
      proxy_node_id: '',
      config: 'KEY_ON_PROXY',
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20003);
  });

  it('NDID should get an error when add node to proxy with empty string ', async function() {
    this.timeout(600000);
    const response = await ndidApi.addNodeToProxyNode('ndid1', {
      node_id: 'proxy1_rp4',
      proxy_node_id: 'proxy1',
      config: '',
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20003);
  });

  it('NDID should get an error when add node to proxy with node_id has already been associated with a proxy node', async function() {
    this.timeout(600000);
    const response = await ndidApi.addNodeToProxyNode('ndid1', {
      node_id: 'proxy1_rp4',
      proxy_node_id: 'proxy1',
      config: 'KEY_ON_PROXY',
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(25046);
  });

  it('NDID should get an error when add node to proxy with node_id is a proxy node', async function() {
    this.timeout(600000);
    const response = await ndidApi.addNodeToProxyNode('ndid1', {
      node_id: 'proxy1',
      proxy_node_id: 'proxy1',
      config: 'KEY_ON_PROXY',
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(25047);
  });

  it('NDID should get an error when add node to proxy with node_id is a proxy node', async function() {
    this.timeout(600000);
    const response = await ndidApi.addNodeToProxyNode('ndid1', {
      node_id: 'proxy1',
      proxy_node_id: 'proxy2',
      config: 'KEY_ON_PROXY',
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(25047);
  });

  it('NDID should get an error when add node to proxy with node_id is not existing', async function() {
    this.timeout(600000);
    const response = await ndidApi.addNodeToProxyNode('ndid1', {
      node_id: 'not_existing_node_id',
      proxy_node_id: 'proxy1',
      config: 'KEY_ON_PROXY',
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(25015);
  });

  it('NDID should get an error when add node to proxy with proxy_node_id is not existing', async function() {
    this.timeout(600000);
    const response = await ndidApi.addNodeToProxyNode('ndid1', {
      node_id: 'rp1',
      proxy_node_id: 'not_existing_proxy_node_id',
      config: 'KEY_ON_PROXY',
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(25049);
  });

  it('NDID should get an error when update node_id has not been associated with a proxy node', async function() {
    this.timeout(600000);
    const response = await ndidApi.updateNodeProxyNode('ndid1', {
      node_id: 'rp1',
      proxy_node_id: 'proxy1',
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(25048);
  });

  it('NDID should get an error when update node with node_id is a proxy node', async function() {
    this.timeout(600000);
    const response = await ndidApi.updateNodeProxyNode('ndid1', {
      node_id: 'proxy1',
      proxy_node_id: 'proxy1',
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(25048);
  });

  it('NDID should get an error when update node with node_id is a proxy node', async function() {
    this.timeout(600000);
    const response = await ndidApi.updateNodeProxyNode('ndid1', {
      node_id: 'proxy1',
      proxy_node_id: 'proxy2',
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(25048);
  });

  it('NDID should get an error when update node to not existing proxy node id', async function() {
    this.timeout(600000);
    const response = await ndidApi.updateNodeProxyNode('ndid1', {
      node_id: 'proxy1_rp4',
      proxy_node_id: 'not_existing_proxy_node_id',
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(25049);
  });

  it('NDID should get an error when update node with not existing node id', async function() {
    this.timeout(600000);
    const response = await ndidApi.updateNodeProxyNode('ndid1', {
      node_id: 'not_existing_node_id',
      proxy_node_id: 'proxy1',
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(25015);
  });

  it('NDID should get an error when remove node from proxy without node_id', async function() {
    this.timeout(600000);
    const response = await ndidApi.removeNodeFromProxyNode('ndid1', {});
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20003);
  });

  it('NDID should get an error when remove node from proxy with empty string node_id', async function() {
    this.timeout(600000);
    const response = await ndidApi.removeNodeFromProxyNode('ndid1', {
      node_id: '',
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20003);
  });

  it('NDID should get an error when remove node from proxy with node_id has not been associated with a proxy node', async function() {
    this.timeout(600000);
    const response = await ndidApi.removeNodeFromProxyNode('ndid1', {
      node_id: 'rp1',
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(25048);
  });

  it('NDID should get an error when remove node from proxy with node_id is a proxy node', async function() {
    this.timeout(600000);
    const response = await ndidApi.removeNodeFromProxyNode('ndid1', {
      node_id: 'proxy1',
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(25047);
  });

  it('NDID should get an error when remove node from proxy with not existing node_id', async function() {
    this.timeout(600000);
    const response = await ndidApi.removeNodeFromProxyNode('ndid1', {
      node_id: 'not_existing_node_id',
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(25015);
  });
});
