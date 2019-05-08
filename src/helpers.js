import * as commonApi from './api/common';

export async function isNodeAvailable(nodeId) {
  try {
    const response = await commonApi.getInfo(nodeId);
    const responseBody = await response.json();
    if (responseBody.node_id === nodeId) {
      return true;
    }
    return false;
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      return false;
    } else {
      // throw error;
      return false;
    }
  }
}
