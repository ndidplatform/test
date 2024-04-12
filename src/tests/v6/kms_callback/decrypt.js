import { expect } from 'chai';

import * as commonApi from '../../../api/v6/common';
import * as nodeApi from '../../../api/v6/node';
import * as apiHelpers from '../../../api/helpers';

import { kmsEventEmitter } from '../../../callback_server/kms';

import * as config from '../../../config';
import { createEventPromise } from '../../../utils';
import * as cryptoUtils from '../../../utils/crypto';

// test on node "rp1"

describe('Decrypt callback', function () {
  const decryptCallbackPromise = createEventPromise();

  let nodeInfo;

  before(async function () {
    this.timeout(5000);

    let response;

    response = await apiHelpers.getResponseAndBody(
      commonApi.getNodeInfo('rp1')
    );
    nodeInfo = response.responseBody;

    kmsEventEmitter.on('decryptCallback', function (callbackData) {
      if (callbackData.node_id === 'rp1') {
        decryptCallbackPromise.resolve(callbackData);
      }
    });
  });

  it('should get KMS callback after set sign callback URL successfully', async function () {
    const response = await nodeApi.setCallbacks('rp1', {
      decrypt_url: config.KMS_DECRYPT_CALLBACK_URL,
    });
    expect(response.status).to.equal(204);
  });

  it('should receive decrypt callback', async function () {
    const decryptCallback = await decryptCallbackPromise.promise;

    const encryptionAlgorithm =
      cryptoUtils.encryptionAlgorithm[nodeInfo.encryption_public_key.algorithm];

    expect(decryptCallback).to.include({
      node_id: 'rp1',
      key_algorithm: encryptionAlgorithm.keyAlgorithm,
      encryption_algorithm: nodeInfo.encryption_public_key.algorithm,
      key_version: nodeInfo.encryption_public_key.version,
    });
    expect(decryptCallback.encrypted_message).to.be.a('string').that.is.not
      .empty;
  });

  after(function () {
    kmsEventEmitter.removeAllListeners('decryptCallback');
  });
});
