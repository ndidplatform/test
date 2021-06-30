import crypto from 'crypto';
import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import * as ndidApi from '../../../api/v5/ndid';
import * as commonApi from '../../../api/v5/common';
import { ndidAvailable } from '../../';
import * as config from '../../../config';

import { idp1EventEmitter } from '../../../callback_server';

describe('NDID on_the_fly_support property tests', function () {
  before(async function () {
    if (!ndidAvailable) {
      this.skip();
    }
  });

  const nodeId = uuidv4();
  const nodeName = 'Test Register IdP Node With On The Fly Support Is True';
  const keypair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  const publicKey = keypair.publicKey.export({
    type: 'spki',
    format: 'pem',
  });

  it('NDID should registering node role IdP with on_the_fly_support = true successfully', async function () {
    this.timeout(10000);
    const response = await ndidApi.registerNode('ndid1', {
      node_id: nodeId,
      node_name: nodeName,
      node_key: publicKey,
      node_master_key: publicKey,
      role: 'idp',
      max_ial: 3,
      max_aal: 3,
      on_the_fly_support: true,
    });
    expect(response.status).to.equal(201);
  });

  it('Should get node information successfully', async function () {
    const response = await commonApi.getNodeInfo('ndid1', {
      node_id: nodeId,
    });
    expect(response.status).to.equal(200);
    const responseBody = await response.json();
    expect(responseBody).to.deep.equal({
      public_key: publicKey,
      master_public_key: publicKey,
      node_name: nodeName,
      role: 'IdP',
      max_ial: 3,
      max_aal: 3,
      on_the_fly_support: true,
      supported_request_message_data_url_type_list: [],
      agent: false,
      node_id_whitelist_active: false,
      mq: null,
      active: true,
    });
  });
});
