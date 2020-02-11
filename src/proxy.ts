import * as chalk from 'chalk'
import { device } from './device'
import { device as AwsIotDevice } from 'aws-iot-device-sdk'
import { server as UDPServer } from './udp-server'
import { isLeft } from 'fp-ts/lib/Either'
import { parseNmea } from './nmea'
import { UIServer } from './UIServer'
import { initConfig } from './config'
import { describeAccount } from './nrfcloud'

export type DeviceConnection = {
	connection: AwsIotDevice
	updateShadow: (update: object) => Promise<void>
	deviceId: string
}

const dataDir = process.env.DATA_DIR || process.cwd()
const apiKey = process.env.API_KEY || ''
const port = process.env.PORT || 8888
const httpPort = process.env.HTTP_PORT || 8080
const deviceCount = process.env.DEVICE_COUNT
	? parseInt(process.env.DEVICE_COUNT, 10)
	: 3

const proxy = async () => {
	const { config, updateConfig } = await initConfig({
		apiKey,
		deviceCount,
		dataDir,
	})

	const { mqttEndpoint, messagesPrefix } = await describeAccount({ apiKey })

	// Connect all devices
	const deviceConnections = [] as DeviceConnection[]

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
					updateConfig(config)
				},
				apiKey,
				log: (...args) =>
					console.log(chalk.bgCyan(` ${deviceShortId} `), ...args),
			}),
		})
	})

	// Start UI server
	const uiServer = UIServer({
		apiKey,
		httpPort,
		deviceConnections,
	})

	UDPServer({
		port,
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
			if ('state' in message) {
				c.updateShadow(message).catch(err => {
					console.error(
						chalk.magenta('UDP Server'),
						chalk.red(
							`Failed to update shadow for device ${deviceShortId}: ${err.message}!`,
						),
					)
				})
				if (message.state?.reported?.device?.networkInfo) {
					const {
						areaCode,
						mccmnc,
						cellID,
					} = message.state?.reported?.device?.networkInfo
					console.log({ areaCode, mccmnc, cellID })
					// TODO: resolve and send location to client
				}
			} else {
				const topic = `${messagesPrefix}d/${c.deviceId}/d2c`
				c.connection.publish(topic, JSON.stringify(message))
				console.log(
					chalk.bgCyan(` ${deviceShortId} `),
					chalk.blue('>'),
					chalk.cyan(topic),
					chalk.yellow(JSON.stringify(message)),
				)

				if (message.appId === 'GPS') {
					// For the map feature we want to track the positions of all devices
					// parse the NMEA sentence
					const maybePacket = parseNmea(message.data)
					if (isLeft(maybePacket)) {
						console.error(
							chalk.magenta('UDP Server'),
							chalk.red(maybePacket.left.message),
						)
					} else {
						const packet = maybePacket.right
						if (packet.sentenceId === 'GGA') {
							uiServer.updateDeviceGeoLocation(c, packet)
						}
					}
				} else {
					// send everything else verbatim
					uiServer.sendDeviceUpdate(c, message)
				}
			}
		},
	})
}

proxy().catch(err => {
	console.error(err.message)
	process.exit(1)
})
