import * as fs from 'fs'
import * as path from 'path'
import * as http from 'http'
import { fetchDevices } from '../nrfcloud'
import { pipe } from 'fp-ts/lib/pipeable'
import { DeviceConnection } from '../proxy'
import * as TE from 'fp-ts/lib/TaskEither'
import { Packet } from 'nmea-simple'

type DeviceGeoLocations = {
	[key: string]: Packet
}

export const handler = ({
	apiKey,
	deviceConnections,
	deviceGeolocations,
}: {
	apiKey: string
	deviceConnections: DeviceConnection[]
	deviceGeolocations: DeviceGeoLocations
}): http.RequestListener => async (request, response) => {
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
}
