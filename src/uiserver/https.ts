import * as path from 'path'
import * as http from 'http'

const greenlockExpress = require('greenlock-express')

/**
 * @see https://git.rootprojects.org/root/greenlock-express.js/src/commit/f18eae40736762b60f79191c9fc3090bb4547666/examples/http2/server.js
 */
export const createHTTPSUiServer = async ({
	handler,
	maintainerEmail,
	dataDir,
}: {
	handler: http.RequestListener
	maintainerEmail: string
	dataDir: string
}): Promise<http.Server> =>
	new Promise(resolve => {
		greenlockExpress
			.init({
				maintainerEmail,
				configDir: path.join(dataDir, 'letsencrypt'),
				securityUpdates: false,
				cluster: false,
			})
			.ready((glx: any) => {
				const httpServer = glx.httpServer(
					(req: http.IncomingMessage, res: http.ServerResponse) => {
						console.log(req)
						res.writeHead(404)
						res.end()
					},
				)
				httpServer.listen(80)
				resolve(glx.http2Server(handler))
			})
	})
