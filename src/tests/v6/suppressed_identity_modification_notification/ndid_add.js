import { expect } from 'chai';

import * as commonApi from '../../../api/v6/common';
import * as ndidApi from '../../../api/v6/ndid';
import { ndidAvailable } from '../..';
import { wait } from '../../../utils';

describe('NDID add suppressed identity modification notification node test', function () {
  const nodeIdToAdd = 'idp2';

  before(function () {
    if (!ndidAvailable) {
      this.skip();
    }
  });

  it('NDID should add suppressed identity modification notification node successfully', async function () {
    this.timeout(20000);

    const response =
      await ndidApi.addSuppressedIdentityModificationNotificationNode('ndid1', {
        node_id: nodeIdToAdd,
      });

    expect(response.status).to.equal(204);
  });

  it('should get added suppressed identity modification notification node successfully', async function () {
    this.timeout(5000);

    const response =
      await commonApi.getSuppressedIdentityModificationNotificationNodeList(
        'ndid1'
      );
    const responseBody = await response.json();
    expect(responseBody).to.be.an('array');
    const foundNodeId = responseBody.find((nodeId) => nodeId === nodeIdToAdd);
    expect(foundNodeId).to.not.be.undefined;
  });

  it('should check is suppressed identity modification notification node successfully', async function () {
    this.timeout(5000);

    const response =
      await commonApi.isSuppressedIdentityModificationNotificationNode(
        'ndid1',
        { node_id: nodeIdToAdd }
      );
    const responseBody = await response.json();
    expect(responseBody.suppressed).to.be.true;
  });

  after(async function () {
    this.timeout(10000);

    await ndidApi.removeSuppressedIdentityModificationNotificationNode(
      'ndid1',
      {
        node_id: nodeIdToAdd,
      }
    );

    await wait(2000);
  });
});
