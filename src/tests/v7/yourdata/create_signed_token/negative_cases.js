import { expect } from 'chai';

import * as yourDataUtilitysApi from '../../../../api/v7/yourdata/utility';

describe('Negative cases', function () {
  it('should NOT be able to create signed token (with expiration_datetime in the past)', async function () {
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
      expiration_datetime: Math.floor(Date.now() / 1000) - 1 * 60 * 60, // -1 hour
      source_request_id_list: ['SOME_REQUEST_ID'],
    };

    const response = await yourDataUtilitysApi.createSignedAuthorizationToken(
      'as1',
      authorizationTokenPayload
    );
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20098);
  });

  it('should NOT be able to create signed token (with expiration_datetime before issue_datetime)', async function () {
    this.timeout(10000);

    const issueDatetime = Math.floor(Date.now() / 1000) + 1000;

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
      expiration_datetime: issueDatetime - 1, // -1 second
      source_request_id_list: ['SOME_REQUEST_ID'],
    };

    const response = await yourDataUtilitysApi.createSignedAuthorizationToken(
      'as1',
      authorizationTokenPayload
    );
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20100);
  });

  it('should NOT be able to create signed token (without expiration_datetime and usage type is not "continuous_no_expire")', async function () {
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
      source_request_id_list: ['SOME_REQUEST_ID'],
    };

    const response = await yourDataUtilitysApi.createSignedAuthorizationToken(
      'as1',
      authorizationTokenPayload
    );
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20102);
  });

  it('should NOT be able to create signed token (with expiration_datetime when usage type is "continuous_no_expire")', async function () {
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
      expiration_datetime: Math.floor(Date.now() / 1000) + 1 * 60 * 60, // +1 hour
      source_request_id_list: ['SOME_REQUEST_ID'],
    };

    const response = await yourDataUtilitysApi.createSignedAuthorizationToken(
      'as1',
      authorizationTokenPayload
    );
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20101);
  });
});
