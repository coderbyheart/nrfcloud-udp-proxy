# nRF Connect for Cloud UDP Proxy

[![Greenkeeper badge](https://badges.greenkeeper.io/coderbyheart/nrfcloud-udp-proxy.svg)](https://greenkeeper.io/)

## Run it locally

    export GITHUB_TOKEN=<a github token with needs registry read access>
    export API_KEY=<your nrfcloud.com API key>
    docker build -t nrfcloud-udp-proxy . --build-arg GITHUB_TOKEN=${GITHUB_TOKEN}
    docker volume create nrfcloud-udp-proxy
    docker run -d -p 8888/udp --name nrfcloud-udp-proxy --rm nrfcloud-udp-proxy -v nrfcloud-udp-proxy:/data node dist/proxy.js ${API_KEY} -d /data
