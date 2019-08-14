import { expect } from 'chai';

import * as ndidApi from '../../../api/v4/ndid';
import * as commonApi from '../../../api/v4/common';
import { wait } from '../../../utils';
import { ndidAvailable } from '../..';

describe('NDID update nodes', function() {
  const max_ial = 1.1;
  const max_aal = 1;

  const rp_node_name = 'test update node_name rp1';
  const idp_node_name = 'test update node_name idp1';
  const as_node_name = 'test update node_name as1';

  before(function() {
    if (!ndidAvailable) {
      this.skip();
    }
  });

  it("NDID should update RP's node name successfully", async function() {
    this.timeout(10000);
    const response = await ndidApi.updateNode('ndid1', {
      node_id: 'rp1',
      node_name: rp_node_name,
    });
    expect(response.status).to.equal(204);
    await wait(3000);
  });

  it("RP's node name should be updated successfully", async function() {
    this.timeout(10000);
    const response = await commonApi.getNodeInfo('rp1');
    const responseBody = await response.json();
    expect(responseBody.node_name).to.equal(rp_node_name);
    expect(responseBody.role).to.equal('RP');
    expect(responseBody.public_key).to.be.a('string').that.is.not.empty;
  });

  it("NDID should update IDP's node name successfully", async function() {
    this.timeout(10000);
    const response = await ndidApi.updateNode('ndid1', {
      node_id: 'idp1',
      node_name: idp_node_name,
    });
    expect(response.status).to.equal(204);
    await wait(3000);
  });

  it("IDP's node name should be updated successfully", async function() {
    this.timeout(10000);
    const response = await commonApi.getNodeInfo('idp1');
    const responseBody = await response.json();
    expect(responseBody.node_name).to.equal(idp_node_name);
    expect(responseBody.role).to.equal('IdP');
    expect(responseBody.public_key).to.be.a('string').that.is.not.empty;
  });

  it("NDID should update IDP's max ial successfully", async function() {
    this.timeout(10000);
    const response = await ndidApi.updateNode('ndid1', {
      node_id: 'idp1',
      max_ial: max_ial,
    });
    expect(response.status).to.equal(204);
    await wait(3000);
  });

  it("IDP's max ial should be updated successfully", async function() {
    this.timeout(10000);
    const response = await commonApi.getNodeInfo('idp1');
    const responseBody = await response.json();
    expect(responseBody.max_ial).to.equal(max_ial);
    expect(responseBody.role).to.equal('IdP');
    expect(responseBody.public_key).to.be.a('string').that.is.not.empty;
  });

  it("NDID should update IDP's max aal successfully", async function() {
    this.timeout(10000);
    const response = await ndidApi.updateNode('ndid1', {
      node_id: 'idp1',
      max_aal: max_aal,
    });
    expect(response.status).to.equal(204);
    await wait(3000);
  });

  it("IDP's max aal should be updated successfully", async function() {
    this.timeout(10000);
    const response = await commonApi.getNodeInfo('idp1');
    const responseBody = await response.json();
    expect(responseBody.max_aal).to.equal(max_aal);
    expect(responseBody.role).to.equal('IdP');
    expect(responseBody.public_key).to.be.a('string').that.is.not.empty;
  });

  it("NDID should update AS's node name successfully", async function() {
    this.timeout(10000);
    const response = await ndidApi.updateNode('ndid1', {
      node_id: 'as1',
      node_name: as_node_name,
    });
    expect(response.status).to.equal(204);
    await wait(3000);
  });

  it("AS's node name should be updated successfully", async function() {
    this.timeout(10000);
    const response = await commonApi.getNodeInfo('as1');
    const responseBody = await response.json();
    expect(responseBody.node_name).to.equal(as_node_name);
    expect(responseBody.role).to.equal('AS');
    expect(responseBody.public_key).to.be.a('string').that.is.not.empty;
  });

  after(async function() {
    this.timeout(5000);
    await ndidApi.updateNode('ndid1', {
      node_id: 'idp1',
      max_aal: 3,
      max_ial: 3,
    });
    await wait(3000);
  });
});
