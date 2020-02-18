import * as chalk from 'chalk'
import { device } from './device'
import { device as AwsIotDevice } from 'aws-iot-device-sdk'
import { server as UDPServer } from './udp-server'
import { parseNmea } from './nmea'
import { UIServer } from './uiserver/UIServer'
import { initConfig } from './config'
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
	const deviceConnections = [] as DeviceConnection[]

	Object.entries(config).forEach(([deviceShortId, deviceConfig]) => {
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
							uiServer.updateDeviceCellGeoLocation(c, cellGeolocation)
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
				} else if (['TEMP', 'AIR_QUAL'].includes(message.appId)) {
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
