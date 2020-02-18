import * as fs from 'fs'
import * as path from 'path'
import * as chalk from 'chalk'
import { v4 } from 'uuid'
import fetch from 'node-fetch'

export type Config = {
	[key: string]: {
		deviceId: string
		ownershipCode: string
		caCert: string
		privateKey: string
		clientCert: string
		associated?: boolean
	}
}

export const writeConfig = (configFile: string) => (config: Config) =>
	fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8')

export const initConfig = async ({
	deviceCount,
	dataDir,
	apiKey,
}: {
	deviceCount: number
	dataDir: string
	apiKey: string
}) => {
	let config: Config

	// Load config
	const configFile = path.join(dataDir, 'config.json')
	try {
		config = JSON.parse(fs.readFileSync(configFile, 'utf-8').toString())
	} catch {
		console.log(chalk.yellow('No configuration found, creating...'))
		config = {}
	}

	// If not enough devices, create new devices
	while (Object.entries(config).length < deviceCount) {
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
		const addr = `${Object.entries(config).length}`
		config[addr] = {
			deviceId,
			ownershipCode,
			caCert,
			privateKey,
			clientCert,
		}
		console.log(
			chalk.green('New device created:'),
			chalk.blueBright(addr),
			chalk.cyan(deviceId),
		)
		writeConfig(configFile)(config)
	}
	return {
		config,
		updateConfig: writeConfig(configFile),
	}
}
