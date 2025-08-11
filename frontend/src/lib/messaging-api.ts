const API_BASE_URL = 'http://localhost:3003'

class MessagingApi {
	constructor() {
		this.baseURL = API_BASE_URL
		console.log('🔧 MessagingApi initialized with base URL:', this.baseURL)
	}

	async getThread(threadId) {
		// Change from /api/threads/ to /api/v1/thread/
		const url = `${this.baseURL}/api/v1/thread/${threadId}`
		console.log('🌐 Making API request to:', url)

		try {
			const response = await fetch(url, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json',
					// Add any auth headers if needed
					// 'Authorization': `Bearer ${token}`,
				},
			})

			console.log('📡 Response status:', response.status, response.statusText)

			if (!response.ok) {
				const errorText = await response.text()
				console.error('❌ API Error Response:', errorText)
				throw new Error(`HTTP ${response.status}: ${response.statusText}`)
			}

			const data = await response.json()
			console.log('✅ API Response data:', data)
			return data
		} catch (error) {
			console.error('❌ Fetch error:', error)
			throw error
		}
	}

	async sendMessage(threadId, message) {
		// Change from /api/threads/ to /api/v1/thread/
		const url = `${this.baseURL}/api/v1/thread/${threadId}/messages`

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ message }),
			})

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`)
			}

			return await response.json()
		} catch (error) {
			console.error('❌ Send message error:', error)
			throw error
		}
	}

	async getMessages(threadId, page = 1, limit = 50) {
		// Change from /api/threads/ to /api/v1/thread/
		const url = `${this.baseURL}/api/v1/thread/${threadId}/messages?page=${page}&limit=${limit}`

		try {
			const response = await fetch(url)

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`)
			}

			return await response.json()
		} catch (error) {
			console.error('❌ Get messages error:', error)
			throw error
		}
	}
}

export const messagingApi = new MessagingApi()
