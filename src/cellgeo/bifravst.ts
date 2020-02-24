import fetch from 'node-fetch'
import * as TE from 'fp-ts/lib/TaskEither'
import { Location } from './types'

const query = ({
	endpoint,
	cell,
	log,
	errorLog,
}: {
	endpoint: string
	cell: { areaCode: number; mccmnc: number; cellID: number }
	log: (...args: any) => void
	errorLog: (...args: any) => void
}) =>
	TE.tryCatch<Error, Location>(
		async () =>
			fetch(
				`${endpoint.replace(/\/*$/, '')}/geolocate?cell=${cell.cellID}&area=${
					cell.areaCode
				}&mccmnc=${cell.mccmnc}`,
			)
				.then(async res => {
					if (res.status !== 200) {
						throw new Error(`Cell geolocation not found (${res.status})!`)
					}
					return res.json() as Promise<{
						lat: number
						lng: number
						accuracy: number
					}>
				})
				.then(res => {
					log(`Cell geolocation found`, cell, res)
					return res
				}),
		err => {
			const msg = `Failed to resolve cell location (${JSON.stringify(cell)}): ${
				(err as Error).message
			}!`
			errorLog(msg)
			return new Error(msg)
		},
	)

export const resolveCellGeolocation = ({
	endpoint,
	log,
	errorLog,
}: {
	endpoint: string
	log: (...args: any) => void
	errorLog: (...args: any) => void
}) => (cell: { areaCode: number; mccmnc: number; cellID: number }) =>
	query({
		endpoint,
		cell,
		log,
		errorLog,
	})
