# nRF Connect for Cloud UDP Proxy

![Release](https://github.com/coderbyheart/nrfcloud-udp-proxy/workflows/Release/badge.svg?branch=saga)
[![Greenkeeper badge](https://badges.greenkeeper.io/coderbyheart/nrfcloud-udp-proxy.svg)](https://greenkeeper.io/)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://github.com/prettier/prettier/)
[![ESLint: TypeScript](https://img.shields.io/badge/ESLint-TypeScript-blue.svg)](https://github.com/typescript-eslint/typescript-eslint)

## Run it locally

    export GITHUB_TOKEN=<a github token with needs registry read access>
    export API_KEY=<your nrfcloud.com API key>

### using Node.js

    # Authenticate against GitHub: echo "//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}" > ~/.npmrc
    npm ci
    npx tsc
    node dist/proxy.js ${API_KEY}

### using Docker

    docker build -t nrfcloud-udp-proxy . --build-arg GITHUB_TOKEN=${GITHUB_TOKEN}
    docker volume create nrfcloud-udp-proxy
    docker run -d -p 8888/udp --name nrfcloud-udp-proxy --rm nrfcloud-udp-proxy -v nrfcloud-udp-proxy:/data node dist/proxy.js ${API_KEY} -d /data
