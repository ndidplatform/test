import { expect } from 'chai';

import * as commonApi from '../../../api/v5/common';
import * as ndidApi from '../../../api/v5/ndid';
import { ndidAvailable } from '../..';

describe('NDID remove suppressed identity modification notification node test', function () {
  const nodeIdToRemove = 'idp2';

  before(async function () {
    this.timeout(10000);

    if (!ndidAvailable) {
      this.skip();
    }

    await ndidApi.addSuppressedIdentityModificationNotificationNode('ndid1', {
      node_id: nodeIdToRemove,
    });
  });

  it('NDID should remove suppressed identity modification notification node successfully', async function () {
    this.timeout(20000);

    const response =
      await ndidApi.removeSuppressedIdentityModificationNotificationNode(
        'ndid1',
        {
          node_id: nodeIdToRemove,
        }
      );

    expect(response.status).to.equal(204);
  });

  it('should NOT be able to get removed suppressed identity modification notification node', async function () {
    this.timeout(5000);

    const response =
      await commonApi.getSuppressedIdentityModificationNotificationNodeList(
        'ndid1'
      );
    const responseBody = await response.json();
    expect(responseBody).to.be.an('array');
    const foundNodeId = responseBody.find(
      (nodeId) => nodeId === nodeIdToRemove
    );
    expect(foundNodeId).to.be.undefined;
  });

  it('should check is suppressed identity modification notification node successfully', async function () {
    this.timeout(5000);

    const response =
      await commonApi.isSuppressedIdentityModificationNotificationNode(
        'ndid1',
        { node_id: nodeIdToRemove }
      );
    const responseBody = await response.json();
    expect(responseBody.suppressed).to.be.false;
  });
});
