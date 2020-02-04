import * as chalk from 'chalk'
import { device as AwsIotDevice } from 'aws-iot-device-sdk'

import fetch from 'node-fetch'

export const device = ({
	deviceId,
	caCert,
	privateKey,
	clientCert,
	ownershipCode,
	associated,
	mqttEndpoint,
	onAssociated,
	apiKey,
	log,
}: {
	deviceId: string
	caCert: string
	privateKey: string
	clientCert: string
	ownershipCode: string
	associated: boolean
	mqttEndpoint: string
	apiKey: string
	onAssociated: () => void
	log: (...args: any[]) => void
}) => {
	const connection = new AwsIotDevice({
		privateKey: Buffer.from(privateKey),
		clientCert: Buffer.from(clientCert),
		caCert: Buffer.from(caCert),
		clientId: deviceId,
		host: mqttEndpoint,
		region: mqttEndpoint.split('.')[2],
	})

	connection.on('connect', async () => {
		log(chalk.green(chalk.inverse(' connected ')))
		// Associate it
		if (!associated) {
			await fetch(`https://api.nrfcloud.com/v1/association/${deviceId}`, {
				method: 'PUT',
				headers: {
					Authorization: `Bearer ${apiKey}`,
				},
				body: ownershipCode,
			})
			log(chalk.green('Device associated to tenant.'))
			onAssociated()
		}
		connection.publish(
			`$aws/things/${deviceId}/shadow/update`,
			JSON.stringify({
				state: {
					reported: {
						device: {
							serviceInfo: {
								ui: [
									'GPS',
									'FLIP',
									'GEN',
									'TEMP',
									'HUMID',
									'AIR_PRESS',
									'RSRP',
									'BUTTON',
									'DEVICE',
								],
							},
						},
					},
				},
			}),
			undefined,
			err => {
				if (!err) {
					log(chalk.green('All UI services enabled.'))
				} else {
					log(chalk.red(err.message))
				}
			},
		)
	})

	connection.on('close', () => {
		log(chalk.red(chalk.inverse(' disconnected! ')))
	})

	connection.on('reconnect', () => {
		log(chalk.magenta('reconnecting...'))
	})

	connection.on('error', () => {
		log(chalk.red(' ERROR '))
	})

	return connection
}
