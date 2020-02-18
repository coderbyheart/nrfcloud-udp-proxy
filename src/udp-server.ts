import * as chalk from 'chalk'
import * as dgram from 'dgram'
import { parseJSON, toError, isLeft } from 'fp-ts/lib/Either'

export const server = ({
	port,
	onMessage,
	log,
}: {
	port: number | string
	onMessage: (args: {
		deviceShortId: string
		message: { [key: string]: any }
	}) => void
	log: (...args: any[]) => void
}) => {
	const server = dgram.createSocket('udp4')

	server.on('error', error => {
		log(chalk.red('Error:'), chalk.yellow(error.message))
		server.close()
	})

	server.on('message', (msg, info) => {
		const parts = msg
			.toString()
			.trim()
			.split(':')
		if (parts.length < 2) {
			console.log(
				chalk.magenta('UDP Server'),
				chalk.red('Dropping invalid message'),
				chalk.yellow(msg),
			)
			return
		}
		log(
			chalk.blue('<'),
			chalk.cyan(`${info.address}:${info.port}`),
			chalk.yellow(msg.toString().trim()),
		)

		const [deviceShortId, ...message] = parts

		const maybeParsedMessage = parseJSON(message.join(':'), toError)

		if (isLeft(maybeParsedMessage)) {
			console.error(
				chalk.magenta('UDP Server'),
				chalk.red('Failed to parse message as JSON!'),
				chalk.yellow(message),
			)
			return
		} else {
			onMessage({
				deviceShortId,
				message: maybeParsedMessage.right as { [key: string]: any },
			})
		}
	})

	server.on('listening', () => {
		const address = server.address()
		const port = address.port
		const ipaddr = address.address
		log(chalk.cyan('is listening at'), chalk.blue(`${ipaddr}:${port}`))
	})

	server.on('close', () => {
		log(chalk.magenta('closed'))
	})

	server.bind(typeof port === 'string' ? parseInt(port, 10) : port)

	return server
}
