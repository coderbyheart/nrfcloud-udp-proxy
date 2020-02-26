import { device } from './device'
import { device as AwsIotDevice } from 'aws-iot-device-sdk'
import { server as UDPServer } from './udp-server'
import { parseNmea } from './nmea'
import { UIServer } from './uiserver/UIServer'
import { initConfig, DeviceConfig, registerDevice } from './config'
import { describeAccount } from './nrfcloud'
import { resolveCellGeolocation as resolveCellGeolocationUnwiredLabs } from './cellgeo/unwiredlabs'
import { resolveCellGeolocation as resolveCellGeolocationBifravst } from './cellgeo/bifravst'
import { orElse, map, mapLeft } from 'fp-ts/lib/TaskEither'
import { pipe } from 'fp-ts/lib/pipeable'
import { isLeft } from 'fp-ts/lib/Either'
import { fetchHistoricalMessages } from './historyFetcher'
import { fetchDevice } from './fetchDevice'
import { GGAPacket, encodeNmeaPacket } from 'nmea-simple'
import * as chalk from 'chalk'
import { createLogger, format, transports, Logger } from 'winston'
const { combine, label, timestamp, colorize, printf } = format

export type DeviceConnection = {
	connection: AwsIotDevice
	updateShadow: (update: object) => Promise<void>
	sendMessage: (message: object) => Promise<void>
	deviceId: string
}

export type DeviceAppMessage = { appId: string; data: any }

export type NetworkInfo = { mccmnc: string; cellID: number; areaCode: number }

const dataDir = process.env.DATA_DIR || process.cwd()
const apiKey = process.env.API_KEY || ''
const port = process.env.PORT || '8888'
const httpPort = process.env.HTTP_PORT || '8080'
const deviceCount = process.env.DEVICE_COUNT
	? parseInt(process.env.DEVICE_COUNT, 10)
	: 3
const adminEmail = process.env.ADMIN_EMAIL || ''

const flatten = printf(({ level, message, label, timestamp }) => {
	return `${chalk.grey(`[${timestamp}]`)} ${level} ${label} ${message}`
})

const topicLogger = (labelInfo: string, filename: string) =>
	createLogger({
		transports: [
			new transports.Console({
				level: 'info',
				format: combine(
					label({ label: labelInfo }),
					colorize(),
					timestamp(),
					flatten,
				),
			}),
			new transports.File({
				filename,
				level: 'debug',
				format: combine(label({ label: labelInfo }), timestamp(), flatten),
			}),
		],
	})

const udpLogger = topicLogger(chalk.magenta('UDP Server'), 'udp-messages.log')
const cellGeoServiceLogger = (service: string) =>
	topicLogger(
		chalk.bgBlue(` ${chalk.grey('Cell Geolocation')}: ${service} `),
		`cell-geolocation-${service}.log`,
	)
const cellGeoLogger = topicLogger(
	chalk.bgBlue('Cell Geolocation'),
	'cell-geolocation.log',
)

const deviceLoggers = new Map<string, Logger>()
const deviceLogger = (deviceShortId: string) => {
	if (!deviceLoggers.has(deviceShortId)) {
		deviceLoggers.set(
			deviceShortId,
			topicLogger(
				chalk.blue(`Device #${deviceShortId}`),
				`devices-${deviceShortId}.log`,
			),
		)
	}
	return deviceLoggers.get(deviceShortId) as Logger
}

const historyLogger = topicLogger(chalk.blue('History'), 'history.log')
const webserverLogger = topicLogger(
	chalk.yellowBright('Webserver'),
	'webserver.log',
)
const configLogger = topicLogger(chalk.blueBright('Config'), 'config.log')

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

const unwiredLabsCellgeolocationResolver = memoize(
	resolveCellGeolocationUnwiredLabs({
		apiKey: process.env.UNWIREDLABS_API_KEY || '',
		endpoint:
			process.env.UNWIREDLABS_ENDPOINT || 'https://eu1.unwiredlabs.com/',
		logger: cellGeoServiceLogger('UnwiredLabs'),
	}),
)

const bifravstCellgeolocationResolver = memoize(
	resolveCellGeolocationBifravst({
		endpoint: process.env.BIFRAVST_ENDPOINT || '',
		logger: cellGeoServiceLogger('Bifravst'),
	}),
)

const fetchMessages = fetchHistoricalMessages({
	apiKey,
	numHours: parseInt(process.env.HISTORY_HOURS || '24', 10),
})
const fetchDeviceInfo = fetchDevice({ apiKey })

const proxy = async () => {
	const { config, updateConfig } = await initConfig({
		apiKey,
		deviceCount,
		dataDir,
		logger: configLogger,
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
				messagesPrefix,
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
				logger: deviceLogger(deviceShortId),
			})
			deviceConnections.set(deviceShortId, {
				deviceId: deviceId,
				...d,
			})
		})

	Object.entries(config).forEach(([deviceShortId, deviceConfig]) => {
		deviceLogger(deviceShortId).info(
			`Connecting device: ${deviceConfig.deviceId}`,
		)
		connectDevice({
			...deviceConfig,
			deviceShortId,
		}).catch(err => {
			deviceLogger(deviceShortId).error(err.message)
		})
	})

	// Start UI server
	const uiServer = await UIServer({
		apiKey,
		httpPort: parseInt(httpPort, 10),
		deviceConnections,
		dataDir,
		maintainerEmail: adminEmail,
		logger: webserverLogger,
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
				udpLogger.error(maybePacket.left.message)
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
			deviceLogger(deviceShortId).debug(
				`> ${topic}: ${JSON.stringify(message)}`,
			)
		}
	}

	const processNetworkInfo = (
		c: DeviceConnection,
		networkInfo: NetworkInfo,
		ts?: Date,
	) => {
		const cellQuery = {
			mccmnc: parseInt(networkInfo.mccmnc, 10),
			areaCode: networkInfo.areaCode,
			cellID: networkInfo.cellID,
		}
		pipe(
			bifravstCellgeolocationResolver(cellQuery),
			orElse(() => unwiredLabsCellgeolocationResolver(cellQuery)),
			map(cellGeolocation => {
				cellGeoLogger.debug(
					`located cell ${JSON.stringify(cellQuery)} at ${JSON.stringify(
						cellGeolocation,
					)}`,
				)
				uiServer.updateDeviceCellGeoLocation(c, cellGeolocation, ts)
			}),
			mapLeft(error => {
				cellGeoLogger.error(error.message)
			}),
		)()
	}

	UDPServer({
		port,
		logger: udpLogger,
		onMessage: async ({ deviceShortId, message }) => {
			let c = deviceConnections.get(deviceShortId)
			if (!c) {
				udpLogger.info(`Device ${deviceShortId} not registered!`)
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
					udpLogger.error(
						`Failed to update shadow for device ${deviceShortId}: ${err.message}!`,
					)
				})
				if (message.state?.reported?.device?.networkInfo) {
					processNetworkInfo(c, message.state?.reported?.device?.networkInfo)
					uiServer.updateDeviceNetworkInfo(
						c,
						message?.state?.reported?.device?.networkInfo,
					)
				}
				if (message?.state?.reported?.device?.deviceInfo?.imei) {
					uiServer.updateDeviceIMEI(
						c,
						message?.state?.reported?.device?.deviceInfo?.imei,
					)
				}
			} else if ('geo' in message) {
				deviceLogger(deviceShortId).debug(JSON.stringify(message))
				const packet: GGAPacket = {
					sentenceId: 'GGA',
					time: new Date(),
					latitude: parseFloat(message.geo[0]),
					longitude: parseFloat(message.geo[1]),
					fixType: 'manual',
					satellitesInView: 0,
					horizontalDilution: 0,
					altitudeMeters: 0,
					geoidalSeperation: 0,
				}
				uiServer.updateDeviceGeoLocation(c, packet)
				c.sendMessage({
					appId: 'GPS',
					data: encodeNmeaPacket(packet),
					messageType: 'DATA',
				})
			} else {
				sendUpdate(deviceShortId, c, message as DeviceAppMessage)
			}
		},
	})

	// Fetch historical device data
	deviceConnections.forEach(async (connection, deviceShortId) => {
		historyLogger.debug(
			`Fetching history for device #${deviceShortId}: ${connection.deviceId}`,
		)
		// Messages
		fetchMessages(connection.deviceId)
			.then(hist =>
				hist.forEach((v, k) => {
					historyLogger.debug(deviceShortId, connection.deviceId, k, v)
					sendUpdate(deviceShortId, connection, {
						appId: k,
						data: v,
					})
				}),
			)
			.catch(err => {
				historyLogger.error(
					`Failed to fetch messages for device #${deviceShortId}: ${connection.deviceId}! ${err.message}`,
				)
			})
		// State
		fetchDeviceInfo(connection.deviceId)
			.then(device => {
				const networkInfo =
					device?.state?.reported?.device?.networkInfo ?? undefined
				if (networkInfo) {
					historyLogger.debug(
						`networkInfo #${deviceShortId}: ${
							connection.deviceId
						}: ${JSON.stringify(networkInfo)}`,
					)
					processNetworkInfo(
						connection,
						networkInfo,
						new Date(
							device?.state?.metadata?.reported?.device?.networkInfo?.cellID
								?.timestamp * 1000,
						),
					)
					uiServer.updateDeviceNetworkInfo(connection, networkInfo)
				}
				if (device?.state?.reported?.device?.deviceInfo?.imei) {
					historyLogger.debug(
						`IMEI #${deviceShortId}: ${connection.deviceId}: ${device?.state?.reported?.device?.deviceInfo?.imei}`,
					)
					uiServer.updateDeviceIMEI(
						connection,
						device?.state?.reported?.device?.deviceInfo?.imei,
					)
				}
			})
			.catch(err => {
				historyLogger.error(
					`Failed to fetch state for device #${deviceShortId}: ${
						connection.deviceId
					}: ${JSON.stringify(err.message)}`,
				)
			})
	})
}

proxy().catch(err => {
	console.error(err.message)
	process.exit(1)
})
