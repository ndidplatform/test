import EventEmitter from 'events';

import TendermintWsClient from './ws_client';

function getWsAddress(nodeId) {
  if (nodeId === 'rp1') {
    return 'localhost:45001';
  } else if (nodeId === 'rp2') {
    return 'localhost:45001';
  } else if (nodeId === 'idp1') {
    return 'localhost:45000';
  } else if (nodeId === 'idp2') {
    return 'localhost:45000';
  } else if (nodeId === 'idp3') {
    return 'localhost:45000';
  } else if (nodeId === 'as1') {
    return 'localhost:45002';
  } else if (nodeId === 'as2') {
    return 'localhost:45002';
  } else if (nodeId === 'ndid1') {
    return 'localhost:45000';
  } else if (nodeId === 'proxy1') {
    return 'localhost:45003';
  } else if (nodeId === 'proxy2') {
    return 'localhost:45003';
  } else {
    throw new Error('Unsupported Node ID');
  }
}

let ndid1TendermintWsClient;
let rp1TendermintWsClient;
let rp2TendermintWsClient;
let idp1TendermintWsClient;
let idp2TendermintWsClient;
let idp3TendermintWsClient;
let as1TendermintWsClient;
let as2TendermintWsClient;
let proxy1TendermintWsClient;
let proxy2TendermintWsClient;

const currentBlockHeight = {
  ndid1: null,
  rp1: null,
  rp2: null,
  idp1: null,
  idp2: null,
  idp3: null,
  as1: null,
  as2: null,
  proxy1: null,
  proxy2: null,
};

const blockHeightEventEmitter = new EventEmitter();

export function connectWs() {
  ndid1TendermintWsClient = new TendermintWsClient(
    'ndid1',
    true,
    getWsAddress('ndid1')
  );
  rp1TendermintWsClient = new TendermintWsClient(
    'rp1',
    true,
    getWsAddress('rp1')
  );
  rp2TendermintWsClient = new TendermintWsClient(
    'rp2',
    true,
    getWsAddress('rp2')
  );
  idp1TendermintWsClient = new TendermintWsClient(
    'idp1',
    true,
    getWsAddress('idp1')
  );
  idp2TendermintWsClient = new TendermintWsClient(
    'idp2',
    true,
    getWsAddress('idp2')
  );
  idp3TendermintWsClient = new TendermintWsClient(
    'idp3',
    true,
    getWsAddress('idp3')
  );
  as1TendermintWsClient = new TendermintWsClient(
    'as1',
    true,
    getWsAddress('as1')
  );
  as2TendermintWsClient = new TendermintWsClient(
    'as2',
    true,
    getWsAddress('as2')
  );
  proxy1TendermintWsClient = new TendermintWsClient(
    'proxy1',
    true,
    getWsAddress('proxy1')
  );
  proxy2TendermintWsClient = new TendermintWsClient(
    'proxy2',
    true,
    getWsAddress('proxy2')
  );

  ndid1TendermintWsClient.on('connected', onConnected('ndid1'));
  rp1TendermintWsClient.on('connected', onConnected('rp1'));
  rp2TendermintWsClient.on('connected', onConnected('rp2'));
  idp1TendermintWsClient.on('connected', onConnected('idp1'));
  idp2TendermintWsClient.on('connected', onConnected('idp2'));
  idp3TendermintWsClient.on('connected', onConnected('idp3'));
  as1TendermintWsClient.on('connected', onConnected('as1'));
  as2TendermintWsClient.on('connected', onConnected('as2'));
  proxy1TendermintWsClient.on('connected', onConnected('proxy1'));
  proxy2TendermintWsClient.on('connected', onConnected('proxy2'));

  // Tendermint < 0.33.x
  // tendermintWsClient.on('newBlock_event#event', handleNewBlockEvent);
  // Tendermint >= 0.33.x
  ndid1TendermintWsClient.on('newBlock_event', handleNewBlockEvent('ndid1'));
  rp1TendermintWsClient.on('newBlock_event', handleNewBlockEvent('rp1'));
  rp2TendermintWsClient.on('newBlock_event', handleNewBlockEvent('rp2'));
  idp1TendermintWsClient.on('newBlock_event', handleNewBlockEvent('idp1'));
  idp2TendermintWsClient.on('newBlock_event', handleNewBlockEvent('idp2'));
  idp3TendermintWsClient.on('newBlock_event', handleNewBlockEvent('idp3'));
  as1TendermintWsClient.on('newBlock_event', handleNewBlockEvent('as1'));
  as2TendermintWsClient.on('newBlock_event', handleNewBlockEvent('as2'));
  proxy1TendermintWsClient.on('newBlock_event', handleNewBlockEvent('proxy1'));
  proxy2TendermintWsClient.on('newBlock_event', handleNewBlockEvent('proxy2'));
}

export function disconnectWS() {
  ndid1TendermintWsClient.close();
  rp1TendermintWsClient.close();
  rp2TendermintWsClient.close();
  idp1TendermintWsClient.close();
  idp2TendermintWsClient.close();
  idp3TendermintWsClient.close();
  as1TendermintWsClient.close();
  as2TendermintWsClient.close();
  proxy1TendermintWsClient.close();
  proxy2TendermintWsClient.close();
}

function getTendermintWsClient(nodeId) {
  if (nodeId === 'rp1') {
    return rp1TendermintWsClient;
  } else if (nodeId === 'rp2') {
    return rp2TendermintWsClient;
  } else if (nodeId === 'idp1') {
    return idp1TendermintWsClient;
  } else if (nodeId === 'idp2') {
    return idp2TendermintWsClient;
  } else if (nodeId === 'idp3') {
    return idp3TendermintWsClient;
  } else if (nodeId === 'as1') {
    return as1TendermintWsClient;
  } else if (nodeId === 'as2') {
    return as2TendermintWsClient;
  } else if (nodeId === 'ndid1') {
    return ndid1TendermintWsClient;
  } else if (nodeId === 'proxy1') {
    return proxy1TendermintWsClient;
  } else if (nodeId === 'proxy2') {
    return proxy2TendermintWsClient;
  } else {
    throw new Error('Unsupported Node ID');
  }
}

function onConnected(nodeId) {
  return () => {
    const tendermintWsClient = getTendermintWsClient(nodeId);
    tendermintWsClient.subscribeToNewBlockEvent();

    getCurrentBlockHeight(nodeId);
  };
}

function handleNewBlockEvent(nodeId) {
  return function (error, result) {
    if (error) {
      // logger.error({
      //   message: 'Tendermint NewBlock event subscription error',
      //   err: error,
      // });
      throw new Error(error);
    }

    const blockHeight = getBlockHeightFromNewBlockEvent(result);
    // const block = result.data.value.block;

    // logger.debug({
    //   message: 'Tendermint NewBlock event received',
    //   blockHeight,
    // });

    if (
      currentBlockHeight[nodeId] == null ||
      currentBlockHeight[nodeId] < blockHeight
    ) {
      currentBlockHeight[nodeId] = blockHeight;
      blockHeightEventEmitter.emit(nodeId, blockHeight);
    }
  };
}

function getBlockHeightFromNewBlockEvent(result) {
  return parseInt(result.data.value.block.header.height);
}

async function getCurrentBlockHeight(nodeId) {
  const tendermintWsClient = getTendermintWsClient(nodeId);

  const status = await tendermintWsClient.status();

  const blockHeight = parseInt(status.sync_info.latest_block_height);
  if (
    currentBlockHeight[nodeId] == null ||
    currentBlockHeight[nodeId] < blockHeight
  ) {
    currentBlockHeight[nodeId] = blockHeight;
  }
}

export function waitUntilBlockHeight(nodeId, blockHeight) {
  return new Promise((resolve, reject) => {
    // console.log(
    //   'wait until block height',
    //   nodeId,
    //   currentBlockHeight[nodeId],
    //   blockHeight
    // );
    if (
      currentBlockHeight[nodeId] != null &&
      currentBlockHeight[nodeId] >= blockHeight
    ) {
      resolve();
    } else {
      const newBlockHeightEvent = (newBlockHeight) => {
        if (newBlockHeight >= blockHeight) {
          blockHeightEventEmitter.off(nodeId, newBlockHeightEvent);
          resolve();
        }
      };
      blockHeightEventEmitter.on(nodeId, newBlockHeightEvent);
    }
  });
}

export function waitUntilBlockHeightMatch(waitingNodeId, nodeIdToMatch) {
  return waitUntilBlockHeight(waitingNodeId, currentBlockHeight[nodeIdToMatch]);
}
