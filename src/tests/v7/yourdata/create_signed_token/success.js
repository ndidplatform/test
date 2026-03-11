import { expect } from 'chai';
import jwt from 'jsonwebtoken';

import * as commonApi from '../../../../api/v7/common';
import * as yourDataUtilitysApi from '../../../../api/v7/yourdata/utility';
import * as apiHelpers from '../../../../api/helpers';

describe('Success cases', function () {
  let as1NodeInfo;

  before(async function () {
    const nodeInfoResponse = await apiHelpers.getResponseAndBody(
      commonApi.getNodeInfo('as1', {
        node_id: 'as1',
      })
    );

    as1NodeInfo = nodeInfoResponse.responseBody;
  });

  it('should create signed token successfully', async function () {
    this.timeout(10000);

    const authorizationTokenPayload = {
      requester_node_id: 'rp1',
      as_node_id: 'as1',
      namespace: 'namespace',
      identifier: 'identifier',
      token_objective: 'some_string',
      sub_identity_list: [
        {
          namespace: 'account_no',
          idenfifier: '123-45678-90',
          visible_identifier: '123-45XXX-XX',
          identifier_extension: '{account_type:savings}',
        },
      ],
      service_id_list: [
        {
          service_id: 'service1',
          service_version: 'v1',
          service_extension: ['test'],
        },
      ],
      validate_identifier: true,
      validate_service_id: true,
      validate_service_extension: false,
      usage_type: 'one_time',
      expiration_datetime: Math.floor(Date.now() / 1000) + 1 * 24 * 60 * 60, // + 1 day
      source_request_id_list: ['SOME_REQUEST_ID'],
    };

    const response = await yourDataUtilitysApi.createSignedAuthorizationToken(
      'as1',
      authorizationTokenPayload
    );
    expect(response.status).to.equal(200);
    const responseBody = await response.json();
    expect(responseBody.token).to.be.a('string').that.is.not.empty;

    const decodedPayload = jwt.verify(
      responseBody.token,
      as1NodeInfo.signing_public_key.public_key,
      {
        ignoreExpiration: true,
        ignoreNotBefore: true,
      }
    );

    expect(decodedPayload).to.deep.include(authorizationTokenPayload);
    expect(decodedPayload.issue_datetime).to.be.a('number');
    expect(decodedPayload.token_id).to.be.a('string').that.is.not.empty;
    expect(decodedPayload.as_node_signing_key_version).to.equal(
      as1NodeInfo.signing_public_key.version
    );
  });

  it('should create signed token (with issue_datetime) successfully', async function () {
    this.timeout(10000);

    const issueDatetime = Math.floor(Date.now() / 1000);

    const authorizationTokenPayload = {
      requester_node_id: 'rp1',
      as_node_id: 'as1',
      namespace: 'namespace',
      identifier: 'identifier',
      token_objective: 'some_string',
      sub_identity_list: [
        {
          namespace: 'account_no',
          idenfifier: '123-45678-90',
          visible_identifier: '123-45XXX-XX',
          identifier_extension: '{account_type:savings}',
        },
      ],
      service_id_list: [
        {
          service_id: 'service1',
          service_version: 'v1',
          service_extension: ['test'],
        },
      ],
      validate_identifier: true,
      validate_service_id: true,
      validate_service_extension: false,
      usage_type: 'one_time',
      issue_datetime: issueDatetime,
      expiration_datetime: Math.floor(Date.now() / 1000) + 1 * 24 * 60 * 60, // + 1 day
      source_request_id_list: ['SOME_REQUEST_ID'],
    };

    const response = await yourDataUtilitysApi.createSignedAuthorizationToken(
      'as1',
      authorizationTokenPayload
    );
    expect(response.status).to.equal(200);
    const responseBody = await response.json();
    expect(responseBody.token).to.be.a('string').that.is.not.empty;

    const decodedPayload = jwt.verify(
      responseBody.token,
      as1NodeInfo.signing_public_key.public_key,
      {
        ignoreExpiration: true,
        ignoreNotBefore: true,
      }
    );

    expect(decodedPayload).to.deep.include(authorizationTokenPayload);
    expect(decodedPayload.issue_datetime).to.equal(issueDatetime);
    expect(decodedPayload.token_id).to.be.a('string').that.is.not.empty;
    expect(decodedPayload.as_node_signing_key_version).to.equal(
      as1NodeInfo.signing_public_key.version
    );
  });

  it('should create signed token ("continuous_no_expire" usage type) successfully', async function () {
    this.timeout(10000);

    const authorizationTokenPayload = {
      requester_node_id: 'rp1',
      as_node_id: 'as1',
      namespace: 'namespace',
      identifier: 'identifier',
      token_objective: 'some_string',
      sub_identity_list: [
        {
          namespace: 'account_no',
          idenfifier: '123-45678-90',
          visible_identifier: '123-45XXX-XX',
          identifier_extension: '{account_type:savings}',
        },
      ],
      service_id_list: [
        {
          service_id: 'service1',
          service_version: 'v1',
          service_extension: ['test'],
        },
      ],
      validate_identifier: true,
      validate_service_id: true,
      validate_service_extension: false,
      usage_type: 'continuous_no_expire',
      source_request_id_list: ['SOME_REQUEST_ID'],
    };

    const response = await yourDataUtilitysApi.createSignedAuthorizationToken(
      'as1',
      authorizationTokenPayload
    );
    expect(response.status).to.equal(200);
    const responseBody = await response.json();
    expect(responseBody.token).to.be.a('string').that.is.not.empty;

    const decodedPayload = jwt.verify(
      responseBody.token,
      as1NodeInfo.signing_public_key.public_key,
      {
        ignoreExpiration: true,
        ignoreNotBefore: true,
      }
    );

    expect(decodedPayload).to.deep.include(authorizationTokenPayload);
    expect(decodedPayload.issue_datetime).to.be.a('number');
    expect(decodedPayload.token_id).to.be.a('string').that.is.not.empty;
    expect(decodedPayload.as_node_signing_key_version).to.equal(
      as1NodeInfo.signing_public_key.version
    );
    expect(decodedPayload).to.not.have.property('expiration_datetime');
  });
});
