import fetch from 'node-fetch'
import * as querystring from 'querystring'

/**
 * Fetches the historical devices message of the last 24 hours
 */
export const historyFetcher = ({ apiKey }: { apiKey: string }) => {
	const fetchRecursive = async (
		deviceId: string,
		apps?: Map<string, string>,
		pageNextToken?: string,
	): Promise<Map<string, string>> =>
		fetch(
			`https://api.nrfcloud.com/v1/messages?${querystring.stringify({
				inclusiveStart: new Date(
					new Date().getTime() - 60 * 60 * 24 * 1000,
				).toISOString(),
				exclusiveEnd: new Date().toISOString(),
				deviceIdentifiers: deviceId,
				pageLimit: 100,
				pageSort: 'desc',
				...(pageNextToken ? { pageNextToken } : {}),
			})}`,
			{
				headers: {
					accept: 'application/json',
					Authorization: `Bearer ${apiKey}`,
				},
			},
		)
			.then(async res => res.json())
			.then(res => {
				const { items, nextStartKey } = res
				if (!items) return apps || new Map<string, string>()
				const d = (items as { message: { appId: string; data: string } }[])
					.filter(({ message: { appId } }) =>
						['TEMP', 'AIR_QUAL', 'HUMID', 'AIR_PRESS', 'GPS', 'RSRP'].includes(
							appId,
						),
					)
					.map(({ message }) => message)
					.reduce((apps, { appId, data }) => {
						if (!apps.get(appId)) {
							apps.set(appId, data)
						}
						return apps
					}, apps || new Map<string, string>())
				if (!nextStartKey) {
					return d
				}
				return fetchRecursive(deviceId, d, nextStartKey)
			})

	return fetchRecursive
}
