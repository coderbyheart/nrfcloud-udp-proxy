import React, { createRef, useState, useEffect } from 'react'
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

import MapIcon from '../marker.svg'

type Device = {
	deviceId: string
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

const airQualityColors = {
	A: '#00e400',
	B: '#92d050',
	C: '#ffff00',
	D: '#ff7e00',
	E: '#ff0000',
	F: '#99004c',
	G: '#663300',
}

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
			span.airquality {
			}
			${Object.entries(airQualityColors).map(
				([k, c]) => `.airquality-${k} { 
					text-shadow: 1px 1px 2px ${c}, -1px 1px 2px ${c}, 1px -1px 2px ${c}, -1px -1px 2px ${c};
				 }`,
			)}
		}
		svg {
			width: 30px;
			margin-left: 45px;
		}
	}
	${colors.map((c, k) => `.thingy${k} { color: ${c}; }`)}
	
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

export const Map = ({ proxyEndpoint }: { proxyEndpoint: string }) => {
	let zoom = 13
	const userZoom = window.localStorage.getItem('map:zoom')
	if (userZoom) {
		zoom = parseInt(userZoom, 10)
	}
	const mapRef = createRef<LeafletMap>()
	const [devices, updateDevices] = useState<Device[]>([])
	useEffect(() => {
		fetch(`${proxyEndpoint}/devices`)
			.then(res => res.json())
			.then(devices => {
				updateDevices(devices)
			})
	}, [proxyEndpoint])

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
				updateDevices(devices => [
					...devices.filter(d => update.deviceId !== d.deviceId),
					{
						...(devices.find(d => update.deviceId === d.deviceId) || {
							deviceId: update.deviceId,
							name: update.deviceId,
						}),
						...update,
					},
				])
			}
			if ('update' in update) {
				const { appId, data } = update.update
				if (appId === 'TEMP') {
					updateDevices(devices => {
						const d = devices.find(d => update.deviceId === d.deviceId)
						if (!d) {
							return devices
						}
						return [
							...devices.filter(d => update.deviceId !== d.deviceId),
							{
								...d,
								temp: parseFloat(data),
							},
						]
					})
				} else if (appId === 'AIR_QUAL') {
					updateDevices(devices => {
						const d = devices.find(d => update.deviceId === d.deviceId)
						if (!d) {
							return devices
						}
						return [
							...devices.filter(d => update.deviceId !== d.deviceId),
							{
								...d,
								airQuality: parseFloat(data),
							},
						]
					})
				}
			}
		}
	}, [proxyEndpoint])

	const center = (c => (c ? JSON.parse(c) : [63.4210966, 10.4378928]))(
		window.localStorage.getItem('map:center'),
	)

	return (
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
					{ cellGeolocation, geolocation, name, deviceId, temp, airQuality },
					k,
				) => {
					if (!geolocation && !cellGeolocation) return null
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
										color={colors[k]}
									/>
								)}
							<Marker
								icon={L.divIcon({
									className: `thingyIcon thingy${k}`,
									iconSize: [120, 85],
									iconAnchor: [90, 85],
									popupAnchor: [-30, -40],
									html: `<div class="label">
									${temp ? `<span class="temp">${temp}°C</span>` : ''}
									${
										airQuality
											? `<span class="airquality airquality-${
													describeAirQuality(airQuality).rating
											  }">${describeAirQuality(airQuality).description}</span>`
											: ''
									}
									</div>
									${MapIcon}`,
								})}
								position={markerPos}
							>
								<Popup>
									Device:{' '}
									<a
										href={`https://nrfcloud.com/#/devices/${deviceId}`}
										target="_blank"
										rel="noopener nofollow"
									>
										{name}
									</a>
									<br />
									{temp && (
										<>
											Temperature: {temp}°C
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
	)
}
