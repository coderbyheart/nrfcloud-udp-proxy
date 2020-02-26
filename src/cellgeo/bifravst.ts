import fetch from 'node-fetch'
import * as TE from 'fp-ts/lib/TaskEither'
import { Location } from './types'
import { Logger } from 'winston'

const query = ({
	endpoint,
	cell,
	logger,
}: {
	endpoint: string
	cell: { areaCode: number; mccmnc: number; cellID: number }
	logger: Logger
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
					logger.debug(
						`Cell geolocation found: ${JSON.stringify(cell)} ${JSON.stringify(
							res,
						)}`,
					)
					return res
				}),
		err => {
			const msg = `Failed to resolve cell location (${JSON.stringify(cell)}): ${
				(err as Error).message
			}!`
			logger.warn(msg)
			return new Error(msg)
		},
	)

export const resolveCellGeolocation = ({
	endpoint,
	logger,
}: {
	endpoint: string
	logger: Logger
}) => (cell: { areaCode: number; mccmnc: number; cellID: number }) =>
	query({
		endpoint,
		cell,
		logger,
	})
