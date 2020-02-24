import React, { createRef, useState, useEffect } from 'react'
import { renderToString } from 'react-dom/server'
import {
	Map as LeafletMap,
	TileLayer,
	Marker,
	Popup,
	Circle,
} from 'react-leaflet'
import * as L from 'leaflet'
import { createGlobalStyle } from 'styled-components'
import { GGAPacket } from 'nmea-simple'
import { RSRP, RSRPBar, dbmToRSRP } from '@bifravst/rsrp-bar/dist/index'
import styled from 'styled-components'
import { formatDistanceToNow } from 'date-fns'
import { DeviceSelector, DeviceHiddenMap } from './DeviceSelector'

import MapIcon from '../marker.svg'

export type Device = {
	deviceId: string
	color: string
	name: string
	geolocation?: GGAPacket
	cellGeolocation?: {
		lat: number
		lng: number
		accuracy: number
		ts: string
	}
	temp?: number
	airQuality?: number
	humidity?: number
	pressure?: number
	rsrpDbm?: number
	imei?: string
}

const colors = [
	'#03a8a0',
	'#039c4b',
	'#66d313',
	'#fedf17',
	'#ff0984',
	'#21409a',
	'#04adff',
	'#e48873',
	'#f16623',
	'#f44546',
]

const colorGenerator = (function*() {
	let i = 0
	while (true) {
		yield colors[i]
		i = (i + 1) % colors.length
	}
})()

const airQualityColors = {
	A: '#00e400',
	B: '#92d050',
	C: '#ffff00',
	D: '#ff7e00',
	E: '#ff0000',
	F: '#99004c',
	G: '#663300',
}

const StyledRSRPBar = styled(RSRPBar)`
	width: 30px;
	height: 30px;
	color: #e826e1;
`

const StyledMapIcon = styled(MapIcon)`
	width: 30px;
	height: 45px;
	margin-left: 45px;
`

const CustomIconStyle = createGlobalStyle`
	.thingyIcon {
		div.label {
			width: 100%;
			text-align: center;
			color: #000000fa;
			font-weight: bold;
			display: block;
			height: 40px;
			overflow: hidden;
			white-space:nowrap;
			display: flex;
    		align-items: center;
    		flex-direction: column;
			justify-content: flex-end;
			span.temp {
				text-shadow: 1px 1px 1px #fff, -1px 1px 1px #fff, 1px -1px 1px #fff, -1px -1px 1px #fff;
			}
			${Object.entries(airQualityColors).map(
				([k, c]) => `.airquality-${k} { 
					text-shadow: 1px 1px 2px ${c}, -1px 1px 2px ${c}, 1px -1px 2px ${c}, -1px -1px 2px ${c};
				 }`,
			)}
		}
	}
`

const debugWs = (...args: any[]) =>
	console.debug(
		'%c WebSocket ',
		'background-color: #d4de2f; color: #333333; padding: 0.25rem;',
		...args,
	)

const errorWs = (...args: any[]) =>
	console.error(
		'%c WebSocket ',
		'background-color: #de402f; color: #ffffff; padding: 0.25rem;',
		...args,
	)

/**
 * @see https://ae-bst.resource.bosch.com/media/_tech/media/datasheets/BST-BME680-DS001.pdf
 */
const describeAirQuality = (
	airQuality: number,
): { rating: string; description: string } => {
	if (airQuality > 351)
		return {
			description: 'Extremely polluted',
			rating: 'G',
		}
	if (airQuality > 250) return { description: 'Severely polluted', rating: 'F' }
	if (airQuality > 200) return { description: 'Heavily polluted', rating: 'E' }
	if (airQuality > 150)
		return { description: 'Moderately polluted', rating: 'D' }
	if (airQuality > 100) return { description: 'Lightly polluted', rating: 'C' }
	if (airQuality > 50) return { description: 'Good', rating: 'B' }
	return { description: 'Excellent', rating: 'A' }
}

export const byIMEI = (
	{ deviceId: ad, imei: ai }: Device,
	{ deviceId: bd, imei: bi }: Device,
) => (ai || ad).localeCompare(bi || bd)

export const Map = ({ proxyEndpoint }: { proxyEndpoint: string }) => {
	let zoom = 13
	const userZoom = window.localStorage.getItem('map:zoom')
	if (userZoom) {
		zoom = parseInt(userZoom, 10)
	}
	const mapRef = createRef<LeafletMap>()
	const [devices, updateDevices] = useState<Device[]>([])
	const [devicesHidden, setDevicesHidden] = useState<DeviceHiddenMap>({})
	useEffect(() => {
		fetch(`${proxyEndpoint}/devices`)
			.then(res => res.json())
			.then(devices => {
				updateDevices(
					devices.map((device: any) => ({
						...device,
						color: colorGenerator.next().value,
					})),
				)
			})
	}, [proxyEndpoint])

	const updateDeviceProperty = (deviceId: string, update: object) =>
		updateDevices(devices => {
			const d = devices.find(d => deviceId === d.deviceId)
			if (!d) {
				return devices
			}
			return [
				...devices.filter(d => deviceId !== d.deviceId),
				{
					...d,
					...update,
				},
			].sort(byIMEI)
		})

	useEffect(() => {
		const connection = new WebSocket(proxyEndpoint.replace(/^http/, 'ws'))
		connection.onopen = () => {
			debugWs('open')
		}
		connection.onerror = error => {
			errorWs(error)
		}
		connection.onmessage = message => {
			const update = JSON.parse(message.data)
			debugWs(update)
			if ('geolocation' in update || 'cellGeolocation' in update) {
				updateDevices(devices =>
					[
						...devices.filter(d => update.deviceId !== d.deviceId),
						{
							...(devices.find(d => update.deviceId === d.deviceId) || {
								deviceId: update.deviceId,
								name: update.deviceId,
								color: colorGenerator.next().value,
							}),
							...update,
						},
					].sort(byIMEI),
				)
			}

			if ('update' in update) {
				updateDeviceProperty(update.deviceId, update.update)
			}
		}
	}, [proxyEndpoint])

	const center = (c => (c ? JSON.parse(c) : [63.4210966, 10.4378928]))(
		window.localStorage.getItem('map:center'),
	)

	return (
		<>
			<LeafletMap
				center={center}
				zoom={zoom}
				ref={mapRef}
				onzoomend={() => {
					if (
						mapRef.current &&
						mapRef.current.viewport &&
						mapRef.current.viewport.zoom
					) {
						window.localStorage.setItem(
							'map:zoom',
							`${mapRef.current.viewport.zoom}`,
						)
					}
				}}
				ondragend={() => {
					if (
						mapRef.current &&
						mapRef.current.viewport &&
						mapRef.current.viewport.center
					) {
						window.localStorage.setItem(
							'map:center',
							JSON.stringify(mapRef.current.viewport.center),
						)
					}
				}}
			>
				<CustomIconStyle />
				<TileLayer
					attribution='&amp;copy <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
					url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
				/>
				{devices.map(
					(
						{
							cellGeolocation,
							geolocation,
							name,
							deviceId,
							temp,
							airQuality,
							humidity,
							pressure,
							rsrpDbm,
							color,
						},
						k,
					) => {
						if (!geolocation && !cellGeolocation) return null
						if (devicesHidden[deviceId] === true) return null
						const geolocationTime = geolocation?.time
							? new Date(geolocation.time).getTime()
							: 0
						const cellGeolocationTime = cellGeolocation?.ts
							? new Date(cellGeolocation.ts).getTime()
							: 0

						let markerPos = (geolocation
							? { lat: geolocation.latitude, lng: geolocation.longitude }
							: cellGeolocation) as { lat: number; lng: number }

						if (cellGeolocation && cellGeolocationTime > geolocationTime) {
							markerPos = cellGeolocation
						}

						return (
							<React.Fragment key={k}>
								{cellGeolocation &&
									(!geolocation || cellGeolocationTime > geolocationTime) && (
										<Circle
											center={cellGeolocation}
											radius={cellGeolocation.accuracy}
											color={color}
										/>
									)}
								<Marker
									icon={L.divIcon({
										className: `thingyIcon`,
										iconSize: [120, 85],
										iconAnchor: [60, 85],
										popupAnchor: [0, -40],
										html: renderToString(
											<>
												<div className="label">
													{temp && <span className="temp">{temp}°C</span>}
													{airQuality && (
														<span
															className={`airquality airquality-${
																describeAirQuality(airQuality).rating
															}`}
														>
															{describeAirQuality(airQuality).description}
														</span>
													)}
												</div>
												<StyledMapIcon style={{ color }} />
												{rsrpDbm && (
													<RSRP
														rsrp={dbmToRSRP(rsrpDbm)}
														renderBar={({ quality }) =>
															quality === 0 ? (
																<StyledRSRPBar quality={0} />
															) : (
																<StyledRSRPBar quality={quality} />
															)
														}
														renderInvalid={() => <span>❎</span>}
													/>
												)}
											</>,
										),
									})}
									position={markerPos}
								>
									<Popup>
										Device:{' '}
										<a
											href={`https://nrfcloud.com/#/devices/${deviceId}`}
											target="_blank"
											rel="noopener nofollow"
											title={`Open ${name} on nRF Connect for Cloud`}
										>
											{name}
										</a>
										<br />
										Position last updated:{' '}
										{formatDistanceToNow(
											geolocationTime > cellGeolocationTime
												? geolocationTime
												: cellGeolocationTime,
										)}{' '}
										ago
										<br />
										{rsrpDbm && (
											<>
												RSRP: {rsrpDbm}dbm
												<br />
											</>
										)}
										{temp && (
											<>
												Temperature: {temp}°C
												<br />
											</>
										)}
										{humidity && (
											<>
												Humidity: {humidity}%
												<br />
											</>
										)}
										{pressure && (
											<>
												Pressure: {pressure}hPa
												<br />
											</>
										)}
										{airQuality && (
											<>
												<a
													href="https://blog.nordicsemi.com/getconnected/bosch-sensortec-bme680-the-nose-of-nordics-thingy91"
													target="_blank"
													rel="noopener nofollow"
												>
													Air Quality
												</a>
												: {describeAirQuality(airQuality).description} (
												{airQuality})
												<br />
											</>
										)}
									</Popup>
								</Marker>
							</React.Fragment>
						)
					},
				)}
			</LeafletMap>
			<DeviceSelector devices={devices} onUpdate={setDevicesHidden} />
		</>
	)
}
