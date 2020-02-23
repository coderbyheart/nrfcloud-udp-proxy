import fetch from 'node-fetch'

export const fetchDevice = ({ apiKey }: { apiKey: string }) => async (
	deviceId: string,
) =>
	fetch(`https://api.nrfcloud.com/v1/devices/${deviceId}`, {
		headers: {
			accept: 'application/json',
			Authorization: `Bearer ${apiKey}`,
		},
	}).then(async res => res.json())
