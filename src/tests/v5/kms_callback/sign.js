import { expect } from 'chai';

import * as commonBaseApi from '../../../api/common';
import * as commonApi from '../../../api/v6/common';
import * as nodeApi from '../../../api/v6/node';
import * as apiHelpers from '../../../api/helpers';

import { kmsEventEmitter } from '../../../callback_server/kms';

import * as config from '../../../config';
import { createEventPromise } from '../../../utils';
import * as cryptoUtils from '../../../utils/crypto';

// test on node "rp1"

describe('Sign callback', function () {
  const signCallbackPromise = createEventPromise();

  let nodeInfo;

  before(async function () {
    this.timeout(5000);

    let response;

    response = await apiHelpers.getResponseAndBody(
      commonApi.getNodeInfo('rp1')
    );
    nodeInfo = response.responseBody;

    await commonBaseApi.setConfig('rp1', {
      EXTERNAL_CRYPTO_SERVICE_CALLBACK_API_VERSION: '5.3',
    });

    kmsEventEmitter.on('signCallback', function (callbackData) {
      if (callbackData.node_id === 'rp1') {
        signCallbackPromise.resolve(callbackData);
      }
    });

    // masterSignCallback
  });

  it('should get KMS callback after set sign callback URL successfully', async function () {
    const response = await nodeApi.setCallbacks('rp1', {
      sign_url: config.KMS_SIGN_CALLBACK_URL,
    });
    expect(response.status).to.equal(204);
  });

  it('should receive sign callback', async function () {
    const signCallback = await signCallbackPromise.promise;

    const signatureAlgorithm =
      cryptoUtils.signatureAlgorithm[nodeInfo.signing_public_key.algorithm];

    let expectedSignMethod;
    if (
      nodeInfo.signing_public_key.algorithm ===
      cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256.name
    ) {
      expectedSignMethod = 'RSA-SHA256';
    } else {
      expectedSignMethod = nodeInfo.signing_public_key.algorithm;
    }

    expect(signCallback).to.include({
      node_id: 'rp1',
      hash_method: signatureAlgorithm.hashAlgorithm,
      key_type: signatureAlgorithm.keyAlgorithm,
      sign_method: expectedSignMethod,
    });
    expect(signCallback.request_message).to.be.a('string').that.is.not.empty;
    expect(signCallback.request_message_hash).to.be.a('string').that.is.not
      .empty;
  });

  after(async function () {
    kmsEventEmitter.removeAllListeners('signCallback');

    await commonBaseApi.setConfig('rp1', {
      EXTERNAL_CRYPTO_SERVICE_CALLBACK_API_VERSION: '6.0',
    });
  });
});

describe('Master sign callback', function () {
  const signCallbackPromise = createEventPromise();

  let nodeInfo;

  before(async function () {
    this.timeout(5000);

    let response;

    response = await apiHelpers.getResponseAndBody(
      commonApi.getNodeInfo('rp1')
    );
    nodeInfo = response.responseBody;

    await commonBaseApi.setConfig('rp1', {
      EXTERNAL_CRYPTO_SERVICE_CALLBACK_API_VERSION: '5.3',
    });

    kmsEventEmitter.on('masterSignCallback', function (callbackData) {
      if (callbackData.node_id === 'rp1') {
        signCallbackPromise.resolve(callbackData);
      }
    });
  });

  it('should get KMS callback after set sign callback URL successfully', async function () {
    const response = await nodeApi.setCallbacks('rp1', {
      master_sign_url: config.KMS_MASTER_SIGN_CALLBACK_URL,
    });
    expect(response.status).to.equal(204);
  });

  it('should receive master sign callback', async function () {
    const signCallback = await signCallbackPromise.promise;

    const signatureAlgorithm =
      cryptoUtils.signatureAlgorithm[
        nodeInfo.signing_master_public_key.algorithm
      ];

    let expectedSignMethod;
    if (
      nodeInfo.signing_master_public_key.algorithm ===
      cryptoUtils.signatureAlgorithm.RSASSA_PKCS1_V1_5_SHA_256.name
    ) {
      expectedSignMethod = 'RSA-SHA256';
    } else {
      expectedSignMethod = nodeInfo.signing_master_public_key.algorithm;
    }

    expect(signCallback).to.include({
      node_id: 'rp1',
      hash_method: signatureAlgorithm.hashAlgorithm,
      key_type: signatureAlgorithm.keyAlgorithm,
      sign_method: expectedSignMethod,
    });
    expect(signCallback.request_message).to.be.a('string').that.is.not.empty;
    expect(signCallback.request_message_hash).to.be.a('string').that.is.not
      .empty;
  });

  after(async function () {
    kmsEventEmitter.removeAllListeners('masterSignCallback');

    await commonBaseApi.setConfig('rp1', {
      EXTERNAL_CRYPTO_SERVICE_CALLBACK_API_VERSION: '6.0',
    });
  });
});
