import { device as AwsIotDevice } from 'aws-iot-device-sdk'
import { Logger } from 'winston'

import fetch from 'node-fetch'

export const device = ({
	deviceId,
	caCert,
	privateKey,
	clientCert,
	ownershipCode,
	associated,
	mqttEndpoint,
	messagesPrefix,
	onAssociated,
	apiKey,
	logger,
}: {
	deviceId: string
	caCert: string
	privateKey: string
	clientCert: string
	ownershipCode: string
	associated: boolean
	mqttEndpoint: string
	messagesPrefix: string
	apiKey: string
	onAssociated: () => void
	logger: Logger
}) => {
	const connection = new AwsIotDevice({
		privateKey: Buffer.from(privateKey),
		clientCert: Buffer.from(clientCert),
		caCert: Buffer.from(caCert),
		clientId: deviceId,
		host: mqttEndpoint,
		region: mqttEndpoint.split('.')[2],
	})

	const publish = (topic: string) => async (message: object): Promise<void> =>
		new Promise<void>((resolve, reject) => {
			connection.publish(topic, JSON.stringify(message), undefined, err => {
				if (err) {
					logger.error(err.message)
					return reject(err)
				}
				logger.debug(`> ${topic}: ${JSON.stringify(message)}`)
				resolve()
			})
		})

	const sendMessage = publish(`${messagesPrefix}d/${deviceId}/d2c`)
	const updateShadow = publish(`$aws/things/${deviceId}/shadow/update`)

	connection.on('connect', async () => {
		logger.info('connected')
		// Associate it
		if (!associated) {
			await fetch(`https://api.nrfcloud.com/v1/association/${deviceId}`, {
				method: 'PUT',
				headers: {
					Authorization: `Bearer ${apiKey}`,
				},
				body: ownershipCode,
			})
			logger.info('Device associated to tenant.')
			onAssociated()
		}
		connection.subscribe(`$aws/things/${deviceId}/shadow/update/rejected`)
		connection.subscribe(`$aws/things/${deviceId}/shadow/update/accepted`)
		await updateShadow({
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
		})
		logger.debug('All UI services enabled.')
	})

	connection.on('message', (topic, payload) => {
		logger.debug(`< ${topic}: ${payload.toString()}`)
	})

	connection.on('close', () => {
		logger.error('disconnected!')
	})

	connection.on('reconnect', () => {
		logger.info('reconnect...')
	})

	connection.on('error', () => {
		logger.error('ERROR!')
	})

	return {
		connection,
		updateShadow,
		sendMessage,
	}
}
