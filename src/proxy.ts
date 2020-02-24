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
import { withts } from './logts'
import { fetchHistoricalMessages } from './historyFetcher'
import { fetchDevice } from './fetchDevice'

export type DeviceConnection = {
	connection: AwsIotDevice
	updateShadow: (update: object) => Promise<void>
	deviceId: string
}

export type DeviceAppMessage = { appId: string; data: any }

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

const fetchMessages = fetchHistoricalMessages({ apiKey })
const fetchDeviceInfo = fetchDevice({ apiKey })

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
		await new Promise(resolve => {
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
					withts(console.log)(chalk.bgCyan(` ${deviceShortId} `), ...args),
			})
			deviceConnections.set(deviceShortId, {
				deviceId: deviceId,
				...d,
			})
		})

	Object.entries(config).forEach(([deviceShortId, deviceConfig]) => {
		withts(console.log)(
			chalk.bgCyan(` ${deviceShortId} `),
			chalk.yellow('Connecting device:'),
			chalk.cyan(deviceConfig.deviceId),
		)
		connectDevice({
			...deviceConfig,
			deviceShortId,
		}).catch(err => {
			withts(console.error)(chalk.red(err.message))
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

	const justInTimeRegistrations = new Map<string, Promise<DeviceConnection>>()

	const sendUpdate = (
		deviceShortId: string,
		c: DeviceConnection,
		message: DeviceAppMessage,
	) => {
		let publish = true
		if (message.appId === 'GPS') {
			// For the map feature we want to track the positions of all devices
			// parse the NMEA sentence
			const maybePacket = parseNmea(message.data)
			if (isLeft(maybePacket)) {
				withts(console.error)(
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
			['TEMP', 'AIR_QUAL', 'HUMID', 'AIR_PRESS'].includes(message.appId)
		) {
			// send everything else verbatim
			uiServer.sendDeviceUpdate(c, {
				update: message,
			})
		} else if (message.appId === 'RSRP') {
			// Filter out invalid RSRP dbm values, see https://projecttools.nordicsemi.no/jira/browse/TG91-205
			if (parseFloat(message.data) < 0) {
				uiServer.sendDeviceUpdate(c, {
					update: message,
				})
			} else {
				publish = false
			}
		}

		if (publish) {
			const topic = `${messagesPrefix}d/${c.deviceId}/d2c`
			c.connection.publish(topic, JSON.stringify(message))
			withts(console.log)(
				chalk.bgCyan(` ${deviceShortId} `),
				chalk.blue('>'),
				chalk.cyan(topic),
				chalk.yellow(JSON.stringify(message)),
			)
		}
	}

	const processNetworkInfo = (
		c: DeviceConnection,
		networkInfo: { mccmnc: string; cellID: number; areaCode: number },
		ts?: Date,
	) => {
		const cellQuery = {
			mccmnc: parseInt(networkInfo.mccmnc, 10),
			areaCode: networkInfo.areaCode,
			cellID: networkInfo.cellID,
		}
		pipe(
			cellgeolocationResolver(cellQuery),
			map(cellGeolocation => {
				withts(console.log)(
					chalk.bgBlue(' Cell Geolocation '),
					chalk.grey('located cell'),
					chalk.blue(JSON.stringify(cellQuery)),
					chalk.grey('at'),
					chalk.blueBright(JSON.stringify(cellGeolocation)),
				)
				uiServer.updateDeviceCellGeoLocation(c, cellGeolocation, ts)
			}),
			mapLeft(error => {
				withts(console.error)(
					chalk.bgBlue(' Cell Geolocation '),
					chalk.red(error.message),
				)
			}),
		)()
	}

	UDPServer({
		port,
		log: (...args) => withts(console.log)(chalk.magenta('UDP Server'), ...args),
		onMessage: async ({ deviceShortId, message }) => {
			let c = deviceConnections.get(deviceShortId)
			if (!c) {
				withts(console.error)(
					chalk.magenta('UDP Server'),
					chalk.yellow(`Device ${deviceShortId} not registered!`),
				)
				if (!justInTimeRegistrations.get(deviceShortId)) {
					justInTimeRegistrations.set(
						deviceShortId,
						registerDevice({ apiKey }).then(async cfg => {
							config[deviceShortId] = cfg
							return connectDevice({
								...config[deviceShortId],
								deviceShortId,
							})
						}),
					)
				}
				c = (await justInTimeRegistrations.get(
					deviceShortId,
				)) as DeviceConnection
			}
			if ('state' in message) {
				c.updateShadow(message).catch(err => {
					withts(console.error)(
						chalk.magenta('UDP Server'),
						chalk.red(
							`Failed to update shadow for device ${deviceShortId}: ${err.message}!`,
						),
					)
				})
				if (message.state?.reported?.device?.networkInfo) {
					processNetworkInfo(c, message.state?.reported?.device?.networkInfo)
				}
			} else {
				sendUpdate(deviceShortId, c, message as DeviceAppMessage)
			}
		},
	})

	// Fetch historical device data
	deviceConnections.forEach(async (connection, deviceShortId) => {
		withts(console.log)(
			chalk.blue(`History`),
			chalk.gray('Fetching history for device'),
			chalk.green(connection.deviceId),
		)
		// Messages
		fetchMessages(connection.deviceId)
			.then(hist =>
				hist.forEach((v, k) => {
					withts(console.log)(
						chalk.blue(`History`),
						chalk.green(connection.deviceId),
						chalk.blueBright(k),
						chalk.yellow(v),
					)
					sendUpdate(deviceShortId, connection, {
						appId: k,
						data: v,
					})
				}),
			)
			.catch(err => {
				console.error(
					chalk.blue(`History`),
					chalk.red(
						`Failed to fetch messages for device ${connection.deviceId}!`,
					),
					chalk.red(err.message),
				)
			})
		// State
		fetchDeviceInfo(connection.deviceId)
			.then(device => {
				const networkInfo =
					device?.state?.reported?.device?.networkInfo ?? undefined
				if (networkInfo) {
					withts(console.log)(
						chalk.blue(`History`),
						chalk.green(connection.deviceId),
						chalk.blueBright('networkInfo'),
						chalk.yellow(JSON.stringify(networkInfo)),
					)
					processNetworkInfo(
						connection,
						networkInfo,
						new Date(
							device?.state?.metadata?.reported?.device?.networkInfo?.cellID
								?.timestamp * 1000,
						),
					)
				}
				if (device?.state?.reported?.device?.deviceInfo?.imei) {
					withts(console.log)(
						chalk.blue(`History`),
						chalk.green(connection.deviceId),
						chalk.blueBright('IMEI'),
						chalk.yellow(device?.state?.reported?.device?.deviceInfo?.imei),
					)
					uiServer.updateDeviceIMEI(
						connection,
						device?.state?.reported?.device?.deviceInfo?.imei,
					)
				}
			})
			.catch(err => {
				console.error(
					chalk.blue(`History`),
					chalk.red(`Failed to fetch state for device ${connection.deviceId}!`),
					chalk.red(err.message),
				)
			})
	})
}

proxy().catch(err => {
	withts(console.error)(err.message)
	process.exit(1)
})
