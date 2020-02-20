import * as chalk from 'chalk'
import { device } from './device'
import { device as AwsIotDevice } from 'aws-iot-device-sdk'
import { server as UDPServer } from './udp-server'
import { parseNmea } from './nmea'
import { UIServer } from './uiserver/UIServer'
import { initConfig, DeviceConfig, registerDevice } from './config'
import { describeAccount } from './nrfcloud'
import { resolveCellGeolocation } from './unwiredlabs'
import { mapLeft, map } from 'fp-ts/lib/TaskEither'
import { pipe } from 'fp-ts/lib/pipeable'
import { isLeft } from 'fp-ts/lib/Either'

export type DeviceConnection = {
	connection: AwsIotDevice
	updateShadow: (update: object) => Promise<void>
	deviceId: string
}

const dataDir = process.env.DATA_DIR || process.cwd()
const apiKey = process.env.API_KEY || ''
const port = process.env.PORT || '8888'
const httpPort = process.env.HTTP_PORT || '8080'
const deviceCount = process.env.DEVICE_COUNT
	? parseInt(process.env.DEVICE_COUNT, 10)
	: 3
const adminEmail = process.env.ADMIN_EMAIL || ''

const memoize = <R, T extends (...args: any[]) => R>(f: T): T => {
	const memory = new Map<string, R>()
	const g = (...args: any[]) => {
		const hash = JSON.stringify(args)
		if (!memory.get(hash)) {
			memory.set(hash, f(...args))
		}
		return memory.get(hash)
	}
	return g as T
}

const cellgeolocationResolver = memoize(
	resolveCellGeolocation({
		apiKey: process.env.UNWIREDLABS_API_KEY || '',
		endpoint:
			process.env.UNWIREDLABS_ENDPOINT || 'https://eu1.unwiredlabs.com/',
	}),
)

const proxy = async () => {
	const { config, updateConfig } = await initConfig({
		apiKey,
		deviceCount,
		dataDir,
	})

	const { mqttEndpoint, messagesPrefix } = await describeAccount({ apiKey })

	// Connect all devices
	const deviceConnections = new Map<string, DeviceConnection>()

	const connectDevice = async (
		args: DeviceConfig & { deviceShortId: string },
	): Promise<DeviceConnection> =>
		new Promise(resolve => {
			const { deviceShortId, deviceId, associated } = args
			const d = device({
				...args,
				associated: associated || false,
				mqttEndpoint,
				onAssociated: () => {
					deviceConnections.get(deviceShortId)?.connection.publish(
						`${messagesPrefix}d/${deviceId}/d2c`,
						JSON.stringify({
							appId: 'DEVICE',
							messageType: 'DATA',
							data: `Hello from the proxy! I am device ${deviceShortId}.`,
						}),
					)
					config[deviceShortId].associated = true
					updateConfig(config)
					resolve({
						deviceId: deviceId,
						...d,
					})
				},
				apiKey,
				log: (...args) =>
					console.log(chalk.bgCyan(` ${deviceShortId} `), ...args),
			})
			deviceConnections.set(deviceShortId, {
				deviceId: deviceId,
				...d,
			})
		})

	Object.entries(config).forEach(([deviceShortId, deviceConfig]) => {
		console.log(
			chalk.bgCyan(` ${deviceShortId} `),
			chalk.yellow('Connecting device:'),
			chalk.cyan(deviceConfig.deviceId),
		)
		connectDevice({
			...deviceConfig,
			deviceShortId,
		}).catch(err => {
			console.error(chalk.red(err.message))
		})
	})

	// Start UI server
	const uiServer = await UIServer({
		apiKey,
		httpPort: parseInt(httpPort, 10),
		deviceConnections,
		dataDir,
		maintainerEmail: adminEmail,
	})

	UDPServer({
		port,
		log: (...args) => console.log(chalk.magenta('UDP Server'), ...args),
		onMessage: async ({ deviceShortId, message }) => {
			let c = deviceConnections.get(deviceShortId)
			if (!c) {
				console.error(
					chalk.magenta('UDP Server'),
					chalk.yellow(`Device ${deviceShortId} not registered!`),
				)
				config[deviceShortId] = await registerDevice({ apiKey })
				c = await connectDevice({
					...config[deviceShortId],
					deviceShortId,
				})
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
					const cellQuery = {
						mccmnc: parseInt(
							message.state?.reported?.device?.networkInfo?.mccmnc,
							10,
						),
						areaCode: message.state?.reported?.device?.networkInfo?.areaCode,
						cellID: message.state?.reported?.device?.networkInfo?.cellID,
					}
					pipe(
						cellgeolocationResolver(cellQuery),
						map(cellGeolocation => {
							console.log(
								chalk.bgBlue(' Cell Geolocation '),
								chalk.grey('located cell'),
								chalk.blue(JSON.stringify(cellQuery)),
								chalk.grey('at'),
								chalk.blueBright(JSON.stringify(cellGeolocation)),
							)
							uiServer.updateDeviceCellGeoLocation(
								c as DeviceConnection,
								cellGeolocation,
							)
						}),
						mapLeft(error => {
							console.error(
								chalk.bgBlue(' Cell Geolocation '),
								chalk.red(error.message),
							)
						}),
					)()
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
				} else if (
					['TEMP', 'AIR_QUAL', 'HUMID', 'AIR_PRESS', 'RSRP'].includes(
						message.appId,
					)
				) {
					// send everything else verbatim
					uiServer.sendDeviceUpdate(c, {
						update: message,
					})
				}
			}
		},
	})
}

proxy().catch(err => {
	console.error(err.message)
	process.exit(1)
})
