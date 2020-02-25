import * as fs from 'fs'
import * as path from 'path'
import * as http from 'http'
import { fetchDevices } from '../nrfcloud'
import { pipe } from 'fp-ts/lib/pipeable'
import { DeviceConnection, NetworkInfo } from '../proxy'
import * as TE from 'fp-ts/lib/TaskEither'
import { DeviceCellGeolocations, DeviceGeolocations } from './UIServer'

export const handler = ({
	apiKey,
	deviceConnections,
	deviceGeolocations,
	deviceCellGeolocations,
	deviceAppStates,
	deviceIMEIs,
	deviceNetworkInfo,
}: {
	apiKey: string
	deviceConnections: Map<string, DeviceConnection>
	deviceGeolocations: DeviceGeolocations
	deviceCellGeolocations: DeviceCellGeolocations
	deviceAppStates: Map<string, { [key: string]: any }>
	deviceIMEIs: Map<string, string>
	deviceNetworkInfo: Map<string, NetworkInfo>
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

	const returnFile = ({ folder }: { folder: string }) => async ({
		response,
		file,
		type,
	}: {
		file: string
		response: http.ServerResponse
		type: string
	}) =>
		fs.promises
			.readFile(path.join(folder, file), 'utf-8')
			.then(data => {
				response.writeHead(200, {
					'Content-Type': type,
				})
				response.end(data.toString())
			})
			.catch(() => {
				response.statusCode = 500
				response.end()
			})

	const returnWebFile = returnFile({ folder: path.join(process.cwd(), 'web') })
	const returnDistFile = returnFile({
		folder: path.join(process.cwd(), 'dist'),
	})

	switch (request.url) {
		case '/':
			await returnWebFile({
				response,
				file: 'index.html',
				type: 'text/html',
			})
			break
		case '/main.js':
			await returnDistFile({
				response,
				file: 'main.js',
				type: 'text/javascript',
			})
			break
		case '/devices':
			await pipe(
				fetchDevices({ apiKey }),
				TE.map(devices => {
					const d = Array.from(
						deviceConnections.values(),
						({ deviceId }, k) => ({
							shortId: k,
							deviceId,
							geolocation: deviceGeolocations.get(deviceId),
							cellGeolocation: deviceCellGeolocations.get(deviceId),
							name: devices.find(({ id }) => id === deviceId)?.name || deviceId,
							...deviceAppStates.get(deviceId),
							imei: deviceIMEIs.get(deviceId),
							networkInfo: deviceNetworkInfo.get(deviceId),
						}),
					)
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
		case '/favicon.ico':
			await returnWebFile({
				response,
				file: 'favicon.ico',
				type: 'image/x-icon',
			})
			break
		default:
			response.statusCode = 404
			response.end()
	}
}
