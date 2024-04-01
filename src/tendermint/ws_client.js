import EventEmitter from 'events';

import WebSocket from 'ws';
import { ExponentialBackoff } from 'simple-backoff';

import * as logger from './logger';

// const PING_INTERVAL = 30000;
const PING_TIMEOUT_MS = 60000;

export default class TendermintWsClient extends EventEmitter {
  constructor(name = '', connect, tendermintAddress) {
    super();
    this.name = name;
    this.connected = false;
    this.tendermintAddress = tendermintAddress;
    // this.isAlive = false;
    this.reconnect = true;
    this.rpcId = 0;
    this.queue = [];
    this.backoff = new ExponentialBackoff({
      min: 1000,
      max: 15000,
      factor: 2,
      jitter: 0,
    });
    if (connect) {
      this.connect();
    }
  }

  connect() {
    logger.info({
      message: 'Tendermint WS connecting',
      connectionName: this.name,
    });
    this.ws = new WebSocket(`ws://${this.tendermintAddress}/websocket`);
    this.ws.on('open', () => {
      logger.info({
        message: 'Tendermint WS connected',
        connectionName: this.name,
      });
      // Reset backoff interval
      this.backoff.reset();
      this.reconnectTimeoutFn = null;

      this.connected = true;
      // this.isAlive = true;

      this.emit('connected');

      // this.pingIntervalFn = setInterval(() => {
      //   if (this.isAlive === false) return this.ws.terminate();

      //   this.isAlive = false;
      //   this.ws.ping();
      // }, PING_INTERVAL);

      this.pingTimeoutFn = setTimeout(() => {
        this.pingTimeout();
      }, PING_TIMEOUT_MS);
    });

    this.ws.on('close', (code, reason) => {
      if (this.connected === true) {
        logger.info({
          message: 'Tendermint WS disconnected',
          connectionName: this.name,
          code,
          reason,
        });

        // Reject all `_call` promises
        for (let rpcId in this.queue) {
          const error = new Error('Connection closed');
          this.queue[rpcId].promise[1](error);
          delete this.queue[rpcId];
        }

        this.emit('disconnected');
      }

      this.connected = false;
      // this.isAlive = false;
      // clearInterval(this.pingIntervalFn);
      // this.pingIntervalFn = null;
      clearTimeout(this.pingTimeoutFn);
      this.pingTimeoutFn = null;

      if (this.reconnect) {
        // Try reconnect
        const backoffTime = this.backoff.next();
        logger.debug({
          message: `Tendermint WS try reconnect in ${backoffTime} ms`,
          connectionName: this.name,
        });
        this.reconnectTimeoutFn = setTimeout(() => this.connect(), backoffTime);
      }
    });

    this.ws.on('error', (error) => {
      logger.error({
        message: 'Tendermint WS error',
        connectionName: this.name,
        err: error,
      });
      // this.emit('error', error);
    });

    this.ws.on('message', (message) => {
      // logger.debug({
      //   message: 'Data received from tendermint WS',
      //   connectionName: this.name,
      //   data: message,
      // });
      try {
        message = JSON.parse(message);
      } catch (error) {
        logger.warn({
          message: 'Error JSON parsing message received from tendermint',
          connectionName: this.name,
          data: message,
          err: error,
        });
        return;
      }

      const rpcId = message.id;
      if (this.queue[rpcId]) {
        if (message.error) {
          let error;
          if (message.error.data === 'Mempool is full') {
            error = new Error(message.error);
          } else {
            error = new Error(message.error);
          }
          this.queue[rpcId].promise[1](error);
        } else {
          this.queue[rpcId].promise[0](message.result);
        }

        delete this.queue[rpcId];
        return;
      }

      this.emit(message.id, message.error, message.result);
    });

    // this.ws.on('pong', () => {
    //   this.isAlive = true;
    // });

    this.ws.on('ping', () => {
      // console.log('>>>RECEIVED PING<<<', Date.now())
      clearTimeout(this.pingTimeoutFn);
      this.pingTimeoutFn = setTimeout(() => {
        this.pingTimeout();
      }, PING_TIMEOUT_MS);
    });
  }

  pingTimeout() {
    logger.debug({
      message:
        'Tendermint WS ping timed out (did not receive ping from server). Terminating connection.',
      connectionName: this.name,
    });
    this.ws.terminate();
  }

  /**
   *
   * @returns {Promise<Object>}
   */
  status() {
    return this._call(null, 'status', []);
  }

  /**
   *
   * @returns {Promise<Object>}
   */
  abciInfo() {
    return this._call(null, 'abci_info', []);
  }

  /**
   *
   * @param {number} height Block height to query
   * @returns {Promise<Object>}
   */
  block(height) {
    return this._call(null, 'block', [`${height}`]);
  }

  blockResults(height) {
    return this._call(null, 'block_results', [`${height}`]);
  }

  tx(hash, prove) {
    return this._call(null, 'tx', { hash: hash.toString('base64'), prove }); // for version 0.34.x and below
    // return this._call(null, 'tx', { hash: hash.toString('hex'), prove }); // for version >= 0.35
  }

  abciQuery(data, height) {
    const params = {
      data: data.toString('hex'),
    };
    if (height) {
      params.height = `${height}`;
    }
    return this._call(null, 'abci_query', params);
  }

  broadcastTxCommit(tx) {
    return this._call(null, 'broadcast_tx_commit', {
      tx: tx.toString('base64'),
    });
  }

  broadcastTxSync(tx) {
    return this._call(null, 'broadcast_tx_sync', { tx: tx.toString('base64') });
  }

  subscribeToNewBlockHeaderEvent() {
    if (this.connected) {
      return this._call('newBlockHeader_event', 'subscribe', [
        "tm.event = 'NewBlockHeader'",
      ]);
    }
  }

  subscribeToNewBlockEvent() {
    if (this.connected) {
      return this._call('newBlock_event', 'subscribe', [
        "tm.event = 'NewBlock'",
      ]);
    }
  }

  subscribeToTxEvent() {
    if (this.connected) {
      return this._call('tx_event', 'subscribe', ["tm.event = 'Tx'"]);
    }
  }

  close() {
    if (!this.ws) return;
    this.reconnect = false;
    clearTimeout(this.reconnectTimeoutFn);
    this.reconnectTimeoutFn = null;
    this.ws.close();
  }

  _call(callId, method, params, wsOpts) {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        return reject(new Error('WebSocket is not connected'));
      }

      let id;
      if (callId != null) {
        if (typeof callId !== 'string') {
          id = callId.toString();
        } else {
          id = callId;
        }
      } else {
        id = (++this.rpcId).toString();
      }
      const message = {
        jsonrpc: '2.0',
        method: method,
        params: params || null,
        id,
      };

      logger.debug({
        message: 'Calling Tendermint through WS',
        connectionName: this.name,
        payload: message,
      });
      this.queue[id] = { promise: [resolve, reject] };
      this.ws.send(JSON.stringify(message), wsOpts, (error) => {
        if (error) {
          delete this.queue[id];
          return reject(new Error('Tendermint WS send error'));
        }
      });
    });
  }
}
