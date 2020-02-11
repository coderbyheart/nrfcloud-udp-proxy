import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { Map } from './Map/Map'

ReactDOM.render(
	<Map
		proxyEndpoint={(
			process.env.PROXY_ENDPOINT || 'http://127.0.0.1:8080/'
		).replace(/\/+$/, '')}
	/>,
	document.getElementById('map'),
)
