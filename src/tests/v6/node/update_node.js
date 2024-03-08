import { expect } from 'chai';

import { idp1EventEmitter } from '../../../callback_server';
import * as nodeApi from '../../../api/v6/node';
import * as commonApi from '../../../api/v6/common';
import { createEventPromise, generateReferenceId, wait } from '../../../utils';
import * as config from '../../../config';

describe('Update node supported request message types only IdP node tests', function () {
  const rpUpdateNodeReferenceId = generateReferenceId();
  const asUpdateNodeReferenceId = generateReferenceId();
  const IdPUpdateNodeReferenceId = generateReferenceId();

  const IdPUpdateNodeResultPromise = createEventPromise();

  let before_test_supported_request_message_data_url_type_list;

  before(async function () {
    this.timeout(15000);
    idp1EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'update_node_result' &&
        callbackData.reference_id === IdPUpdateNodeReferenceId
      ) {
        IdPUpdateNodeResultPromise.resolve(callbackData);
      }
    });

    let response = await commonApi.getIdP('idp1');
    let responseBody = await response.json();
    let idpNodeDetail = responseBody.find((idp) => idp.node_id === 'idp1');
    before_test_supported_request_message_data_url_type_list =
      idpNodeDetail.supported_request_message_data_url_type_list;
  });

  it('IdP should update node supported request message types successfully', async function () {
    this.timeout(10000);

    const response = await nodeApi.updateNode('idp1', {
      reference_id: IdPUpdateNodeReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      supported_request_message_data_url_type_list: [
        'application/pdf',
        'text/plain',
      ],
    });
    expect(response.status).to.equal(202);

    const IdPUpdateNodeResult = await IdPUpdateNodeResultPromise.promise;
    expect(IdPUpdateNodeResult).to.deep.include({
      node_id: 'idp1',
      reference_id: IdPUpdateNodeReferenceId,
      success: true,
    });
  });

  it('IdP should get idp node detail successfully', async function () {
    this.timeout(10000);

    let response = await commonApi.getIdP('idp1');
    let responseBody = await response.json();
    let idpNodeDetail = responseBody.find((idp) => idp.node_id === 'idp1');
    expect(idpNodeDetail.supported_request_message_data_url_type_list)
      .to.be.an('array')
      .to.have.length(2)
      .to.includes('application/pdf', 'text/plain');
  });

  it('RP should get an error when update node supported request message types', async function () {
    this.timeout(10000);

    const response = await nodeApi.updateNode('rp1', {
      reference_id: rpUpdateNodeReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      supported_request_message_data_url_type_list: ['application/pdf'],
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20072);
  });

  it('AS should get an error when update node supported request message types', async function () {
    this.timeout(10000);

    const response = await nodeApi.updateNode('as1', {
      reference_id: asUpdateNodeReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
      supported_request_message_data_url_type_list: ['application/pdf'],
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20072);
  });

  after(async function () {
    this.timeout(15000);
    const response = await nodeApi.updateNode('idp1', {
      reference_id: IdPUpdateNodeReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      supported_request_message_data_url_type_list:
        before_test_supported_request_message_data_url_type_list,
    });
    expect(response.status).to.equal(202);

    idp1EventEmitter.removeAllListeners('callback');
  });
});

describe('Update node without any of property node_key or node_master_key or supported_request_message_data_url_type_list tests', function () {
  const rpUpdateNodeReferenceId = generateReferenceId();
  const idpUpdateNodeReferenceId = generateReferenceId();
  const asUpdateNodeReferenceId = generateReferenceId();

  it('RP should get an error when update node  without any of property node_key or node_master_key or supported_request_message_data_url_type_list', async function () {
    this.timeout(10000);

    const response = await nodeApi.updateNode('rp1', {
      reference_id: rpUpdateNodeReferenceId,
      callback_url: config.RP_CALLBACK_URL,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20003);
  });

  it('IDP should get an error when update node  without any of property node_key or node_master_key or supported_request_message_data_url_type_list', async function () {
    this.timeout(10000);

    const response = await nodeApi.updateNode('idp1', {
      reference_id: idpUpdateNodeReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20003);
  });

  it('AS should get an error when update node  without any of property node_key or node_master_key or supported_request_message_data_url_type_list', async function () {
    this.timeout(10000);

    const response = await nodeApi.updateNode('as1', {
      reference_id: asUpdateNodeReferenceId,
      callback_url: config.AS1_CALLBACK_URL,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20003);
  });
});
