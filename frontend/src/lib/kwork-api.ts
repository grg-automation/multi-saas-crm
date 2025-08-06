// lib/kwork-api.ts

const API_BASE_URL = 'http://localhost:3003/api/v1'

interface KworkFileData {
	data: string // base64
	contentType: string
	fileName: string
	fileSize: number
}

export async function downloadKworkFile(
	messageId: string,
	orderId: string
): Promise<KworkFileData> {
	const token = localStorage.getItem('token')

	if (!token) {
		throw new Error('No authentication token found')
	}

	const response = await fetch(`${API_BASE_URL}/kwork/download-file`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			messageId,
			orderId,
		}),
	})

	if (!response.ok) {
		const error = await response
			.json()
			.catch(() => ({ message: 'Unknown error' }))
		throw new Error(
			error.message || `HTTP ${response.status}: Failed to download Kwork file`
		)
	}

	const data = await response.json()

	if (!data.success) {
		throw new Error(data.message || 'Failed to download file')
	}

	return {
		data: data.data.fileData,
		contentType: data.data.mimeType || 'application/octet-stream',
		fileName: data.data.fileName || 'file',
		fileSize: data.data.fileSize || 0,
	}
}

export async function sendKworkMessage(
	orderId: string,
	message: string,
	managerId?: string
) {
	const token = localStorage.getItem('token')

	if (!token) {
		throw new Error('No authentication token found')
	}

	const response = await fetch(`${API_BASE_URL}/kwork/send-message`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			orderId,
			message,
			managerId,
		}),
	})

	if (!response.ok) {
		const error = await response
			.json()
			.catch(() => ({ message: 'Unknown error' }))
		throw new Error(
			error.message || `HTTP ${response.status}: Failed to send Kwork message`
		)
	}

	return await response.json()
}

export async function sendKworkFile(
	orderId: string,
	file: File,
	description?: string,
	managerId?: string
) {
	const token = localStorage.getItem('token')

	if (!token) {
		throw new Error('No authentication token found')
	}

	const formData = new FormData()
	formData.append('file', file)
	formData.append('orderId', orderId)
	if (description) formData.append('description', description)
	if (managerId) formData.append('managerId', managerId)

	const response = await fetch(`${API_BASE_URL}/kwork/send-file`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
		},
		body: formData,
	})

	if (!response.ok) {
		const error = await response
			.json()
			.catch(() => ({ message: 'Unknown error' }))
		throw new Error(
			error.message || `HTTP ${response.status}: Failed to send Kwork file`
		)
	}

	return await response.json()
}

export async function getKworkOrders(status?: string, limit: number = 50) {
	const token = localStorage.getItem('token')

	if (!token) {
		throw new Error('No authentication token found')
	}

	const params = new URLSearchParams()
	if (status) params.append('status', status)
	params.append('limit', limit.toString())

	const response = await fetch(`${API_BASE_URL}/kwork/orders?${params}`, {
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
	})

	if (!response.ok) {
		const error = await response
			.json()
			.catch(() => ({ message: 'Unknown error' }))
		throw new Error(
			error.message || `HTTP ${response.status}: Failed to fetch Kwork orders`
		)
	}

	return await response.json()
}

export async function sendKworkResponse(
	orderId: string,
	responseData: {
		text: string
		price: number
		deliveryTime: number
		managerId?: string
	}
) {
	const token = localStorage.getItem('token')

	if (!token) {
		throw new Error('No authentication token found')
	}

	const response = await fetch(`${API_BASE_URL}/kwork/send-response`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			orderId,
			...responseData,
		}),
	})

	if (!response.ok) {
		const error = await response
			.json()
			.catch(() => ({ message: 'Unknown error' }))
		throw new Error(
			error.message || `HTTP ${response.status}: Failed to send Kwork response`
		)
	}

	return await response.json()
}
