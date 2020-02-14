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

const CustomIconStyle = createGlobalStyle`
	.thingyIcon {
		span {
			width: 100%;
			text-align: center;
			color: #000000fa;
			display: block;
			height: 20px;
			overflow: hidden;
			white-space:nowrap;
			text-shadow: 1px 1px 1px #fff, -1px 1px 1px #fff, 1px -1px 1px #fff, -1px -1px 1px #fff;
			display: flex;
    		align-items: flex-end;
			justify-content: center;
		}
		svg {
			width: 30px;
			margin-left: 15px;
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
				}
			}
		}
	}, [proxyEndpoint])

	return (
		<LeafletMap
			// center={[63.4210966, 10.4378928]}
			center={[61.366447, 5.398771]}
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
		>
			<CustomIconStyle />
			<TileLayer
				attribution='&amp;copy <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
				url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
			/>
			{devices.map(
				({ cellGeolocation, geolocation, name, deviceId, temp }, k) => {
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
							{cellGeolocation && (
								<Circle
									center={cellGeolocation}
									radius={cellGeolocation.accuracy}
									color={colors[k]}
								/>
							)}
							<Marker
								icon={L.divIcon({
									className: `thingyIcon thingy${k}`,
									iconSize: [60, 65],
									iconAnchor: [30, 65],
									popupAnchor: [0, -55],
									html: `<span>${temp ? `${temp}°C` : ''}</span>${MapIcon}`,
								})}
								position={markerPos}
							>
								<Popup>
									<a
										href={`https://nrfcloud.com/#/devices/${deviceId}`}
										target="_blank"
										rel="noopener nofollow"
									>
										{name}
									</a>
								</Popup>
							</Marker>
						</React.Fragment>
					)
				},
			)}
		</LeafletMap>
	)
}
