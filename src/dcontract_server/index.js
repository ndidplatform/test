import EventEmitter from 'events';

import express from 'express';
// import bodyParser from 'body-parser';

import { testDataWithHash } from './test_data';

import * as config from '../config';

export const eventEmitter = new EventEmitter();

let server;
const app = express();
// app.use(bodyParser.json({ limit: '2mb' }));

app.get('/dcontract/:dcontract_hash', async function (req, res) {
  const { dcontract_hash } = req.params;

  const data = testDataWithHash[dcontract_hash];

  if (data == null) {
    res.status(404).end();
    return;
  }

  const fileName = `${dcontract_hash}.txt`;
  const fileType = 'text/plain';

  res.set('Content-disposition', 'attachment; filename=' + fileName);
  res.set('Content-Type', fileType);

  res.status(200).end(data);
});

export function startServer() {
  server = app.listen(config.DCONTRACT_SERVER_PORT);
}

export function stopServer() {
  server.close();
}
