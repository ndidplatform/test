import * as ndidApi from '../../api/v7/ndid';
import * as yourDataUtilityApi from '../../api/v7/yourdata/utility';
import * as apiHelpers from '../../api/helpers';

export async function ensureYourDataASErrorCode({ errorCode, description }) {
  const res = await apiHelpers.getResponseAndBody(
    yourDataUtilityApi.getASErrorCodes('ndid1')
  );

  const foundErrorCode = res.responseBody.find(
    (errCode) => errCode.error_code === errorCode
  );

  if (foundErrorCode == null) {
    await apiHelpers.getResponseAndBody(
      ndidApi.addDomainErrorCode('ndid1', {
        domain: 'YourData',
        error_code: errorCode,
        type: 'as',
        description,
      })
    );
  }
}
