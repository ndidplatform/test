import { expect } from 'chai';

import * as rpApi from '../api/v2/rp';
import * as idpApi from '../api/v2/idp';
import * as asApi from '../api/v2/as';
import {
  rpEventEmitter,
  idpEventEmitter,
  asEventEmitter,
} from '../callback_server';
import * as db from '../db';
import * as utils from '../utils';
import * as config from '../config';

function createEventPromise() {
  let resolve, reject;
  const promise = new Promise((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  return {
    promise,
    resolve,
    reject,
  };
}

describe('Happy flow', function() {
  const namespace = 'cid';
  const identifier = '1234567890123';
  const accessorPrivateKey = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEAsMa+E2sDa4cqPEuZnlKh/EX0n2zVXEaBtkLt9L1KboqJx0wa
c80EY/mvIhakh857JgTCHhhJUy/3TGspKIRZZMmU3C5xabNWFq3VnvP79Ilu79Yy
2GrHjt+8ABzO7iUMWJaeRlBEWtmXWeALZ6EldbqRIUpXtyu38HCEXWa3PtHW9WV9
YUpiqbQ9E3gK5ihcbQPhY4icWKCbJEEEgDLPg1/NuBs09XFTgcjeiREbl8ewZEN/
xSFwAQvBxG6u9RfDgMUm7wnLf+w0xlNF7ZsRRuw4A9PX9i+2CvoZzmDGCPlcGjNt
sA+0cKCol/xQ0ASv3NMnNJvX8EUrVJ1i/FAD/QIDAQABAoIBAC0FgNVLNOTG2N/g
VTB4VR795g5QVoqYvmJf62CgcPt0NyDV5grGFS8tIQhqgd7AnKaTIakugEY6eh4x
UJssEeRUXqAxB9tmvC8seLJx6yJdei6E/BAYKdjebHAO5jjKoLlTKt43hSEqN5zB
LcZnyTWRnXLAD1TsQn1u+pcbGOJbfFk3qSwDbEwNJgngRS/ubtzWCuOq2+CNulKr
fCgyjdA+R9ECno4rWNIgpY0j8V/r4asCB2f/VGqrDeQ1cIBCRt/tOrPD2PeENCg+
VaAk49aJTlWUomiuw8d0d++IBrrt28yeNpwvTnUXquC227OXyqx4PGfqTJ+dDKTY
/VLuTPUCgYEA5a6IvTR6/9oL0UF/zyQOFIzSnxQtotyU/P6jrfECirSIoP+ZghZU
aeIh9TN+RVSXLtJp38S7jWru0x6mWBtBO1akFO/Ec9thiK6HsVfOww3LtxKgoRJX
89CDBXOpQwHG5LswpVxd2PSM/j9rtmYC4JiGXWkH5LLdlowK1CHF528CgYEAxQhI
4+LP9svkslOo5BnHOxR+v7MJ0J5sSudU3t6YhLE08qnWUq1j0YlMRWjA23La1iiI
CbU7gD3eWKBdAtn6ve9iceNRO608SWdnvA6LC1g6u6QVQp5QlM9zbFS0gGvhJoTw
ybtc6Gh9IJPlD53+dkI3Jhg5dyEYrjrrg3WENVMCgYEA1MduciouUNyF2iQd7Z5v
VOZpMWqWJKzJcd/NbxU5z5oUgWKJqhRZu4X9A5XiwwPs0zmnT+CICCkqe3eHj1Qg
iIJpm+PMUbDJmMBngQnhyJ39PesJ2G6QAJYI64INKsB4q+om1OrPHnDgNaI3fVDg
FYX35I2q/FogIpo2ZfOrzg0CgYB9OUq6KwjpXaS4AZuxfQC2d8wmoe92+3jwEh5K
l0Zv7wArye1BFpn+LjifVHheAJ08xv3OzbRHSQrrYOA8U7WcyWvT3hleyDcsn9+6
EbQlPan2X85zTJMCQOamzx75D5dFF/DBBaeCvgXokpZeWpfDKUpLl9HN+ObqtN/B
6QphqQKBgQCMuK9aY60OJPuke1ijfqdQXYjDl7kqXcWTA4mPIsGltcDfnpVLivi0
yWrZg2yVHDpcP8MR73OjYLJz+nn/K1YHxxWHJNio2dDUW/4N8oPnZPM6zSnF1EFl
wainZeQ0I9NhLT44ckEhkbaFadqKE5RSyotWDiUgtehbYD8Dl0Oh/g==
-----END RSA PRIVATE KEY-----`;
  const accessorPublicKey = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAsMa+E2sDa4cqPEuZnlKh
/EX0n2zVXEaBtkLt9L1KboqJx0wac80EY/mvIhakh857JgTCHhhJUy/3TGspKIRZ
ZMmU3C5xabNWFq3VnvP79Ilu79Yy2GrHjt+8ABzO7iUMWJaeRlBEWtmXWeALZ6El
dbqRIUpXtyu38HCEXWa3PtHW9WV9YUpiqbQ9E3gK5ihcbQPhY4icWKCbJEEEgDLP
g1/NuBs09XFTgcjeiREbl8ewZEN/xSFwAQvBxG6u9RfDgMUm7wnLf+w0xlNF7ZsR
Ruw4A9PX9i+2CvoZzmDGCPlcGjNtsA+0cKCol/xQ0ASv3NMnNJvX8EUrVJ1i/FAD
/QIDAQAB
-----END PUBLIC KEY-----`;

  describe('IdP setup', function() {
    it('should set callbacks successfully', async function() {
      const response = await idpApi.setCallback({
        incoming_request_url: config.IDP_CALLBACK_URL,
        accessor_sign_url: config.IDP_ACCESSOR_SIGN_CALLBACK_URL,
      });
      expect(response.status).to.equal(204);
    });
  });

  describe('IdP create identity (without providing accessor_id)', function() {
    const referenceId = Math.floor(Math.random() * 100000 + 1).toString();

    const createIdentityRequestResultPromise = createEventPromise();
    const createIdentityResultPromise = createEventPromise();

    let requestId;
    let accessorId;

    db.createIdentityReferences.push({
      referenceId,
      accessorPrivateKey,
    });

    before(function() {
      idpEventEmitter.on('callback', function(callbackData) {
        if (callbackData.type === 'create_identity_request_result') {
          createIdentityRequestResultPromise.resolve(callbackData);
        } else if (callbackData.type === 'create_identity_result') {
          createIdentityResultPromise.resolve(callbackData);
        }
      });
    });

    it('should create identity request successfully', async function() {
      this.timeout(10000);
      const response = await idpApi.createIdentity({
        reference_id: referenceId,
        callback_url: config.IDP_CALLBACK_URL,
        namespace,
        identifier,
        accessor_type: 'RSA',
        accessor_public_key: accessorPublicKey,
        //accessor_id,
        ial: 2.3,
      });
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.request_id).to.be.a('string');
      expect(responseBody.accessor_id).to.be.a('string');

      requestId = responseBody.request_id;
      accessorId = responseBody.accessor_id;

      const createIdentityRequestResult = await createIdentityRequestResultPromise.promise;
      expect(createIdentityRequestResult).to.deep.include({
        reference_id: referenceId,
        request_id: requestId,
        exist: false,
        accessor_id: accessorId,
        success: true,
      });
    });

    it('Identity should be created successfully', async function() {
      this.timeout(15000);
      const createIdentityResult = await createIdentityResultPromise.promise;
      expect(createIdentityResult).to.deep.include({
        reference_id: referenceId,
        request_id: requestId,
        success: true,
      });
      expect(createIdentityResult.secret).to.be.a('string');

      const secret = createIdentityResult.secret;

      db.identities.push({
        namespace,
        identifier,
        accessors: [
          {
            accessorId,
            accessorPrivateKey,
            accessorPublicKey,
            secret,
          },
        ],
      });
    });

    after(function() {
      idpEventEmitter.removeAllListeners('callback');
    });
  });

  describe('Verify identity flow (no data request)', function() {
    const rpReferenceId = Math.floor(Math.random() * 100000 + 1).toString();
    const idpReferenceId = Math.floor(Math.random() * 100000 + 1).toString();

    const createRequestResultPromise = createEventPromise(); // RP
    const requestStatusPendingPromise = createEventPromise(); // RP
    const incomingRequestPromise = createEventPromise(); // IDP

    const createRequestParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      mode: 3,
      namespace,
      identifier,
      idp_id_list: [],
      data_request_list: [],
      request_message: 'Test request message',
      min_ial: 1.1,
      min_aal: 1,
      min_idp: 1,
      request_timeout: 86400,
    };

    let requestId;

    before(function() {
      rpEventEmitter.on('callback', function(callbackData) {
        if (
          callbackData.type === 'create_request_result' &&
          callbackData.reference_id === rpReferenceId
        ) {
          createRequestResultPromise.resolve(callbackData);
        } else if (callbackData.type === 'request_status') {
          if (callbackData.status === 'pending') {
            requestStatusPendingPromise.resolve(callbackData);
          }
        }
      });

      idpEventEmitter.on('callback', function(callbackData) {
        if (callbackData.type === 'incoming_request') {
          incomingRequestPromise.resolve(callbackData);
        }
      });
    });

    it('RP should create a request successfully', async function() {
      this.timeout(10000);
      const response = await rpApi.createRequest(createRequestParams);
      const responseBody = await response.json();
      expect(response.status).to.equal(202);
      expect(responseBody.request_id).to.be.a('string');

      requestId = responseBody.request_id;

      const createRequestResult = await createRequestResultPromise.promise;
      expect(createRequestResult.success).to.equal(true);
    });

    it('RP should receive pending request status', async function() {
      this.timeout(10000);
      const requestStatusPending = await requestStatusPendingPromise.promise;
      expect(requestStatusPending).to.deep.include({
        request_id: requestId,
        status: 'pending',
        mode: createRequestParams.mode,
        min_idp: createRequestParams.min_idp,
        answered_idp_count: 0,
        closed: false,
        timed_out: false,
        service_list: [],
        response_valid_list: [],
      });
      expect(requestStatusPending).to.have.property('block_height');
      expect(requestStatusPending.block_height).is.a('number');
    });

    it('IdP should receive incoming request callback', async function() {
      this.timeout(15000);
      const incomingRequest = await incomingRequestPromise.promise;
      expect(incomingRequest).to.deep.include({
        mode: createRequestParams.mode,
        request_id: requestId,
        namespace: createRequestParams.namespace,
        identifier: createRequestParams.identifier,
        request_message: createRequestParams.request_message,
        request_message_hash: utils.hash(createRequestParams.request_message),
        // requester_node_id: 'rp1',
        min_ial: createRequestParams.min_ial,
        min_aal: createRequestParams.min_aal,
        data_request_list: createRequestParams.data_request_list,
      });
    });

    it('IdP should create response (accept) successfully', async function() {
      const identity = db.identities.find(
        (identity) =>
          identity.namespace === namespace && identity.identifier === identifier
      );

      const response = await idpApi.createResponse({
        reference_id: idpReferenceId,
        callback_url: config.IDP_CALLBACK_URL,
        request_id: requestId,
        namespace: createRequestParams.namespace,
        identifier: createRequestParams.identifier,
        ial: 2.3,
        aal: 3,
        secret: identity.accessors[0].secret,
        status: 'accept',
        signature: utils.createSignature(
          accessorPrivateKey,
          createRequestParams.request_message
        ),
        accessor_id: identity.accessors[0].accessorId,
      });
      expect(response.status).to.equal(202);
    });

    after(function() {
      rpEventEmitter.removeAllListeners('callback');
      idpEventEmitter.removeAllListeners('callback');
    });
  });
});
