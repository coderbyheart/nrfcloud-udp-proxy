import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { Map } from './Map/Map'

console.log(
	'%c ThingyWorld ',
	'background-color: #00a9ce; color: #ffffff; padding: 0.25rem;',
	'Source code:',
	'https://github.com/coderbyheart/nrfcloud-udp-proxy',
)

ReactDOM.render(
	<Map
		proxyEndpoint={(
			process.env.PROXY_ENDPOINT || document.location.href
		).replace(/\/+$/, '')}
	/>,
	document.getElementById('map'),
)
