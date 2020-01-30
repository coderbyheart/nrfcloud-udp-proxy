import * as program from 'commander'
import * as chalk from 'chalk'
import * as fs from 'fs'
import * as path from 'path'
import fetch from 'node-fetch'
import { v4 } from 'uuid'
import { thingShadow } from 'aws-iot-device-sdk'

let ran = false

program
	.arguments('<apiKey>')
	.action(async (apiKey: string) => {
		ran = true

		let config
		try {
			config = JSON.parse(
				fs
					.readFileSync(path.join(process.cwd(), 'config.json'), 'utf-8')
					.toString(),
			)
		} catch {
			console.log(chalk.yellow('No configuration found, creating new device.'))
			const deviceId = v4()
			const ownershipCode = v4()
			console.log(chalk.yellow('Device ID:'), chalk.blue(deviceId))
			const res = await fetch(
				`https://api.nrfcloud.com/v1/devices/${deviceId}/certificates`,
				{
					method: 'POST',
					headers: {
						Authorization: `Bearer ${apiKey}`,
					},
					body: ownershipCode,
				},
			)
			const { caCert, privateKey, clientCert } = await res.json()
			config = {
				deviceId,
				ownershipCode,
				caCert,
				privateKey,
				clientCert,
			}

			// Connect
			const account = await fetch(`https://api.nrfcloud.com/v1/account`, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${apiKey}`,
				},
			})
			const { mqttEndpoint } = await account.json()
			console.log(chalk.yellow('Endpoint:'), chalk.blue(mqttEndpoint))
			console.log(config)
			console.time(chalk.green(chalk.inverse(' connected ')))

			const note = chalk.magenta(
				`Still connecting ... First connect takes around 30 seconds`,
			)
			console.time(note)
			const connectingNote = setInterval(() => {
				console.timeLog(note)
			}, 5000)

			const connection = new thingShadow({
				privateKey: Buffer.from(privateKey),
				clientCert: Buffer.from(clientCert),
				caCert: Buffer.from(caCert),
				clientId: deviceId,
				host: mqttEndpoint,
				region: mqttEndpoint.split('.')[2],
				debug: true,
			})

			connection.on('connect', async () => {
				console.timeEnd(chalk.green(chalk.inverse(' connected ')))
				clearInterval(connectingNote)

				connection.register(deviceId, {}, async () => {
					const serviceInfo = {
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
					}
					console.log(
						chalk.magenta('>'),
						chalk.cyan(
							JSON.stringify({ state: { reported: { serviceInfo } } }),
						),
					)
					connection.update(deviceId, { state: { reported: { serviceInfo } } })
				})

				connection.on('close', () => {
					console.error(chalk.red(chalk.inverse(' disconnected! ')))
				})

				connection.on('reconnect', () => {
					console.log(chalk.magenta('reconnecting...'))
				})

				connection.on('status', (_, stat, __, stateObject) => {
					console.log(chalk.magenta('>'), chalk.cyan(stat))
					console.log(
						chalk.magenta('>'),
						chalk.cyan(JSON.stringify(stateObject)),
					)
				})

				connection.on('delta', (_, stateObject) => {
					console.log(
						chalk.magenta('<'),
						chalk.cyan(JSON.stringify(stateObject)),
					)
				})

				connection.on('timeout', (thingName, clientToken) => {
					console.log(
						'received timeout on ' + thingName + ' with token: ' + clientToken,
					)
				})
			})
		}
	})
	.parse(process.argv)

if (!ran) {
	program.outputHelp(chalk.red)
	process.exit(1)
}
