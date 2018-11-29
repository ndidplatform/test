# End-to-end Test

~~Automated~~ E2E test for NDID platform

(CircleCI configuration needed. The old one is outdated.)

## Prerequisites

- Node.js 8.9 or later
- npm 5.6.0 or later

## How to run

1.  Install dependencies

    ```
    npm install
    ```

2.  Run tendermint and smart-contract (ABCI app) by following [setup instructions in `smart-contract` repository](https://github.com/ndidplatform/smart-contract/tree/development#setup)

3.  Run API servers

    3.1 Follow step 1-2 in [getting started instructions in `api` repository](https://github.com/ndidplatform/api#getting-started)

    3.2 Initialize Development node keys

    ```
    # from repository root directory
    cd main-server
    
    TENDERMINT_IP=127.0.0.1 \
    TENDERMINT_PORT=45000 \
    NODE_ID=ndid1 \
    npm run initDevKey
    ```
    
    3.3 Run a MQ service server
    
    - idp1
    
      ```
      # from repository root directory
      cd mq-server

      NODE_ID=idp1 \
      MQ_BINDING_PORT=5555 \
      SERVER_PORT=50051 \
      npm start
      
      ```
      
    - idp2
    
      ```
      # from repository root directory
      cd mq-server

      NODE_ID=idp2 \
      MQ_BINDING_PORT=5655 \
      SERVER_PORT=50052 \
      npm start
      
      ```
      
    - rp1
    
      ```
      # from repository root directory
      cd mq-server

      NODE_ID=rp1 \
      MQ_BINDING_PORT=5556 \
      SERVER_PORT=50053 \
      npm start
      
      ```

    - as1
    
      ```
      # from repository root directory
      cd mq-server

      NODE_ID=as1 \
      MQ_BINDING_PORT=5557 \
      SERVER_PORT=50054 \
      npm start
      
      ```
      
    - as2
    
      ```
      # from repository root directory
      cd mq-server

      NODE_ID=as2 \
      MQ_BINDING_PORT=5558 \
      SERVER_PORT=50055 \
      npm start
      
      ```
    
    3.4 Run API processes

    - ndid
    
      ```
      # from repository root directory
      cd main-server

      TENDERMINT_IP=127.0.0.1 \
      TENDERMINT_PORT=45000 \
      NODE_ID=ndid1 \
      NDID_NODE=true \
      npm start
      ```

    - idp1

      ```
      # from repository root directory
      cd main-server
      
      TENDERMINT_IP=127.0.0.1 \
      TENDERMINT_PORT=45000 \
      MQ_CONTACT_IP=127.0.0.1 \
      MQ_BINDING_PORT=5555 \
      MQ_SERVICE_SERVER_PORT=50051 \
      SERVER_PORT=8100 \
      NODE_ID=idp1 \
      npm start
      ```

    - idp2
    
      ```
      # from repository root directory
      cd main-server
      
      TENDERMINT_IP=127.0.0.1 \
      TENDERMINT_PORT=45000 \
      MQ_CONTACT_IP=127.0.0.1 \
      MQ_BINDING_PORT=5655 \
      MQ_SERVICE_SERVER_PORT=50052 \
      SERVER_PORT=8101 \
      NODE_ID=idp2 \
      npm start
      ```

    - rp1

      ```
      # from repository root directory
      cd main-server
      
      TENDERMINT_IP=127.0.0.1 \
      TENDERMINT_PORT=45001 \
      MQ_CONTACT_IP=127.0.0.1 \
      MQ_BINDING_PORT=5556 \
      MQ_SERVICE_SERVER_PORT=50053 \
      SERVER_PORT=8200 \
      NODE_ID=rp1 \
      npm start
      ```

    - as1
      ```
      # from repository root directory
      cd main-server
      
      TENDERMINT_IP=127.0.0.1 \
      TENDERMINT_PORT=45002 \
      MQ_CONTACT_IP=127.0.0.1 \
      MQ_BINDING_PORT=5557 \
      MQ_SERVICE_SERVER_PORT=50054 \
      SERVER_PORT=8300 \
      NODE_ID=as1 \
      npm start
      ```

    - as2
      ```
      # from repository root directory
      cd main-server
      
      TENDERMINT_IP=127.0.0.1 \
      TENDERMINT_PORT=45002 \
      MQ_CONTACT_IP=127.0.0.1 \
      MQ_BINDING_PORT=5657 \
      MQ_SERVICE_SERVER_PORT=50055 \
      SERVER_PORT=8301 \
      NODE_ID=as2 \
      npm start
      ```

4.  Run the test

    ```
    npm test
    ```

<!-- ## Run in Docker

### Prerequisites

- Docker CE 17.06+ Install docker
- docker-compose 1.14.0+ Install docker-compose

### Run

1.  Build docker container for test

2.  Run docker for smart contract (tendermint ABCI app) in [`smart-contract` repository](https://github.com/ndidplatform/smart-contract) (https://github.com/ndidplatform/smart-contract)

3.  Run docker for NDID API in [`api` repository](https://github.com/ndidplatform/api) (https://github.com/ndidplatform/api)

4.  -->
