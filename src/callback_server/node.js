import EventEmitter from 'events';

import express from 'express';
import bodyParser from 'body-parser';

import * as config from '../config';

export const eventEmitter = new EventEmitter();

let server;
const app = express();
app.use(bodyParser.json({ limit: '2mb' }));

app.post('/node/mq_send_success', async function(req, res) {
  const callbackData = req.body;
  eventEmitter.emit('callback', callbackData);
  res.status(204).end();
});

export function startCallbackServer() {
  server = app.listen(config.NODE_CALLBACK_PORT);
}

export function stopCallbackServer() {
  server.close();
}
