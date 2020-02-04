import * as chalk from 'chalk'
import * as dgram from 'dgram'

export const server = ({
	port,
	onMessage,
	log,
}: {
	port: number
	onMessage: (args: {
		deviceShortId: number
		appId: string
		data: string
	}) => void
	log: (...args: any[]) => void
}) => {
	const server = dgram.createSocket('udp4')

	server.on('error', error => {
		log(chalk.red('Error:'), chalk.yellow(error.message))
		server.close()
	})

	server.on('message', (msg, info) => {
		log(
			chalk.blue('<'),
			chalk.cyan(`${info.address}:${info.port}`),
			chalk.yellow(msg.toString().trim()),
		)
		const [deviceShortId, appId, data] = msg
			.toString()
			.trim()
			.split(':')
		onMessage({
			deviceShortId: parseInt(deviceShortId, 10),
			appId,
			data,
		})
	})

	server.on('listening', () => {
		const address = server.address()
		const port = address.port
		const ipaddr = address.address
		log(chalk.magenta('is listening at'), chalk.blue(`${ipaddr}:${port}`))
	})

	server.on('close', () => {
		log(chalk.magenta('closed'))
	})

	server.bind(port)

	return server
}
