import { expect } from 'chai';
import forge from 'node-forge';
import uuidv4 from 'uuid/v4';

import * as identityApi from '../../../../api/v3/identity';
import * as commonApi from '../../../../api/v3/common';
import { proxy1EventEmitter } from '../../../../callback_server';
import * as db from '../../../../db';
import { createEventPromise, generateReferenceId } from '../../../../utils';
import * as config from '../../../../config';

describe('IdP (idp1) create identity (mode 3) (without providing accessor_id) as 1st IdP', function() {
  const nodeId = 'proxy1_idp4';
  const namespace = 'citizen_id';
  const identifier = uuidv4();
  const keypair = forge.pki.rsa.generateKeyPair(2048);
  const accessorPrivateKey = forge.pki.privateKeyToPem(keypair.privateKey);
  const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);

  const referenceId = generateReferenceId();

  const createIdentityResultPromise = createEventPromise();

  let accessorId;
  let referenceGroupCode;

  before(function() {
    proxy1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'create_identity_result' &&
        callbackData.reference_id === referenceId
      ) {
        createIdentityResultPromise.resolve(callbackData);
      }
    });
  });

  it('Before create identity this sid should not exist on platform ', async function() {
    const response = await identityApi.getIdentityInfo('proxy1', {
      namespace,
      identifier,
    });
    expect(response.status).to.equal(404);
  });

  it('Before create identity this sid should not associated with idp1 ', async function() {
    const response = await commonApi.getRelevantIdpNodesBySid('proxy1', {
      namespace,
      identifier,
    });
    const idpNodes = await response.json();
    const idpNode = idpNodes.find(idpNode => idpNode.node_id === nodeId);
    expect(idpNode).to.be.an.undefined;
  });

  it('Before create identity should not get identity ial', async function() {
    const response = await identityApi.getIdentityIal('proxy1', {
      node_id: nodeId,
      namespace,
      identifier,
    });
    expect(response.status).to.equal(404);
  });

  it('Should create identity request (mode 3) successfully', async function() {
    this.timeout(10000);
    const response = await identityApi.createIdentity('proxy1', {
      node_id: nodeId,
      reference_id: referenceId,
      callback_url: config.PROXY1_CALLBACK_URL,
      identity_list: [
        {
          namespace,
          identifier,
        },
      ],
      accessor_type: 'RSA',
      accessor_public_key: accessorPublicKey,
      //accessor_id,
      ial: 2.3,
      mode: 3,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody).to.not.include.keys('request_id');
    expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.exist).to.equal(false);

    accessorId = responseBody.accessor_id;
  });

  it('Identity should be created successfully', async function() {
    this.timeout(15000);
    const createIdentityResult = await createIdentityResultPromise.promise;
    expect(createIdentityResult).to.deep.include({
      reference_id: referenceId,
      success: true,
    });

    expect(createIdentityResult.reference_group_code).to.be.a('string').that.is
      .not.empty;

    referenceGroupCode = createIdentityResult.reference_group_code;

    const response = await commonApi.getRelevantIdpNodesBySid('proxy1', {
      namespace,
      identifier,
    });
    const idpNodes = await response.json();
    const idpNode = idpNodes.find(idpNode => idpNode.node_id === nodeId);
    expect(idpNode).to.not.be.undefined;
    expect(idpNode.mode_list)
      .to.be.an('array')
      .that.include(2, 3);

    db.proxy1Idp4Identities.push({
      referenceGroupCode,
      mode: 3,
      namespace,
      identifier,
      accessors: [
        {
          accessorId,
          accessorPrivateKey,
          accessorPublicKey,
        },
      ],
    });
  });

  it('After create identity this sid should be existing on platform ', async function() {
    const response = await identityApi.getIdentityInfo('proxy1', {
      node_id: nodeId,
      namespace,
      identifier,
    });
    expect(response.status).to.equal(200);
    const responseBody = await response.json();
    expect(responseBody.reference_group_code).to.equal(referenceGroupCode);
  });

  it('After create identity should get identity ial successfully', async function() {
    const response = await identityApi.getIdentityIal('proxy1', {
      node_id: nodeId,
      namespace,
      identifier,
    });
    expect(response.status).to.equal(200);
    const responseBody = await response.json();
    expect(responseBody.ial).to.equal(2.3);
  });

  after(function() {
    proxy1EventEmitter.removeAllListeners('callback');
  });
});

// describe('IdP (idp1) create identity (mode 3) (for use in other test and will create on idp2) as 1st IdP ', function() {
//   const namespace = 'citizen_id';
//   const identifier = uuidv4();
//   const keypair = forge.pki.rsa.generateKeyPair(2048);
//   const accessorPrivateKey = forge.pki.privateKeyToPem(keypair.privateKey);
//   const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);

//   const referenceId = generateReferenceId();

//   const createIdentityResultPromise = createEventPromise();

//   let accessorId;
//   let referenceGroupCode;

//   before(function() {
//     idp1EventEmitter.on('callback', function(callbackData) {
//       if (
//         callbackData.type === 'create_identity_result' &&
//         callbackData.reference_id === referenceId
//       ) {
//         createIdentityResultPromise.resolve(callbackData);
//       }
//     });
//   });

//   it('Before create identity this sid should not exist on platform ', async function() {
//     const response = await identityApi.getIdentityInfo('idp1', {
//       namespace,
//       identifier,
//     });
//     expect(response.status).to.equal(404);
//   });

//   it('Before create identity this sid should not associated with idp1 ', async function() {
//     const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
//       namespace,
//       identifier,
//     });
//     const idpNodes = await response.json();
//     const idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
//     expect(idpNode).to.be.an.undefined;
//   });

//   it('Before create identity should not get identity ial', async function() {
//     const response = await identityApi.getIdentityIal('idp1', {
//       namespace,
//       identifier,
//     });
//     expect(response.status).to.equal(404);
//   });

//   it('Should create identity request (mode 3) successfully', async function() {
//     this.timeout(10000);
//     const response = await identityApi.createIdentity('idp1', {
//       reference_id: referenceId,
//       callback_url: config.IDP1_CALLBACK_URL,
//       identity_list: [
//         {
//           namespace,
//           identifier,
//         },
//       ],
//       accessor_type: 'RSA',
//       accessor_public_key: accessorPublicKey,
//       //accessor_id,
//       ial: 2.3,
//       mode: 3,
//     });
//     const responseBody = await response.json();
//     expect(response.status).to.equal(202);
//     expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;
//     expect(responseBody.exist).to.equal(false);

//     accessorId = responseBody.accessor_id;
//   });

//   // it('should receive accessor sign callback with correct data', async function() {
//   //   this.timeout(15000);
//   //   const sid = `${namespace}:${identifier}`;
//   //   const sid_hash = hash(sid);

//   //   const accessorSignParams = await accessorSignPromise.promise;
//   //   expect(accessorSignParams).to.deep.equal({
//   //     type: 'accessor_sign',
//   //     node_id: 'idp1',
//   //     reference_id: referenceId,
//   //     accessor_id: accessorId,
//   //     sid,
//   //     sid_hash,
//   //     hash_method: 'SHA256',
//   //     key_type: 'RSA',
//   //     sign_method: 'RSA-SHA256',
//   //     padding: 'PKCS#1v1.5',
//   //   });
//   // });

//   it('Identity should be created successfully', async function() {
//     this.timeout(15000);
//     const createIdentityResult = await createIdentityResultPromise.promise;
//     expect(createIdentityResult).to.deep.include({
//       reference_id: referenceId,
//       success: true,
//     });

//     expect(createIdentityResult.reference_group_code).to.be.a('string').that.is
//       .not.empty;

//     referenceGroupCode = createIdentityResult.reference_group_code;

//     const response = await commonApi.getRelevantIdpNodesBySid('idp1', {
//       namespace,
//       identifier,
//     });
//     const idpNodes = await response.json();
//     const idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp1');
//     expect(idpNode).to.not.be.undefined;
//     expect(idpNode.mode_list)
//       .to.be.an('array')
//       .that.include(2, 3);

//     db.idp1Identities.push({
//       referenceGroupCode,
//       willCreateOnIdP2: true,
//       mode: 3,
//       namespace,
//       identifier,
//       accessors: [
//         {
//           accessorId,
//           accessorPrivateKey,
//           accessorPublicKey,
//         },
//       ],
//     });
//   });

//   it('After create identity this sid should be existing on platform ', async function() {
//     const response = await identityApi.getIdentityInfo('idp1', {
//       namespace,
//       identifier,
//     });
//     expect(response.status).to.equal(200);
//     const responseBody = await response.json();
//     expect(responseBody.reference_group_code).to.equal(referenceGroupCode);
//   });

//   it('After create identity should get identity ial successfully', async function() {
//     const response = await identityApi.getIdentityIal('idp1', {
//       namespace,
//       identifier,
//     });
//     expect(response.status).to.equal(200);
//     const responseBody = await response.json();
//     expect(responseBody.ial).to.equal(2.3);
//   });

//   after(function() {
//     idp1EventEmitter.removeAllListeners('callback');
//   });
// });
