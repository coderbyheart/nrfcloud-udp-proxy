import * as chalk from 'chalk'
import * as fs from 'fs'
import * as path from 'path'
import * as http from 'http'
import { fetchDevices } from './nrfcloud'
import { pipe } from 'fp-ts/lib/pipeable'
import { DeviceConnection } from './proxy'
import {
	server as WebSocketServer,
	connection as WSConnection,
} from 'websocket'
import * as TE from 'fp-ts/lib/TaskEither'
import { Packet } from 'nmea-simple'

type DeviceGeoLocations = {
	[key: string]: Packet
}

export const UIServer = ({
	apiKey,
	httpPort,
	deviceConnections,
}: {
	apiKey: string
	httpPort: number | string
	deviceConnections: DeviceConnection[]
}) => {
	const deviceGeolocations: DeviceGeoLocations = {}

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
					fetchDevices({ apiKey }),
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

	const wsConnections: WSConnection[] = []

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

	const updateClients = (update: object) => {
		wsConnections.forEach(wsConnection => {
			wsConnection.send(JSON.stringify(update))
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
	}
}
