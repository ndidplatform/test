import { expect } from 'chai';

import * as ndidApi from '../../../../api/v7/ndid';
import * as yourDataUtilityApi from '../../../../api/v7/yourdata/utility';

import { randomNumber } from '../../../../utils/random';

describe('Error Code', function () {
  const domain = 'YourData';

  describe('Add/Remove', function () {
    const errorCode = randomNumber(10000, 99999);
    const type = 'as';
    const description = `Test error code - ${errorCode}`;

    before(async function () {});

    it('NDID should add new domain error code successfully', async function () {
      this.timeout(10000);

      const response = await ndidApi.addDomainErrorCode('ndid1', {
        domain,
        error_code: errorCode,
        type,
        description,
      });

      expect(response.status).to.equal(204);
    });

    it('Error code should be added successfully', async function () {
      this.timeout(10000);

      const response = await yourDataUtilityApi.getASErrorCodes('ndid1');
      const responseBody = await response.json();
      const expectedErrorCode = responseBody.find(
        (errCode) => errCode.error_code === errorCode
      );

      expect(expectedErrorCode).to.deep.equal({
        error_code: errorCode,
        description,
      });
    });

    it('NDID should remove domain error code successfully', async function () {
      this.timeout(10000);

      const response = await ndidApi.removeDomainErrorCode('ndid1', {
        domain,
        error_code: errorCode,
        type,
      });

      expect(response.status).to.equal(204);
    });

    it('Error code should be removed successfully', async function () {
      this.timeout(10000);

      const response = await yourDataUtilityApi.getASErrorCodes('ndid1');
      const responseBody = await response.json();
      const expectedErrorCode = responseBody.find(
        (errCode) => errCode.error_code === errorCode
      );

      expect(expectedErrorCode).to.be.undefined;
    });
  });
});
