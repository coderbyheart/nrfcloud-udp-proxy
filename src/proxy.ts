import * as chalk from 'chalk'
import * as fs from 'fs'
import * as path from 'path'
import fetch from 'node-fetch'
import { v4 } from 'uuid'
import { device } from './device'
import { device as AwsIotDevice } from 'aws-iot-device-sdk'
import { server } from './udp-server'

const data = process.env.DATA_DIR || process.cwd()
const apiKey = process.env.API_KEY || ''
const port = process.env.PORT || '8888'

const proxy = async () => {
	let config: {
		deviceId: string
		ownershipCode: string
		caCert: string
		privateKey: string
		clientCert: string
		associated?: boolean
	}[]

	const configFile = path.join(data, 'config.json')
	try {
		config = JSON.parse(fs.readFileSync(configFile, 'utf-8').toString())
	} catch {
		console.log(chalk.yellow('No configuration found, creating...'))
		config = []
	}
	const writeConfig = () =>
		fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8')

	while (config.length < 3) {
		const deviceId = v4()
		const ownershipCode = v4()
		const res = await fetch(
			`https://api.nrfcloud.com/v1/devices/${deviceId}/certificates`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${apiKey}`,
				},
				body: `${ownershipCode}`,
			},
		)
		const { caCert, privateKey, clientCert } = await res.json()
		config.push({
			deviceId,
			ownershipCode,
			caCert,
			privateKey,
			clientCert,
		})
		console.log(chalk.green('New device created:'), chalk.cyan(deviceId))
		writeConfig()
	}

	// Connect
	const account = await fetch(`https://api.nrfcloud.com/v1/account`, {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${apiKey}`,
		},
	})
	const {
		mqttEndpoint,
		topics: { messagesPrefix },
	} = await account.json()
	console.log(chalk.yellow('Endpoint:'), chalk.blue(mqttEndpoint))

	const deviceConnections = [] as {
		connection: AwsIotDevice
		deviceId: string
	}[]

	config.forEach((deviceConfig, deviceShortId) => {
		const {
			deviceId,
			caCert,
			privateKey,
			clientCert,
			ownershipCode,
			associated,
		} = deviceConfig

		console.log(chalk.yellow('Connecting device ID:'), chalk.blue(deviceId))
		deviceConnections.push({
			deviceId,
			connection: device({
				deviceId,
				caCert,
				privateKey,
				clientCert,
				ownershipCode,
				associated: associated || false,
				mqttEndpoint,
				onAssociated: () => {
					deviceConnections[0]?.connection.publish(
						`${messagesPrefix}d/${deviceId}/d2c`,
						JSON.stringify({
							appId: 'DEVICE',
							messageType: 'DATA',
							data: `Hello from the proxy! I am device ${deviceShortId}.`,
						}),
					)
					config[deviceShortId].associated = true
					writeConfig()
				},
				apiKey,
				log: (...args) =>
					console.log(
						chalk.bgCyan(` ${deviceShortId} `),
						chalk.cyan(deviceId),
						...args,
					),
			}),
		})
	})

	server({
		port: parseInt(port, 10),
		log: (...args) => console.log(chalk.magenta('UDP Server'), ...args),
		onMessage: ({ deviceShortId, appId, data }) => {
			const c = deviceConnections[deviceShortId]
			if (!c) {
				console.error(
					chalk.magenta('UDP Server'),
					chalk.red(`Device ${deviceShortId} not registered!`),
				)
				return
			}
			const topic = `${messagesPrefix}d/${c.deviceId}/d2c`
			const message = JSON.stringify({
				appId,
				messageType: 'DATA',
				data,
			})
			console.log(
				chalk.bgCyan(` ${deviceShortId} `),
				chalk.blue('>'),
				chalk.green(message),
			)
			c.connection.publish(topic, message)
		},
	})
}

proxy().catch(err => {
	console.error(err.message)
	process.exit(1)
})
