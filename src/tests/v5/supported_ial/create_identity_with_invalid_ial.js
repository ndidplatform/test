import crypto from 'crypto';
import { expect } from 'chai';

import * as identityApi from '../../../api/v5/identity';
import * as commonApi from '../../../api/v5/common';
import * as ndidApiV6 from '../../../api/v6/ndid';
import * as apiHelpers from '../../../api/helpers';
import { idp1EventEmitter } from '../../../callback_server';
import { generateReferenceId } from '../../../utils';
import { randomThaiIdNumber } from '../../../utils/thai_id';
import * as config from '../../../config';

import { ndidAvailable } from '../..';

describe('Create identity with invalid/unsupported IAL test', function () {
  const supportedIALList = [
    1, 1.1, 1.2, 1.3, 1.9, 2.1, 2.2, 2.3, 3, 3.5, 4, 5, 5.2,
  ];

  let originalSupportedIALList;

  const namespace = 'citizen_id';
  const identifier = randomThaiIdNumber();
  const keypair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  const accessorPublicKey = keypair.publicKey.export({
    type: 'spki',
    format: 'pem',
  });

  const referenceId = generateReferenceId();

  before(async function () {
    this.timeout(10000);

    if (!ndidAvailable) {
      this.skip();
    }

    let response;

    response = await apiHelpers.getResponseAndBody(
      commonApi.getSupportedIALList('ndid1')
    );
    originalSupportedIALList = response.responseBody;

    await ndidApiV6.setSupportedIALList('ndid1', {
      supported_ial_list: supportedIALList,
    });
  });

  it('Should NOT be able to create identity with unsupported IAL', async function () {
    this.timeout(10000);
    const response = await identityApi.createIdentity('idp1', {
      reference_id: referenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      identity_list: [
        {
          namespace,
          identifier,
        },
      ],
      accessor_type: 'RSA',
      accessor_public_key: accessorPublicKey,
      //accessor_id,
      ial: 9.9,
      lial: true,
      laal: true,
      mode: 2,
    });
    expect(response.status).to.equal(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).to.equal(20094);
  });

  after(async function () {
    this.timeout(5000);

    idp1EventEmitter.removeAllListeners('callback');

    await ndidApiV6.setSupportedIALList('ndid1', {
      supported_ial_list: originalSupportedIALList,
    });
  });
});
