import * as commonApi from '../../../api/v5/common';
import * as ndidApi from '../../../api/v5/ndid';
import { ndidAvailable } from '../..';
import { wait } from '../../../utils';

const REQUEST_TYPE_DCONTRACT = 'dcontract';

const IDP_ERROR_CODE_DOCUMENT_INTEGRITY_FAILED = 31000;

describe('dContract request type tests', function () {
  before(async function () {
    this.timeout(15000);

    if (!ndidAvailable) {
      this.test.parent.pending = true;
      this.skip();
    }

    let response;
    let responseBody;

    // add request type
    response = await commonApi.getRequestTypeList('ndid1');
    responseBody = await response.json();
    const foundRequestType = responseBody.find(
      (type) => type === REQUEST_TYPE_DCONTRACT
    );

    if (foundRequestType == null) {
      response = await ndidApi.addRequestType('ndid1', {
        name: REQUEST_TYPE_DCONTRACT,
      });

      if (response.status !== 204) {
        throw new Error(
          `Could not add request type: ${REQUEST_TYPE_DCONTRACT}`
        );
      }

      await wait(2000);
    }

    // add error code
    response = await commonApi.getIdPErrorCodes('ndid1');
    responseBody = await response.json();
    const foundErrorCode = responseBody.find(
      (error) => error.error_code === IDP_ERROR_CODE_DOCUMENT_INTEGRITY_FAILED
    );

    if (foundErrorCode == null) {
      response = await ndidApi.addErrorCode('ndid1', {
        type: 'idp',
        error_code: IDP_ERROR_CODE_DOCUMENT_INTEGRITY_FAILED,
        description: 'IdP error response code (dcontract)',
      });

      if (response.status !== 204) {
        throw new Error(
          `Could not add IdP error response code (dcontract): ${IDP_ERROR_CODE_DOCUMENT_INTEGRITY_FAILED}`
        );
      }

      await wait(2000);
    }
  });

  require('./mode_1');

  require('./idp_response_error');
});
