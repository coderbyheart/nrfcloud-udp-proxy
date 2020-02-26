import * as dgram from 'dgram'
import { parseJSON, toError, isLeft } from 'fp-ts/lib/Either'
import { Logger } from 'winston'

export const server = ({
	port,
	onMessage,
	logger,
}: {
	port: number | string
	onMessage: (args: {
		deviceShortId: string
		message: { [key: string]: any }
	}) => void
	logger: Logger
}) => {
	const server = dgram.createSocket('udp4')

	server.on('error', error => {
		logger.error(error.message)
		server.close()
	})

	server.on('message', (msg, info) => {
		const parts = msg
			.toString()
			.trim()
			.split(':')
		logger.debug(`< ${info.address}:${info.port}: ${msg.toString().trim()}`)
		if (parts.length < 2) {
			logger.debug('Dropping empty message')
			return
		}

		const [deviceShortId, ...message] = parts

		const maybeParsedMessage = parseJSON(message.join(':'), toError)

		if (isLeft(maybeParsedMessage)) {
			logger.error(`Failed to parse message as JSON: ${message}`)
			return
		} else {
			onMessage({
				deviceShortId: deviceShortId.replace(/[^0-9a-z-]/g, ''),
				message: maybeParsedMessage.right as { [key: string]: any },
			})
		}
	})

	server.on('listening', () => {
		const address = server.address()
		const port = address.port
		const ipaddr = address.address
		logger.info(`is listening at ${ipaddr}:${port}`)
	})

	server.on('close', () => {
		logger.info('closed')
	})

	server.bind(typeof port === 'string' ? parseInt(port, 10) : port)

	return server
}
