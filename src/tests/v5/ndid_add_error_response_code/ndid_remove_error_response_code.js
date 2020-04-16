import { expect } from 'chai';

import * as commonApi from '../../../api/v5/common';
import * as ndidApi from '../../../api/v5/ndid';
import { wait } from '../../../utils';
import { ndidAvailable } from '../..';

describe('NDID remove response error code tests', function () {
  before(function () {
    if (!ndidAvailable) {
      this.skip();
    }
  });

  it('NDID should add IdP error response codes and remove IdP error response code successfully', async function () {
    this.timeout(20000);
    const response = await ndidApi.addErrorCode('ndid1', {
      type: 'idp',
      error_code: 7000,
      description: 'IdP error response code 7000',
    });

    expect(response.status).to.equal(204);
    await wait(3000);

    const responseGetIdPErrorResponse = await commonApi.getIdPErrorCodes(
      'ndid1',
    );
    const responseBody = await responseGetIdPErrorResponse.json();
    expect(responseBody).to.be.an('array');
    let errorCode = responseBody.find((error) => error.error_code === 7000);
    expect(errorCode).to.not.be.undefined;

    // Remove error response code

    const responseRemoveCode = await ndidApi.removeErrorCode('ndid1', {
      type: 'idp',
      error_code: 7000,
    });
    expect(responseRemoveCode.status).to.equal(204);
    await wait(3000);

    const responseGetIdPErrorResponseAfterRemove = await commonApi.getIdPErrorCodes(
      'ndid1',
    );
    const responseBodyAfterRemove = await responseGetIdPErrorResponseAfterRemove.json();
    expect(responseBodyAfterRemove).to.be.an('array');
    let removedCode = responseBodyAfterRemove.find((error) => error.error_code === 7000);
    expect(removedCode).to.be.undefined;
  });

  it('NDID should add AS error response codes and remove AS error response code successfully', async function () {
    this.timeout(20000);
    const response = await ndidApi.addErrorCode('ndid1', {
      type: 'as',
      error_code: 8000,
      description: 'AS error response code 8000',
    });

    expect(response.status).to.equal(204);
    await wait(3000);

    const responseGetASErrorResponse = await commonApi.getASErrorCodes(
      'ndid1',
    );
    const responseBody = await responseGetASErrorResponse.json();
    expect(responseBody).to.be.an('array');
    let errorCode = responseBody.find((error) => error.error_code === 8000);
    expect(errorCode).to.not.be.undefined;

    // Remove error response code

    const responseRemoveCode = await ndidApi.removeErrorCode('ndid1', {
      type: 'as',
      error_code: 8000,
    });
    expect(responseRemoveCode.status).to.equal(204);
    await wait(3000);

    const responseGetASErrorResponseAfterRemove = await commonApi.getASErrorCodes(
      'ndid1',
    );
    const responseBodyAfterRemove = await responseGetASErrorResponseAfterRemove.json();
    expect(responseBodyAfterRemove).to.be.an('array');
    let removedCode = responseBodyAfterRemove.find((error) => error.error_code === 8000);
    expect(removedCode).to.be.undefined;
  });
});
