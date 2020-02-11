import { tryCatch } from 'fp-ts/lib/Either'
import { parseNmeaSentence, Packet } from 'nmea-simple'

export const parseNmea = (sentence: string) =>
	tryCatch<Error, Packet>(
		() => parseNmeaSentence(sentence),
		err =>
			new Error(`Failed to parse NMEA sentence: ${(err as Error).message}!`),
	)
