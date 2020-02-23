import * as chalk from 'chalk'
import { DeviceConnection, DeviceAppMessage } from '../proxy'
import {
	server as WebSocketServer,
	connection as WSConnection,
} from 'websocket'
import { Packet } from 'nmea-simple'
import { handler } from './handler'
import { createHTTPSUiServer } from './https'
import { createHTTPUiServer } from './http'
import { Location } from '../unwiredlabs'
import { withts } from '../logts'

export type DeviceGeolocations = Map<string, Packet>

export type DeviceCellGeolocations = Map<
	string,
	Location & {
		ts: string
	}
>

const transformUpdate = {
	TEMP: (data: any) => ({ temp: parseFloat(data) }),
	AIR_QUAL: (data: any) => ({ airQuality: parseFloat(data) }),
	HUMID: (data: any) => ({ humidity: parseFloat(data) }),
	AIR_PRESS: (data: any) => ({ pressure: parseFloat(data) * 10 }),
	RSRP: (data: any) => ({ rsrpDbm: parseFloat(data) }),
} as { [key: string]: (v: any) => object }

const processUpdateUpdate = ({ appId, data }: { appId: string; data: any }) => {
	const t = transformUpdate[appId]
	return t ? t(data) : { appId, data }
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
	deviceConnections: Map<string, DeviceConnection>
	dataDir: string
	maintainerEmail: string
}) => {
	const deviceGeolocations: DeviceGeolocations = new Map()
	const deviceCellGeolocations: DeviceCellGeolocations = new Map()
	const deviceAppStates = new Map<string, { [key: string]: any }>()

	const h = handler({
		deviceGeolocations,
		deviceCellGeolocations,
		apiKey,
		deviceConnections,
		deviceAppStates,
	})

	const uiServer =
		httpPort === 443
			? await createHTTPSUiServer({
					handler: h,
					maintainerEmail,
					dataDir,
					log: (...args: any[]) =>
						withts(console.log)(
							chalk.green(' HTTPS '),
							...args.map(chalk.grey),
						),
			  })
			: await createHTTPUiServer({ handler: h })

	const wsConnections: WSConnection[] = []

	uiServer.listen(httpPort, () => {
		withts(console.log)(
			chalk.yellowBright('WS Server'),
			chalk.cyan('is listening at'),
			chalk.blue(`0.0.0.0:${httpPort}`),
		)
		const wsServer = new WebSocketServer({
			httpServer: uiServer,
		})
		wsServer.on('request', request => {
			const connection = request.accept(undefined, request.origin)
			withts(console.log)(
				chalk.yellowBright('WS Server'),
				chalk.cyan(`${connection.remoteAddress} connected`),
			)

			wsConnections.push(connection)
			connection.on('close', () => {
				withts(console.log)(
					chalk.yellowBright('WS Server'),
					chalk.cyan(`${connection.remoteAddress} disconnected`),
				)
				wsConnections.splice(wsConnections.indexOf(connection))
			})
		})
	})

	const updateClients = (update: object) => {
		wsConnections.forEach(connection => {
			withts(console.log)(
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
			deviceGeolocations.set(device.deviceId, geolocation)
			updateClients({
				deviceId: device.deviceId,
				geolocation: geolocation,
			})
		},
		updateDeviceCellGeoLocation: (
			device: DeviceConnection,
			cellGeolocation: Location,
		) => {
			const cellGeoWithTs = {
				...cellGeolocation,
				ts: new Date().toISOString(),
			}
			deviceCellGeolocations.set(device.deviceId, cellGeoWithTs)
			updateClients({
				deviceId: device.deviceId,
				cellGeolocation: cellGeoWithTs,
			})
		},
		sendDeviceUpdate: (
			device: DeviceConnection,
			update: { update: DeviceAppMessage },
		) => {
			const apps = deviceAppStates.get(device.deviceId) || {}
			const p = processUpdateUpdate(update.update)
			deviceAppStates.set(device.deviceId, {
				...apps,
				...p,
			})
			updateClients({
				deviceId: device.deviceId,
				update: p,
			})
		},
	}
}
