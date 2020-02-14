import fetch from 'node-fetch'
import * as TE from 'fp-ts/lib/TaskEither'

export type Location = {
	lat: number
	lng: number
	accuracy: number
}

const query = ({
	apiKey,
	endpoint,
	cell,
}: {
	apiKey: string
	endpoint: string
	cell: { areaCode: number; mccmnc: number; cellID: number }
}) =>
	TE.tryCatch<Error, Location>(
		async () =>
			fetch(`${endpoint.replace(/\/*$/, '')}/v2/process.php`, {
				method: 'POST',
				body: JSON.stringify({
					token: apiKey,
					radio: 'lte',
					mcc: Math.floor(cell.mccmnc / 100),
					mnc: cell.mccmnc % 100,
					cells: [
						{
							lac: cell.areaCode,
							cid: cell.cellID,
						},
					],
				}),
			})
				// See https://eu1.unwiredlabs.com/docs-html/index.html#response
				.then(
					async res =>
						res.json() as Promise<{
							status: 'ok' | 'error'
							message?: string
							balance: number
							balance_slots?: number
							lat: number
							lon: number
							accuracy: number
							aged?: boolean
							fallback?: 'ipf' | 'lacf' | 'scf'
							// address: string (not requested)
							// address_details?: string (not requested)
						}>,
				)
				.then(({ status, message, lat, lon, accuracy }) => {
					if (status === 'ok') return { lat, lng: lon, accuracy }
					throw new Error(message)
				}),
		err =>
			new Error(
				`Failed to resolve cell location (${JSON.stringify(cell)}): ${
					(err as Error).message
				}!`,
			),
	)

export const resolveCellGeolocation = ({
	apiKey,
	endpoint,
}: {
	apiKey: string
	endpoint: string
}) => (cell: { areaCode: number; mccmnc: number; cellID: number }) =>
	query({
		apiKey,
		endpoint,
		cell,
	})
