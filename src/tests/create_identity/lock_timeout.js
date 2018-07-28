import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import * as debugApi from '../../api/v2/debug';
import * as commonApi from '../../api/v2/common';
import { createRequest } from '../../api/v2/rp';
import { hash, wait } from '../../utils';
import { RP_CALLBACK_URL } from '../../config';

describe('Use debug API to lock first IdP', function() {
  const namespace = 'cid';
  const identifier = uuidv4();

  this.timeout(5000);
  before(async function() {
    // TODO: Use NDID node to set register message destination timeout to 10 blocks
    this.skip();

    debugApi.transact('idp1',{
      fnName: 'RegisterMsqDestination',
      users: [{
        hash_id: hash(namespace + ':' + identifier),
        ial: 1.1,
        first: true,
      }],
      node_id: 'idp1',
    });
    await wait(2000);
  });

  it('should see idp1 associated with user', async function() {
    this.timeout(10000);
    let response = await commonApi.getRelevantIdpNodesBySid('idp1', {
      namespace,
      identifier,
    });

    let idpList = await response.json();
    expect(idpList.length).to.be.equal(1);
    expect(idpList).to.deep.include({
      node_id: 'idp1',
      node_name: '',
      max_ial: 3,
      max_aal: 3
    });
  });

  it('After flood tendermint with 10 blocks, idp1 should no longer associate', async function() {
    this.timeout(30000);
    //flood 10 block (no need to be valid tx)
    for(let i = 0 ; i < 10 ; i++) {
      let response = await createRequest('rp1', {
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

    let response = await commonApi.getRelevantIdpNodesBySid('idp1', {
      namespace,
      identifier,
    });

    let idpList = await response.json();
    expect(idpList).to.be.empty;
  });

});
