import fs from 'fs';
import { spawn } from 'child_process';
import * as processEnv from '../process_env_master_worker';
import * as config from './config';

let API_DIRECTORY_PATH = config.API_DIRECTORY_PATH;
let STDOUT_LOG_DIRECTORY_PATH = config.STDOUT_LOG_DIRECTORY_PATH;
let STDERR_LOG_DIRECTORY_PATH = config.STDERR_LOG_DIRECTORY_PATH;

let workerStopProcessExpectedString = 'Worker shutdown successfully';
let masterStopProcessExpectedString = 'Job master gRPC server shutdown';
let workerStartProcessExpectedString = 'Server initialized';

export let objProcess = {};

export function initDevKey() {
  const stdout = fs.openSync(
    `${STDOUT_LOG_DIRECTORY_PATH}/initDevKey.log`,
    'a'
  );
  const stderr = fs.openSync(
    `${STDERR_LOG_DIRECTORY_PATH}/initDevKey.log`,
    'a'
  );

  return new Promise((resolve, reject) => {
    API_DIRECTORY_PATH = API_DIRECTORY_PATH
      ? API_DIRECTORY_PATH
      : processEnv.initDevKey.DIRECTORY_PATH;

    let objectProcessEnv = {
      PATH: process.env.PATH,
    };

    for (let env in processEnv.initDevKey) {
      objectProcessEnv = {
        ...objectProcessEnv,
        [env]: processEnv.initDevKey[env],
      };
    }

    try {
      console.log('Running initDevKey...');
      const initDevKey = spawn('npm run initDevKey', {
        cwd: API_DIRECTORY_PATH,
        shell: true,
        // detached: true,
        stdio: ['ignore', stdout, stderr],
        env: objectProcessEnv,
      });
      // child.unref();

      initDevKey.on('close', code => {
        if (code === 0) {
          resolve();
        } else {
          reject();
        }
      });
    } catch (error) {
      console.error(error);
    }
  });
}

export function startProcess(processName) {
  const stdout = fs.openSync(
    `${STDOUT_LOG_DIRECTORY_PATH}/${processName}.log`,
    'a'
  );
  const stderr = fs.openSync(
    `${STDERR_LOG_DIRECTORY_PATH}/${processName}.log`,
    'a'
  );

  try {
    console.log(`Running process ${processName}...`);

    let commandStart = process.env[processName];

    let options = {
      cwd: API_DIRECTORY_PATH,
      shell: true,
      // detached: true,
      stdio: ['ignore', stdout, stderr],
    };

    if (!process.env[processName]) {
      commandStart = 'node build/server.js';

      let objectProcessEnv = {
        PATH: process.env.PATH,
      };

      for (let env in processEnv[processName]) {
        objectProcessEnv = {
          ...objectProcessEnv,
          [env]: processEnv[processName][env],
        };
      }

      options = { ...options, env: objectProcessEnv };
    }

    objProcess[processName] = spawn(commandStart, options);
    // objProcess[processName].unref();
  } catch (error) {
    console.error(error);
  }
  return new Promise((resolve, reject) => {
    if (processName.toLowerCase().indexOf('master') != -1) {
      resolve();
      return;
    }
    try {
      let tail = spawn(
        'tail',
        ['-f', `${STDOUT_LOG_DIRECTORY_PATH}/${processName}.log`],
        {
          stdio: ['ignore'],
        }
      );
      tail.stdout.on('data', data => {
        if (data.toString().indexOf(workerStartProcessExpectedString) != -1) {
          tail.kill();
          resolve();
          return;
        }
      });
    } catch (error) {
      console.error(error);
    }
  });
}

export function stopProcess(processName) {
  return new Promise((resolve, reject) => {
    if (objProcess[processName]) {
      let expectedString =
        processName.toLowerCase().indexOf('worker') != -1
          ? workerStopProcessExpectedString
          : masterStopProcessExpectedString;
      try {
        let tail = spawn(
          'tail',
          ['-f', `${STDOUT_LOG_DIRECTORY_PATH}/${processName}.log`],
          {
            stdio: ['ignore'],
          }
        );
        tail.stdout.on('data', data => {
          if (!objProcess[processName].killed) {
            objProcess[processName].kill();
          } else {
            if (data.toString().indexOf(expectedString) != -1) {
              tail.kill();
              delete objProcess[processName];
              resolve();
              return;
            }
          }
        });
      } catch (error) {
        console.error(error);
      }
    } else {
      resolve();
      return;
    }
  });
}

// export function stopAllProcess() {
//   console.log('Stopping all api process after test');
//   Object.values(objProcess).forEach(process => {
//     process.kill();
//   });
// }
