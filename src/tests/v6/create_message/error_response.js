import { expect } from 'chai';

import * as rpApi from '../../../api/v6/rp';
import { generateReferenceId } from '../../../utils';
import * as config from '../../../config';

describe('RP create message errors', function() {

  const rpReferenceId = generateReferenceId();

  it('should get an error when creating a message with too short initial_salt', async function() {
    const createMessageParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      message: 'Test message (error create message)',
      purpose: 'E2E test',
      initial_salt: '1234',
      hash_message: true,
    };

    const response = await rpApi.createMessage('rp1', createMessageParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20087);
  });

  it('should get an error when creating a message with too long message', async function() {
    const createMessageParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      message: 'Test message (error create message) tWyzvS618jaGXYIhg0R1jVahiuYcjQO1DrkGmJyyXoLf7Rt3g0znNQhltGWFtRGz8EcA2RvfTk99UQztm3v8b0UZvazVbKecduwZDXuqNzOWjySeVwW08wjW63ELbRsPBYFJtBaM7qY2FXb5MJcrDXa3sBsvT95nyruHuxooDsrxI8r0c5fYW1Gq7OeNluK35qjaRKROaYtF68YRDqzzlGeCEsMxouW3UjtACq59FSZeqxCP27LYO8QUHVFAIf3bY9LfJmpgRZJGhVAOaLIz3vJArAlhzdS7KP65PHutLGL9Oa4K0jAcWo1kreVpCoyRrV5Aym4a4wkZF113cEKSkGUVtWZoEHhz9CCVcvaMlFZz5vd533jxMEapB4Fi5aKvzLIkIlObrmePp3k0bVSPLhJuPBC7UfS4uYg9V1v0uzfYD20Qeej3Eoj7i4oBePgI9iUFqCUwy5IAlpKIaqWfxE33GGEBhFG12VvxHFuMLG79xDRUwRSERI5RfbiEjxT5kuUTfRBQaMkmppLVR4d3MLeKog0GoWX06WK0QdBjqfFPdZ7VX3OSrEBoZaIUiLrVmzkOJL9A8RdO27WTQ2JY3TVu0ivIn8V8SAy8OyIPeXctFEArjtebfTiIg9dO5mNvdKuAlMoZRC3hUlujMWAGwzErB5hPoMGNShzIzobdeZCIua34ZScFFy6I6T7qIe6LDhbSG7zV9AOuQFPoARaH3gjeOwxwqKaEST8U0KeFKCM60sWXQW1iuCu54YeNZYUpglzCDahA5SGn6VeGD1k6Gu54Mj7kGcm2ubegwky5KiV2Ov1pqqN9eK2t4K78vUDmJCzWzxm5pcDedZDdVYh0wkumWu1Rql9F1YFdsUTOsrChdgYtZZ7J6uATBfEJLFduk3ijnAVjDhf6pgzSJ31ogSGN6DS5VbDdLEatcwNHVBqW0rZH1T2HyMh7je3BzavyYEU7rmA10snhSnl1WCrrfcxhYzIUX4goH9goqKSXzFq3SEO2VrZQd8e8kGAo',
      purpose: 'E2E test',
      hash_message: false,
    };

    const response = await rpApi.createMessage('rp1', createMessageParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20088);
  });

  it('should get an error when creating a message with too long purpose', async function() {
    const createMessageParams = {
      reference_id: rpReferenceId,
      callback_url: config.RP_CALLBACK_URL,
      message: 'Test message (error create message)',
      purpose: 'E2E test tWyzvS618jaGXYIhg0R1jVahiuYcjQO1DrkGmJyyXoLf7Rt3g0znNQhltGWFtRGz8EcA2RvfTk99UQztm3v8b0UZvazVbKecduwZDXuqNzOWjySeVwW08wjW63ELbRsPBYFJtBaM7qY2FXb5MJcrDXa3sBsvT95nyruHuxooDsrxI8r0c5fYW1Gq7OeNluK35qjaRKROaYtF68YRDqzzlGeCEsMxouW3UjtACq59FSZeqxCP27LYO8QUHVFAIf3bY9LfJmpgRZJGhVAOaLIz3vJArAlhzdS7KP65PHutLGL9Oa4K0jAcWo1kreVpCoyRrV5Aym4a4wkZF113cEKSkGUVtWZoEHhz9CCVcvaMlFZz5vd533jxMEapB4Fi5aKvzLIkIlObrmePp3k0bVSPLhJuPBC7UfS4uYg9V1v0uzfYD20Qeej3Eoj7i4oBePgI9iUFqCUwy5IAlpKIaqWfxE33GGEBhFG12VvxHFuMLG79xDRUwRSERI5RfbiEjxT5kuUTfRBQaMkmppLVR4d3MLeKog0GoWX06WK0QdBjqfFPdZ7VX3OSrEBoZaIUiLrVmzkOJL9A8RdO27WTQ2JY3TVu0ivIn8V8SAy8OyIPeXctFEArjtebfTiIg9dO5mNvdKuAlMoZRC3hUlujMWAGwzErB5hPoMGNShzIzobdeZCIua34ZScFFy6I6T7qIe6LDhbSG7zV9AOuQFPoARaH3gjeOwxwqKaEST8U0KeFKCM60sWXQW1iuCu54YeNZYUpglzCDahA5SGn6VeGD1k6Gu54Mj7kGcm2ubegwky5KiV2Ov1pqqN9eK2t4K78vUDmJCzWzxm5pcDedZDdVYh0wkumWu1Rql9F1YFdsUTOsrChdgYtZZ7J6uATBfEJLFduk3ijnAVjDhf6pgzSJ31ogSGN6DS5VbDdLEatcwNHVBqW0rZH1T2HyMh7je3BzavyYEU7rmA10snhSnl1WCrrfcxhYzIUX4goH9goqKSXzFq3SEO2VrZQd8e8kGAo',
      hash_message: false,
    };

    const response = await rpApi.createMessage('rp1', createMessageParams);
    const responseBody = await response.json();
    expect(response.status).to.equal(400);
    expect(responseBody.error.code).to.equal(20089);
  });
});
