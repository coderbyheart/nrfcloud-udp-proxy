import * as program from 'commander'
import * as chalk from 'chalk'
import * as fs from 'fs'
import * as path from 'path'
import fetch from 'node-fetch'
import { v4 } from 'uuid'
import { device } from 'aws-iot-device-sdk'

let ran = false

program
	.arguments('<apiKey>')
	.action(async (apiKey: string) => {
		ran = true

		let config: { [key: string]: any }
		const configFile = path.join(process.cwd(), 'config.json')
		try {
			config = JSON.parse(fs.readFileSync(configFile, 'utf-8').toString())
		} catch {
			console.log(chalk.yellow('No configuration found, creating new device.'))
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
			config = {
				deviceId,
				ownershipCode,
				caCert,
				privateKey,
				clientCert,
			}
			fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8')
		}

		const {
			deviceId,
			caCert,
			privateKey,
			clientCert,
			ownershipCode,
			associated,
		} = config

		console.log(chalk.yellow('Device ID:'), chalk.blue(deviceId))

		// Connect
		const account = await fetch(`https://api.nrfcloud.com/v1/account`, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${apiKey}`,
			},
		})
		const { mqttEndpoint } = await account.json()
		console.log(chalk.yellow('Endpoint:'), chalk.blue(mqttEndpoint))
		console.time(chalk.green(chalk.inverse(' connected ')))

		const note = chalk.magenta(
			`Still connecting ... First connect takes around 30 seconds`,
		)
		console.time(note)
		const connectingNote = setInterval(() => {
			console.timeLog(note)
		}, 5000)

		const connection = new device({
			privateKey: Buffer.from(privateKey),
			clientCert: Buffer.from(clientCert),
			caCert: Buffer.from(caCert),
			clientId: deviceId,
			host: mqttEndpoint,
			region: mqttEndpoint.split('.')[2],
		})

		connection.on('connect', async () => {
			console.timeEnd(chalk.green(chalk.inverse(' connected ')))
			clearInterval(connectingNote)
			// Associate it
			if (!associated) {
				await fetch(`https://api.nrfcloud.com/v1/association/${deviceId}`, {
					method: 'PUT',
					headers: {
						Authorization: `Bearer ${apiKey}`,
					},
					body: ownershipCode,
				})
				console.log(chalk.green('Device associated to tenant.'))
				console.log(chalk.magentaBright('Restart script!'))
				connection.end()
				fs.writeFileSync(
					configFile,
					JSON.stringify(
						{
							...config,
							associated: true,
						},
						null,
						2,
					),
					'utf-8',
				)
			} else {
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
				)
				console.log(chalk.green('All UI services enabled.'))
			}
		})

		connection.on('close', () => {
			console.error(chalk.red(chalk.inverse(' disconnected! ')))
		})

		connection.on('reconnect', () => {
			console.log(chalk.magenta('reconnecting...'))
		})

		connection.on('error', () => {
			console.log(chalk.red(' ERROR '))
		})
	})
	.parse(process.argv)

if (!ran) {
	program.outputHelp(chalk.red)
	process.exit(1)
}
