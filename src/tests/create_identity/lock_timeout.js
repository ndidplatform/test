import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import * as debugApi from '../../api/v2/debug';
import * as ndidApi from '../../api/v2/ndid';
import * as commonApi from '../../api/v2/common';
import { createRequest } from '../../api/v2/rp';
import { hash, wait } from '../../utils';
import { RP_CALLBACK_URL } from '../../config';
import { ndidAvailable } from '..';

describe('Use debug API to lock first IdP', function() {
  const namespace = 'cid';
  const identifier = uuidv4();

  before(async function() {
    this.timeout(8000);

    if (!ndidAvailable) {
      this.test.parent.pending = true;
      this.skip();
    }

    await ndidApi.setTimeoutBlockRegisterMqDestination('ndid1', {
      blocks_to_timeout: 5,
    });

    await debugApi.transact('idp1', {
      fnName: 'RegisterMsqDestination',
      users: [
        {
          hash_id: hash(namespace + ':' + identifier),
          ial: 1.1,
          first: true,
        },
      ],
    });

    // wait for it to propagate to all other Tendermint nodes
    await wait(2000);
  });

  it('should see idp1 associated with user', async function() {
    this.timeout(10000);
    const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
      namespace,
      identifier,
    });

    const idpList = await response.json();
    expect(idpList.length).to.be.equal(1);
    expect(idpList[0]).to.deep.include({
      node_id: 'idp1',
      // node_name: '',
      max_ial: 3,
      max_aal: 3,
    });
  });

  it('idp1 should no longer associated after timed out', async function() {
    this.timeout(30000);
    // flood 5 blocks
    for (let i = 0; i < 5; i++) {
      await createRequest('rp1', {
        reference_id: uuidv4(),
        callback_url: RP_CALLBACK_URL,
        mode: 1,
        namespace,
        identifier,
        idp_id_list: ['idp1'],
        data_request_list: [],
        request_message: 'Flood block #' + i.toString(),
        min_ial: 1.1,
        min_aal: 1,
        min_idp: 1,
        request_timeout: 86400,
      });
      await wait(1000);
      //console.log('Flooding block',i);
      //console.log(JSON.stringify(await response.json(),null,2));
    }

    const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
      namespace,
      identifier,
    });

    const idpList = await response.json();
    expect(idpList).to.be.empty;
  });

  after(async function() {
    this.timeout(5000);
    await ndidApi.setTimeoutBlockRegisterMqDestination('ndid1', {
      blocks_to_timeout: 500,
    });
  });
});
