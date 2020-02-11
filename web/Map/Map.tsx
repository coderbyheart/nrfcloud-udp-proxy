import React, { createRef, useState, useEffect } from 'react'
import { Map as LeafletMap, TileLayer, Marker, Popup } from 'react-leaflet'
import * as L from 'leaflet'
import { createGlobalStyle } from 'styled-components'
import { GGAPacket } from 'nmea-simple'

import MapIcon from '../marker.svg'

type Device = {
	deviceId: string
	name: string
	geolocation?: GGAPacket
}

const CustomIconStyle = createGlobalStyle`
	.thingy0 {
		color: #03a8a0;
	}
	.thingy1 {
		color: #039c4b;
	}
	.thingy2 {
		color: #66d313;
	}
	.thingy3 {
		color: #fedf17;
	}
	.thingy4 {
		color: #ff0984;
	}
	.thingy5 {
		color: #21409a;
	}
	.thingy6 {
		color: #04adff;
	}
	.thingy7 {
		color: #e48873;
	}
	.thingy8 {
		color: #f16623;
	}
	.thingy9 {
		color: #f44546;
	}
`

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
		const connection = new WebSocket(proxyEndpoint.replace(/^https?/, 'ws'))
		connection.onopen = () => {
			console.debug('[ws]', 'open')
		}
		connection.onerror = error => {
			console.error('[ws]', error)
		}
		connection.onmessage = message => {
			console.debug('[ws]', 'message', message)
			const update = JSON.parse(message.data)
			if ('geolocation' in update) {
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
		}
	}, [proxyEndpoint])

	return (
		<LeafletMap
			center={[63.4210966, 10.4378928]}
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
			{devices
				.filter(({ geolocation }) => geolocation)
				.map(({ geolocation, name, deviceId }, k) => {
					const pos = {
						lat: (geolocation as GGAPacket).latitude,
						lng: (geolocation as GGAPacket).longitude,
					}
					return (
						<Marker
							icon={L.divIcon({
								className: `thingy${k}`,
								iconSize: [30, 30],
								iconAnchor: [15, 45],
								popupAnchor: [0, -35],
								html: MapIcon,
							})}
							position={pos}
							key={k}
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
					)
				})}
		</LeafletMap>
	)
}
