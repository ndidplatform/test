import { expect } from 'chai';

import * as commonApi from '../../../api/v6/common';
import * as ndidApi from '../../../api/v6/ndid';
import { wait } from '../../../utils';
import { ndidAvailable } from '../..';

describe('NDID add response error code tests', function () {
  before(function () {
    if (!ndidAvailable) {
      this.skip();
    }
  });

  it('NDID should add IdP error response codes and get IdP error response code successfully', async function () {
    this.timeout(20000);
    //query idp error code before add error code prevent duplicate error code and error
    const responseGetIdPErrorResponse = await commonApi.getIdPErrorCodes(
      'ndid1',
    );
    const responseBody = await responseGetIdPErrorResponse.json();
    expect(responseBody).to.be.an('array');
    let errorCode = responseBody.find((error) => error.error_code === 1000);
    if (errorCode) {
      // already had error code
      expect(errorCode).to.not.be.undefined;
    } else {
      const response = await ndidApi.addErrorCode('ndid1', {
        type: 'idp',
        error_code: 1000,
        description: 'IdP error response code 1',
      });

      expect(response.status).to.equal(204);
      await wait(3000);

      const responseGetIdPErrorResponse = await commonApi.getIdPErrorCodes(
        'ndid1',
      );
      const responseBody = await responseGetIdPErrorResponse.json();
      expect(responseBody).to.be.an('array');
      let errorCode = responseBody.find((error) => error.error_code === 1000);
      expect(errorCode).to.not.be.undefined;
    }
  });

  it('NDID should add AS error response codes and get AS error response code successfully', async function () {
    this.timeout(20000);
    //query idp error code before add error code prevent duplicate error code and error
    const responseGetASErrorResponse = await commonApi.getASErrorCodes('ndid1');
    const responseBody = await responseGetASErrorResponse.json();
    expect(responseBody).to.be.an('array');
    let errorCode = responseBody.find((error) => error.error_code === 1000);
    if (errorCode) {
      // already had error code
      expect(errorCode).to.not.be.undefined;
    } else {
      const response = await ndidApi.addErrorCode('ndid1', {
        type: 'as',
        error_code: 1000,
        description: 'AS error response code 1',
      });

      expect(response.status).to.equal(204);
      await wait(3000);

      const responseGetASErrorResponse = await commonApi.getASErrorCodes(
        'ndid1',
      );
      const responseBody = await responseGetASErrorResponse.json();
      expect(responseBody).to.be.an('array');
      let errorCode = responseBody.find((error) => error.error_code === 1000);
      expect(errorCode).to.not.be.undefined;
    }
  });
});
