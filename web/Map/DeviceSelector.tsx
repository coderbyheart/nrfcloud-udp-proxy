import React, { useState, useEffect } from 'react'
import styled from 'styled-components'
import { Device, byIMEI } from './Map'

import Minimize from 'feather-icons/dist/icons/x.svg'
import Maximize from 'feather-icons/dist/icons/chevron-down.svg'
import Hidden from 'feather-icons/dist/icons/eye-off.svg'
import Open from 'feather-icons/dist/icons/external-link.svg'
import MapIcon from '../marker.svg'

const List = styled.ul`
	position: absolute;
	top: 10px;
	right: 10px;
	box-shadow: 0 1px 5px rgba(0, 0, 0, 0.65);
	border-radius: 4px;
	background-color: #fff;
	z-index: 1000;
	font-family: 'Red Hat Display', sans-serif;
	list-style: none;
	margin: 5px;
	padding: 0;
`

const StyledMapIcon = styled(MapIcon)`
	margin-right: 0.5rem;
`

const DisabledMapIcon = styled(StyledMapIcon)`
	filter: grayscale(1);
	opacity: 0.25;
`

const Label = styled.label`
	display: flex;
	align-items: center;
`

const Item = styled.li`
	padding: 0;
	padding: 5px 10px;
	border-bottom: 1px solid #ccc;
	&:last-child {
		border-bottom: 0;
	}
	display: flex;
	align-items: center;
	justify-content: space-between;
`

const Title = styled(Item)`
	font-weight: 700;
	display: flex;
	align-items: center;
	justify-content: space-between;
`

const Text = styled.span`
	display: flex;
	align-items: center;
`

const Button = styled.button`
	border: 0;
	background-color: transparent;
	padding: 0;
	line-height: 1;
	margin-left: 1rem;
`

const A = styled.a`
	margin-left: 1rem;
	color: #000000;
	opacity: 0.5;
`

const HiddenCounter = styled.span`
	opacity: 0.5;
	display: flex;
	align-items: center;
	margin-left: 1rem;
	svg {
		margin-right: 0.5rem;
	}
`

const IMEI = styled.span`
	code:first-child {
		opacity: 0.5;
	}
	code:last-child {
		font-weight: bold;
	}
`

const formatIMEI = (tailLen: number) => (imei: string) => {
	const start = imei.substr(0, tailLen + 1)
	const end = imei.substr(-tailLen)
	return (
		<IMEI>
			<code>{start}</code>
			<code>{end}</code>
		</IMEI>
	)
}

export type DeviceHiddenMap = { [key: string]: boolean }

export const DeviceSelector = ({
	devices,
	onUpdate,
}: {
	devices: Device[]
	onUpdate: (map: DeviceHiddenMap) => void
}) => {
	const [minimized, setMinimized] = useState<boolean>(
		window.localStorage.getItem('deviceselector:minimized') === '1',
	)
	const stored = window.localStorage.getItem('deviceselector:devicesHidden')
	const [isHidden, setIsHidden] = useState<DeviceHiddenMap>(
		stored ? JSON.parse(stored) : {},
	)

	useEffect(() => {
		onUpdate(isHidden)
	}, [])

	const toggleDevice = (deviceId: string) => {
		setIsHidden(value => {
			const d = {
				...value,
				[deviceId]: !value[deviceId],
			}
			window.localStorage.setItem(
				'deviceselector:devicesHidden',
				JSON.stringify(d),
			)
			onUpdate(d)
			return d
		})
	}

	if (!devices.length) return null

	const numHidden = Object.entries(isHidden).filter(([_, h]) => h === true)
		.length

	return (
		<List>
			<Title>
				<Text>
					Devices
					{numHidden > 0 && (
						<HiddenCounter>
							<Hidden /> {numHidden}
						</HiddenCounter>
					)}
				</Text>
				<Button
					onClick={() => {
						window.localStorage.setItem(
							'deviceselector:minimized',
							!minimized ? '1' : '0',
						)
						setMinimized(!minimized)
					}}
				>
					{minimized ? <Maximize /> : <Minimize />}
				</Button>
			</Title>
			{!minimized &&
				[...devices].sort(byIMEI).map((d, k) => (
					<Item key={k}>
						<Label
							htmlFor={`input-${k}`}
							onClick={() => {
								toggleDevice(d.deviceId)
							}}
						>
							{isHidden[d.deviceId] === true ? (
								<DisabledMapIcon />
							) : (
								<StyledMapIcon
									style={{
										color: d.color,
									}}
								/>
							)}

							{d.imei && (
								<>
									IMEI: {formatIMEI(7)(d.imei)} <small>({d.name})</small>
								</>
							)}
							{!d.imei && d.name}
						</Label>
						<A
							href={`https://nrfcloud.com/#/devices/${d.deviceId}`}
							title={`Open ${d.name} on nRF Connect for Cloud`}
							target="_blank"
							rel="noopener nofollow"
						>
							<Open />
						</A>
					</Item>
				))}
			{!minimized && (
				<Item>
					<small>
						Click a device identifier to toggle its visibility on the map.
					</small>
				</Item>
			)}
		</List>
	)
}
