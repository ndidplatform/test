import { expect } from 'chai';

import * as yourDataRpApi from '../../../../api/v7/yourdata/rp';
import * as yourDataUtilityApi from '../../../../api/v7/yourdata/utility';
import * as db from '../../../../db';
import { generateReferenceId } from '../../../../utils';
import { randomString } from '../../../../utils/random';
import * as config from '../../../../config';

describe('Duplicate reference ID', function () {
  const rpNodeId = 'rp1';
  const asNodeId = 'as1';

  const serviceId = `test_service_${randomString(8)}`;

  const rpReferenceId = generateReferenceId();

  let namespace;
  let identifier;

  let authorizationToken;

  let createRequestParams;

  before(async function () {
    this.timeout(10000);

    const identity = db.idp1Identities.find((identity) => identity.mode === 2);
    namespace = identity.namespace;
    identifier = identity.identifier;

    let response;
    let responseBody;

    const authorizationTokenPayload = {
      requester_node_id: 'rp1',
      as_node_id: 'as1',
      namespace,
      identifier,
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
          service_id: serviceId,
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

    response = await yourDataUtilityApi.createSignedAuthorizationToken(
      'as1',
      authorizationTokenPayload
    );
    responseBody = await response.json();

    authorizationToken = responseBody.token;

    createRequestParams = {
      service_id: serviceId,
      service_version: 'v1',
      // service_extension: [''],
      as_node_id: asNodeId,
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      namespace,
      identifier,
      request_params: JSON.stringify({
        selected_accounts: [
          {
            namespace: 'account_no',
            idenfifier: '123-45678-90',
            visible_identifier: '123-45XXX-XX',
            identifier_extension: '{account_type:savings}',
          },
        ],
      }),
      authorization: authorizationToken,
      request_timeout: 10,
    };
  });

  it('RP should create a request successfully', async function () {
    this.timeout(10000);
    const response = await yourDataRpApi.createRequest(
      'rp1',
      createRequestParams
    );
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
  });

  it('RP should NOT be able to create a request with the same reference ID', async function () {
    this.timeout(10000);
    const response = await yourDataRpApi.createRequest(
      'rp1',
      createRequestParams
    );
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20045);
  });
});
