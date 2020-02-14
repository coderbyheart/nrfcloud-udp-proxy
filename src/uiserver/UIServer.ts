import * as chalk from 'chalk'
import { DeviceConnection } from '../proxy'
import {
	server as WebSocketServer,
	connection as WSConnection,
} from 'websocket'
import { Packet } from 'nmea-simple'
import { handler } from './handler'
import { createHTTPSUiServer } from './https'
import { createHTTPUiServer } from './http'
import { Location } from '../unwiredlabs'

export type DeviceGeolocations = {
	[key: string]: Packet
}

export type DeviceCellGeolocations = {
	[key: string]: Location
}

export const UIServer = async ({
	apiKey,
	httpPort,
	deviceConnections,
	dataDir,
	maintainerEmail,
}: {
	apiKey: string
	httpPort: number
	deviceConnections: DeviceConnection[]
	dataDir: string
	maintainerEmail: string
}) => {
	const deviceGeolocations: DeviceGeolocations = {}
	const deviceCellGeolocations: DeviceCellGeolocations = {}

	const h = handler({
		deviceGeolocations,
		deviceCellGeolocations,
		apiKey,
		deviceConnections,
	})

	const uiServer =
		httpPort === 443
			? await createHTTPSUiServer({
					handler: h,
					maintainerEmail,
					dataDir,
					log: (...args: any[]) =>
						console.log(chalk.green(' HTTPS '), ...args.map(chalk.grey)),
			  })
			: await createHTTPUiServer({ handler: h })

	const wsConnections: WSConnection[] = []

	uiServer.listen(httpPort, () => {
		console.log(
			chalk.yellowBright('WS Server'),
			chalk.cyan('is listening at'),
			chalk.blue(`0.0.0.0:${httpPort}`),
		)
		const wsServer = new WebSocketServer({
			httpServer: uiServer,
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

	const updateClients = (update: object) => {
		wsConnections.forEach(connection => {
			console.log(
				chalk.yellowBright('WS Server'),
				chalk.blue('>'),
				chalk.cyan(connection.remoteAddress),
				chalk.yellow(JSON.stringify(update)),
			)
			connection.send(JSON.stringify(update))
		})
	}

	return {
		updateDeviceGeoLocation: (
			device: DeviceConnection,
			geolocation: Packet,
		) => {
			deviceGeolocations[device.deviceId] = geolocation
			updateClients({
				deviceId: device.deviceId,
				geolocation: geolocation,
			})
		},
		updateDeviceCellGeoLocation: (
			device: DeviceConnection,
			cellGeolocation: Location,
		) => {
			deviceCellGeolocations[device.deviceId] = cellGeolocation
			updateClients({
				deviceId: device.deviceId,
				cellGeolocation: {
					...cellGeolocation,
					ts: new Date().toISOString(),
				},
			})
		},
		sendDeviceUpdate: (device: DeviceConnection, update: any) => {
			updateClients({
				deviceId: device.deviceId,
				...update,
			})
		},
	}
}
