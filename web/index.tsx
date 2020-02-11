import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { Map } from './Map/Map'

ReactDOM.render(
	<Map
		proxyEndpoint={(
			process.env.PROXY_ENDPOINT || document.location.href
		).replace(/\/+$/, '')}
	/>,
	document.getElementById('map'),
)
