import crypto from 'crypto';
import { expect } from 'chai';
import uuidv4 from 'uuid/v4';

import * as ndidApi from '../../../api/v6/ndid';
import * as identityApi from '../../../api/v6/identity';
import { ndidAvailable } from '../../';
import { generateReferenceId, wait, createEventPromise } from '../../../utils';
import { randomThaiIdNumber } from '../../../utils/thai_id';
import * as config from '../../../config';

import { idp1EventEmitter } from '../../../callback_server';

describe('NDID set allowed min ial for register identity at first idp test', function () {
  const namespace = 'citizen_id';
  const identifier = randomThaiIdNumber();
  const keypair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  // const accessorPrivateKey = keypair.privateKey.export({
  //   type: 'pkcs8',
  //   format: 'pem',
  // });
  const accessorPublicKey = keypair.publicKey.export({
    type: 'spki',
    format: 'pem',
  });

  const mode2ReferenceId = generateReferenceId();
  const mode3ReferenceId = generateReferenceId();

  const mode2CreateIdentityResultPromise = createEventPromise();
  const mode3CreateIdentityResultPromise = createEventPromise();

  let accessorId;

  before(async function () {
    if (!ndidAvailable) {
      this.skip();
    }

    idp1EventEmitter.on('callback', function (callbackData) {
      if (
        callbackData.type === 'create_identity_result' &&
        callbackData.reference_id === mode2ReferenceId
      ) {
        mode2CreateIdentityResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'create_identity_result' &&
        callbackData.reference_id === mode3ReferenceId
      ) {
        mode3CreateIdentityResultPromise.resolve(callbackData);
      }
    });
  });

  it('NDID should set allowed min_ial (3) for register identity at first idp successfully', async function () {
    this.timeout(10000);
    const response =
      await ndidApi.setAllowedMinIalForRegisterIdentityAtFirstIdp('ndid1', {
        min_ial: 3,
      });
    expect(response.status).to.equal(204);
    await wait(2000);
  });

  it('Allowed min_ial (3) for register identity at first idp should be set successfully', async function () {
    this.timeout(10000);
    const response =
      await ndidApi.getAllowedMinIalForRegisterIdentityAtFirstIdp('ndid1');
    expect(response.status).to.equal(200);
    const responseBody = await response.json();
    expect(responseBody.min_ial).to.equal(3);
  });

  it('IdP should create identity request (mode 2) as 1st IdP with min_ial is less than 3 unsuccessfully', async function () {
    this.timeout(10000);

    const response = await identityApi.createIdentity('idp1', {
      reference_id: mode2ReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      identity_list: [
        {
          namespace,
          identifier,
        },
      ],
      accessor_type: 'RSA',
      accessor_public_key: accessorPublicKey,
      ial: 2.3,
      lial: false,
      laal: false,
      mode: 2,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.exist).to.equal(false);
    accessorId = responseBody.accessor_id;
  });

  it('Identity should be created unsuccessfully', async function () {
    this.timeout(15000);
    const createIdentityResult = await mode2CreateIdentityResultPromise.promise;
    expect(createIdentityResult).to.deep.include({
      reference_id: mode2ReferenceId,
      success: false,
      accessor_id: accessorId,
      error: {
        code: 25069,
        message: 'Too low IAL for first IdP',
      },
    });
  });

  it('IdP should create identity request (mode 3) as 1st IdP with min_ial is less than 3 unsuccessfully', async function () {
    this.timeout(10000);

    const response = await identityApi.createIdentity('idp1', {
      reference_id: mode3ReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      identity_list: [
        {
          namespace,
          identifier,
        },
      ],
      accessor_type: 'RSA',
      accessor_public_key: accessorPublicKey,
      ial: 2.3,
      lial: false,
      laal: false,
      mode: 3,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.exist).to.equal(false);

    accessorId = responseBody.accessor_id;
  });

  it('Identity should be created unsuccessfully', async function () {
    this.timeout(15000);
    const createIdentityResult = await mode3CreateIdentityResultPromise.promise;
    expect(createIdentityResult).to.deep.include({
      reference_id: mode3ReferenceId,
      success: false,
      accessor_id: accessorId,
      error: {
        code: 25069,
        message: 'Too low IAL for first IdP',
      },
    });
  });

  after(async function () {
    this.timeout(20000);
    const response =
      await ndidApi.setAllowedMinIalForRegisterIdentityAtFirstIdp('ndid1', {
        min_ial: 1.1,
      });
    expect(response.status).to.equal(204);

    await wait(2000);

    const responseGet =
      await ndidApi.getAllowedMinIalForRegisterIdentityAtFirstIdp('ndid1');
    expect(responseGet.status).to.equal(200);
    const responseBody = await responseGet.json();
    expect(responseBody.min_ial).to.equal(1.1);

    idp1EventEmitter.removeAllListeners('callback');
  });
});
