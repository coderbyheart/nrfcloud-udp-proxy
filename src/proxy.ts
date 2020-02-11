import * as chalk from 'chalk'
import * as fs from 'fs'
import * as path from 'path'
import fetch from 'node-fetch'
import { v4 } from 'uuid'
import { device } from './device'
import { device as AwsIotDevice } from 'aws-iot-device-sdk'
import { server as UDPServer } from './udp-server'
import { tryCatch, isLeft } from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/pipeable'
import * as TE from 'fp-ts/lib/TaskEither'
import { parseNmeaSentence, Packet } from 'nmea-simple'
import {
	server as WebSocketServer,
	connection as WSConnection,
} from 'websocket'
import * as http from 'http'

const data = process.env.DATA_DIR || process.cwd()
const apiKey = process.env.API_KEY || ''
const port = process.env.PORT || '8888'
const httpPort = process.env.HTTP_PORT || '8080'
const deviceCount = process.env.DEVICE_COUNT
	? parseInt(process.env.DEVICE_COUNT, 10)
	: 3

const parseJSON = (json: string) =>
	tryCatch<Error, any>(
		() => JSON.parse(json),
		() => new Error(`Failed to parse JSON: ${json}!`),
	)

const parseNmea = (sentence: string) =>
	tryCatch<Error, Packet>(
		() => parseNmeaSentence(sentence),
		err =>
			new Error(`Failed to parse NMEA sentence: ${(err as Error).message}!`),
	)

const fetchDevices = () =>
	TE.tryCatch<Error, { id: string; name: string }[]>(
		async () =>
			fetch(`https://api.nrfcloud.com/v1/devices`, {
				headers: {
					Authorization: `Bearer ${apiKey}`,
				},
			})
				.then(async res => res.json())
				.then(({ items }) => items as { id: string; name: string }[]),
		err => new Error(`Failed to fetch devices: ${(err as Error).message}!`),
	)
const proxy = async () => {
	let config: {
		deviceId: string
		ownershipCode: string
		caCert: string
		privateKey: string
		clientCert: string
		associated?: boolean
	}[]

	const configFile = path.join(data, 'config.json')
	try {
		config = JSON.parse(fs.readFileSync(configFile, 'utf-8').toString())
	} catch {
		console.log(chalk.yellow('No configuration found, creating...'))
		config = []
	}
	const writeConfig = () =>
		fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8')

	while (config.length < deviceCount) {
		const deviceId = v4()
		const ownershipCode = v4()
		const res = await fetch(
			`https://api.nrfcloud.com/v1/devices/${deviceId}/certificates`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${apiKey}`,
				},
				body: `${ownershipCode}`,
			},
		)
		const { caCert, privateKey, clientCert } = await res.json()
		config.push({
			deviceId,
			ownershipCode,
			caCert,
			privateKey,
			clientCert,
		})
		console.log(chalk.green('New device created:'), chalk.cyan(deviceId))
		writeConfig()
	}

	// Connect
	const account = await fetch(`https://api.nrfcloud.com/v1/account`, {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${apiKey}`,
		},
	})
	const {
		mqttEndpoint,
		topics: { messagesPrefix },
	} = await account.json()
	console.log(chalk.yellow('Endpoint:'), chalk.blue(mqttEndpoint))

	const deviceConnections = [] as {
		connection: AwsIotDevice
		updateShadow: (update: object) => Promise<void>
		deviceId: string
	}[]

	config.forEach((deviceConfig, deviceShortId) => {
		const {
			deviceId,
			caCert,
			privateKey,
			clientCert,
			ownershipCode,
			associated,
		} = deviceConfig

		console.log(
			chalk.bgCyan(` ${deviceShortId} `),
			chalk.yellow('Connecting device:'),
			chalk.cyan(deviceId),
		)
		deviceConnections.push({
			deviceId,
			...device({
				deviceId,
				caCert,
				privateKey,
				clientCert,
				ownershipCode,
				associated: associated || false,
				mqttEndpoint,
				onAssociated: () => {
					deviceConnections[0]?.connection.publish(
						`${messagesPrefix}d/${deviceId}/d2c`,
						JSON.stringify({
							appId: 'DEVICE',
							messageType: 'DATA',
							data: `Hello from the proxy! I am device ${deviceShortId}.`,
						}),
					)
					config[deviceShortId].associated = true
					writeConfig()
				},
				apiKey,
				log: (...args) =>
					console.log(chalk.bgCyan(` ${deviceShortId} `), ...args),
			}),
		})
	})

	const wsConnections: WSConnection[] = []
	const deviceGeolocations: {
		[key: string]: Packet
	} = {}

	const httpServer = http.createServer(async (request, response) => {
		if (request.method === 'OPTIONS') {
			response.writeHead(200, {
				'Access-Control-Allow-Methods': 'GET,OPTIONS,POST',
				'Access-Control-Allow-Headers': 'Content-Type',
				'Access-Control-Allow-Origin': '*',
			})
			response.end()
			return
		}
		switch (request.url) {
			case '/':
				fs.promises
					.readFile(path.join(process.cwd(), 'web', 'index.html'), 'utf-8')
					.then(index => {
						response.writeHead(200, {
							'Content-Length': index.length,
							'Content-Type': 'text/html',
						})
						response.end(index)
					})
					.catch(() => {
						response.statusCode = 500
						response.end()
					})
				break
			case '/main.js':
				fs.promises
					.readFile(path.join(process.cwd(), 'dist', 'main.js'), 'utf-8')
					.then(mainJS => {
						response.writeHead(200, {
							'Content-Length': mainJS.length,
							'Content-Type': 'text/javascript',
						})
						response.end(mainJS)
					})
					.catch(() => {
						response.statusCode = 500
						response.end()
					})
				break
			case '/devices':
				await pipe(
					fetchDevices(),
					TE.map(devices => {
						const d = deviceConnections.map(({ deviceId }, k) => ({
							shortId: k,
							deviceId,
							geolocation: deviceGeolocations[deviceId],
							name: devices.find(({ id }) => id === deviceId)?.name || deviceId,
						}))
						const res = JSON.stringify(d)
						response.writeHead(200, {
							'Content-Length': res.length,
							'Content-Type': 'application/json',
							'Access-Control-Allow-Origin': '*',
						})
						response.end(res)
					}),
				)()
				break
			default:
				response.statusCode = 404
				response.end()
		}
	})

	httpServer.listen(httpPort, () => {
		console.log(
			chalk.yellowBright('WS Server'),
			chalk.cyan('is listening at'),
			chalk.blue(`0.0.0.0:${httpPort}`),
		)
		const wsServer = new WebSocketServer({
			httpServer,
		})
		wsServer.on('request', request => {
			const connection = request.accept(undefined, request.origin)
			console.log(
				chalk.yellowBright('WS Server'),
				chalk.cyan(`${connection.remoteAddress} connected`),
			)

			wsConnections.push(connection)
			connection.on('close', () => {
				console.log(
					chalk.yellowBright('WS Server'),
					chalk.cyan(`${connection.remoteAddress} disconnected`),
				)
				wsConnections.splice(wsConnections.indexOf(connection))
			})
		})
	})

	UDPServer({
		port: parseInt(port, 10),
		log: (...args) => console.log(chalk.magenta('UDP Server'), ...args),
		onMessage: ({ deviceShortId, message }) => {
			const c = deviceConnections[deviceShortId]
			if (!c) {
				console.error(
					chalk.magenta('UDP Server'),
					chalk.red(`Device ${deviceShortId} not registered!`),
				)
				return
			}
			const maybeParsedMessage = parseJSON(message)
			if (isLeft(maybeParsedMessage)) {
				console.error(
					chalk.magenta('UDP Server'),
					chalk.red('Failed to parse message as JSON!'),
					chalk.yellow(message),
				)
				return
			}
			if ('state' in maybeParsedMessage.right) {
				c.updateShadow(maybeParsedMessage.right).catch(err => {
					console.error(
						chalk.magenta('UDP Server'),
						chalk.red(
							`Failed to update shadow for device ${deviceShortId}: ${err.message}!`,
						),
					)
				})
				if (maybeParsedMessage.right.state?.reported?.device?.networkInfo) {
					const {
						areaCode,
						mccmnc,
						cellID,
					} = maybeParsedMessage.right.state?.reported?.device?.networkInfo
					console.log({ areaCode, mccmnc, cellID })
					// TODO: resolve and send location to client
				}
			} else {
				const topic = `${messagesPrefix}d/${c.deviceId}/d2c`
				c.connection.publish(topic, message)
				console.log(
					chalk.bgCyan(` ${deviceShortId} `),
					chalk.blue('>'),
					chalk.cyan(topic),
					chalk.yellow(message),
				)
				// For the map feature we want to track the positions of all devices
				if (maybeParsedMessage.right.appId === 'GPS') {
					const maybePacket = parseNmea(maybeParsedMessage.right.data)
					if (isLeft(maybePacket)) {
						console.error(
							chalk.magenta('UDP Server'),
							chalk.red(maybePacket.left.message),
						)
					} else {
						const packet = maybePacket.right
						if (packet.sentenceId === 'GGA') {
							deviceGeolocations[c.deviceId] = packet
							wsConnections.forEach(wsConnection => {
								wsConnection.send(
									JSON.stringify({
										shortId: deviceShortId,
										deviceId: c.deviceId,
										geolocation: packet,
									}),
								)
							})
						}
					}
				}
			}
		},
	})
}

proxy().catch(err => {
	console.error(err.message)
	process.exit(1)
})
