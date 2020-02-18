# nRF Connect for Cloud UDP Proxy

![Release](https://github.com/coderbyheart/nrfcloud-udp-proxy/workflows/Release/badge.svg?branch=saga)
[![Greenkeeper badge](https://badges.greenkeeper.io/coderbyheart/nrfcloud-udp-proxy.svg)](https://greenkeeper.io/)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://github.com/prettier/prettier/)
[![ESLint: TypeScript](https://img.shields.io/badge/ESLint-TypeScript-blue.svg)](https://github.com/typescript-eslint/typescript-eslint)

This proxy provides a UDP server, which listens for plaintext messages in the
format:

    <device id>:<message>

where `<device id>` is an integer identifying the local device on the proxy and
`<message>` is a JSON formatted application or shadow update message.

The proxy maintains device connections for a configurable amount of devices, set
the `DEVICE_COUNT` environment variable to override the default of `3`.

## Examples

These examples use netcat to send UDP messages for device `2` to the proxy:

    echo '2:{"state":{"reported":{"DEVICE":null,"device":{"networkInfo":{"currentBand":20,"supportedBands":"(2,3,4,8,12,13,20,28)","areaCode":30501,"mccmnc":"24201","ipAddress":"10.138.82.5 0000:0000:0000:0000:0000:0028:9E4C:7E01","ueMode":2,"cellID":20504576,"networkMode":"LTE-M GPS"},"simInfo":{"uiccMode":1,"iccid":"89470060171107305562","imsi":"242016000035951"},"deviceInfo":{"modemFirmware":"mfw_nrf9160_1.1.0","batteryVoltage":4281,"imei":"352656100442808","board":"nrf9160_pca20035","appVersion":"v1.2.0-rc1-5-g4f8f4f0b2134","appName":"asset_tracker"},"serviceInfo":{"ui":["GPS","FLIP","TEMP","HUMID","AIR_PRESS","BUTTON","LIGHT","RSRP"],"fota_v1":null}}}}}' | nc -c -w1 -u 127.0.0.1 8888
    echo '2:{"appId":"RSRP","data":"-91","messageType":"DATA"}' | nc -c -w1 -u 127.0.0.1 8888
    echo '2:{"appId":"TEMP","data":"27.6","messageType":"DATA"}' | nc -c -w1 -u 127.0.0.1 8888
    echo '2:{"appId":"HUMID","data":"24.0","messageType":"DATA"}' | nc -c -w1 -u 127.0.0.1 8888
    echo '2:{"appId":"AIR_PRESS","data":"96.5","messageType":"DATA"}' | nc -c -w1 -u 127.0.0.1 8888
    echo '2:{"appId":"LIGHT","data":"37 91 41 11","messageType":"DATA"}' | nc -c -w1 -u 127.0.0.1 8888
    echo '2:{"appId":"FLIP","data":"NORMAL","messageType":"DATA"}' | nc -c -w1 -u 127.0.0.1 8888
    echo '2:{"appId":"FLIP","data":"UPSIDE_DOWN","messageType":"DATA"}' | nc -c -w1 -u 127.0.0.1 8888
    echo '2:{"appId":"FLIP","data":"NORMAL","messageType":"DATA"}' | nc -c -w1 -u 127.0.0.1 8888
    echo '2:{"appId":"BUTTON","data":"1","messageType":"DATA"}' | nc -c -w1 -u 127.0.0.1 8888
    echo '2:{"appId":"BUTTON","data":"0","messageType":"DATA"}' | nc -c -w1 -u 127.0.0.1 8888
    echo '2:{"appId":"TEMP","data":"27.6","messageType":"DATA"}' | nc -c -w1 -u 127.0.0.1 8888
    echo '2:{"appId":"HUMID","data":"23.6","messageType":"DATA"}' | nc -c -w1 -u 127.0.0.1 8888
    echo '2:{"appId":"AIR_PRESS","data":"96.5","messageType":"DATA"}' | nc -c -w1 -u 127.0.0.1 8888
    echo '2:{"appId":"LIGHT","data":"37 88 37 10","messageType":"DATA"}' | nc -c -w1 -u 127.0.0.1 8888
    echo '2:{"appId":"TEMP","data":"27.9","messageType":"DATA"}' | nc -c -w1 -u 127.0.0.1 8888
    echo '2:{"appId":"HUMID","data":"23.9","messageType":"DATA"}' | nc -c -w1 -u 127.0.0.1 8888
    echo '2:{"appId":"AIR_PRESS","data":"96.5","messageType":"DATA"}' | nc -c -w1 -u 127.0.0.1 8888
    echo '2:{"appId":"AIR_QUAL","data":"25.0","messageType":"DATA"}' | nc -c -w1 -u 127.0.0.1 8888
    echo '0:{"appId": "GPS","messageType": "DATA","data": "$GPGGA,140254.985,6325.263,N,01026.174,E,1,12,1.0,0.0,M,0.0,M,,*6E"}' | nc -c -w1 -u 127.0.0.1 8888
    echo '1:{"appId": "GPS","messageType": "DATA","data": "$GPGGA,140255.985,6325.249,N,01026.236,E,1,12,1.0,0.0,M,0.0,M,,*62"}' | nc -c -w1 -u 127.0.0.1 8888
    echo '2:{"appId": "GPS","messageType": "DATA","data": "$GPGGA,140256.985,6325.263,N,01026.261,E,1,12,1.0,0.0,M,0.0,M,,*6B"}' | nc -c -w1 -u 127.0.0.1 8888
    echo '3:{"appId": "GPS","messageType": "DATA","data": "$GPGGA,140257.985,6325.280,N,01026.223,E,1,12,1.0,0.0,M,0.0,M,,*61"}' | nc -c -w1 -u 127.0.0.1 8888
    echo '4:{"appId": "GPS","messageType": "DATA","data": "$GPGGA,140258.985,6325.264,N,01026.216,E,1,12,1.0,0.0,M,0.0,M,,*62"}' | nc -c -w1 -u 127.0.0.1 8888
    echo '5:{"appId": "GPS","messageType": "DATA","data": "$GPGGA,140259.985,6325.268,N,01026.198,E,1,12,1.0,0.0,M,0.0,M,,*6A"}' | nc -c -w1 -u 127.0.0.1 8888
    echo '6:{"appId": "GPS","messageType": "DATA","data": "$GPGGA,140744.328,6325.274,N,01026.217,E,1,12,1.0,0.0,M,0.0,M,,*67"}' | nc -c -w1 -u 127.0.0.1 8888

## Run it locally

    export GITHUB_TOKEN=<a github token with needs registry read access>
    export API_KEY=<your nrfcloud.com API key>
    export UNWIREDLABS_API_KEY=<your unwiredlabs.com API key>

### using Node.js

    # Authenticate against GitHub: echo "//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}" > ~/.npmrc
    npm ci
    npx tsc
    npm run build
    npm start # start the proxy
    npm run map # open the development server for the ThingyWorld

### using Docker

    docker build -t nrfcloud-udp-proxy . --build-arg GITHUB_TOKEN=${GITHUB_TOKEN}
    docker volume create nrfcloud-udp-proxy
    docker run -d -p 8888/udp --name nrfcloud-udp-proxy --rm -v nrfcloud-udp-proxy:/data nrfcloud-udp-proxy DATA_DIR=/data forever dist/proxy.js
