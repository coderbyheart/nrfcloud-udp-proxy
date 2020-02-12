import * as http from 'http'

export const createHTTPUiServer = async ({
	handler,
}: {
	handler: http.RequestListener
}): Promise<http.Server> => Promise.resolve(http.createServer(handler))
