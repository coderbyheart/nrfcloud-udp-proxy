import fetch from 'node-fetch'
import * as TE from 'fp-ts/lib/TaskEither'

export const fetchDevices = ({ apiKey }: { apiKey: string }) =>
	TE.tryCatch<Error, { id: string; name: string }[]>(
		async () =>
			fetch(`https://api.nrfcloud.com/v1/devices`, {
				headers: {
					Authorization: `Bearer ${apiKey}`,
				},
			})
				.then(async res => res.json())
				.then(({ items }) => items as { id: string; name: string }[]),
		err => new Error(`Failed to fetch devices: ${(err as Error).message}!`),
	)

export const describeAccount = async ({ apiKey }: { apiKey: string }) =>
	fetch(`https://api.nrfcloud.com/v1/account`, {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${apiKey}`,
		},
	})
		.then(async res => res.json())
		.then(
			({ mqttEndpoint, topics: { messagesPrefix } }) =>
				({ mqttEndpoint, messagesPrefix } as {
					mqttEndpoint: string
					messagesPrefix: string
				}),
		)
