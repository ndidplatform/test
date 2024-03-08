import { expect } from 'chai';

import * as ndidApi from '../../../api/v6/ndid';
import * as commonApi from '../../../api/v6/common';
import { wait } from '../../../utils';
import { ndidAvailable, idp3Available } from '../..';

describe('Update IdP agent and get all IdP by filter agent tests', function () {
  before(function () {
    if (!ndidAvailable || !idp3Available ) {
      this.skip();
    }
  });

  it('NDID should update IdP node to IdP agent successfully', async function () {
    this.timeout(10000);
    const response = await ndidApi.updateNode('ndid1', {
      node_id: 'idp3',
      agent: true,
    });
    expect(response.status).to.equal(204);

    await wait(3000);

    const responseGetNodeInfo = await commonApi.getNodeInfo('ndid1', {
      node_id: 'idp3',
    });
    const responseBody = await responseGetNodeInfo.json();
    expect(responseGetNodeInfo.status).to.equal(200);
    expect(responseBody.agent).to.be.true;
  });

  it('Should get all IdP filter by agent = true successfully', async function () {
    this.timeout(10000);
    const response = await commonApi.getIdP('ndid1', { agent: true });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.be.an('array');
    expect(responseBody).to.have.length(1);
    expect(responseBody[0].node_id).to.equal('idp3');
  });

  it('Should not get idp3 or any idp agent when get all IdP filter by agent = false', async function () {
    this.timeout(10000);
    const response = await commonApi.getIdP('ndid1', { agent: false });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.be.an('array');
    let IdPIsAgent = responseBody.filter((idp) => idp.agent === true);
    expect(IdPIsAgent).to.be.an('array').to.be.empty;
  });

  after(async function () {
    this.timeout(10000);
    const response = await ndidApi.updateNode('ndid1', {
      node_id: 'idp3',
      agent: false,
    });
    expect(response.status).to.equal(204);
    await wait(3000);
  });
});
