import React, { useState, useEffect } from 'react'
import styled from 'styled-components'
import { Device } from './Map'

import Minimize from 'feather-icons/dist/icons/chevron-up.svg'
import Maximize from 'feather-icons/dist/icons/chevron-down.svg'
import Hidden from 'feather-icons/dist/icons/eye-off.svg'

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

const Item = styled.li`
	padding: 0;
	padding: 5px 10px;
	border-bottom: 1px solid #ccc;
	&:last-child {
		border-bottom: 0;
	}
	input {
		margin-right: 0.5rem;
	}
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

const ToggleButton = styled.button`
	border: 0;
	background-color: transparent;
	padding: 0;
	line-height: 1;
	margin-left: 1rem;
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
				<ToggleButton
					onClick={() => {
						window.localStorage.setItem(
							'deviceselector:minimized',
							!minimized ? '1' : '0',
						)
						setMinimized(!minimized)
					}}
				>
					{minimized ? <Maximize /> : <Minimize />}
				</ToggleButton>
			</Title>
			{!minimized &&
				devices.map((d, k) => (
					<Item key={k}>
						<label htmlFor={`input-${k}`}>
							<input
								id={`input-${k}`}
								type="checkbox"
								onChange={() => {
									toggleDevice(d.deviceId)
								}}
								checked={!(isHidden[d.deviceId] === true)}
							/>
							{d.name}
						</label>
					</Item>
				))}
		</List>
	)
}
