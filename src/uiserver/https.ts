import * as http from 'http'

const greenlockExpress = require('greenlock-express')

/**
 * @see https://git.rootprojects.org/root/greenlock-express.js/src/commit/f18eae40736762b60f79191c9fc3090bb4547666/examples/http2/server.js
 */
export const createHTTPSUiServer = async ({
	handler,
	maintainerEmail,
	dataDir,
	log,
}: {
	handler: http.RequestListener
	maintainerEmail: string
	dataDir: string
	log: (...args: any[]) => void
}): Promise<http.Server> =>
	new Promise(resolve => {
		greenlockExpress
			.init({
				packageRoot: dataDir,
				maintainerEmail,
				configDir: './letsencrypt',
				securityUpdates: false,
				cluster: false,
				packageAgent: 'nrfcloud-udp-proxy/1.0',
				notify: log,
			})
			.ready((glx: any) => {
				const httpServer = glx.httpServer()
				httpServer.listen(80)
				resolve(glx.http2Server({}, handler))
			})
	})
