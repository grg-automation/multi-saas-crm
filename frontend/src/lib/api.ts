// frontend/src/lib/api.ts
import axios from 'axios'

const api = axios.create({
	baseURL: '/api/v1', // talk to API Gateway (relative path)
	withCredentials: true,
	headers: {
		'Content-Type': 'application/json',
	},
})

let isRefreshing = false
let failedQueue: Array<{
	resolve: (value?: any) => void
	reject: (err?: any) => void
}> = []

const processQueue = (error: any, token: string | null = null) => {
	failedQueue.forEach(p => {
		if (error) p.reject(error)
		else p.resolve(token)
	})
	failedQueue = []
}

api.interceptors.request.use(
	config => {
		try {
			if (typeof window === 'undefined') return config
			const token = localStorage.getItem('accessToken')
			const tenantId = localStorage.getItem('tenantId')
			if (token) config.headers!['Authorization'] = `Bearer ${token}`
			if (tenantId) config.headers!['x-tenant-id'] = tenantId
		} catch (err) {
			// ignore
		}
		return config
	},
	error => Promise.reject(error)
)

api.interceptors.response.use(
	res => res,
	async err => {
		const originalRequest = err.config
		if (!originalRequest || !originalRequest._retry)
			originalRequest._retry = false

		// If 401 and not already retrying for this request -> try refresh once
		if (err.response?.status === 401 && !originalRequest._retry) {
			originalRequest._retry = true
			if (isRefreshing) {
				// queue the request while refreshing
				return new Promise((resolve, reject) => {
					failedQueue.push({ resolve, reject })
				})
					.then((token: string) => {
						originalRequest.headers['Authorization'] = `Bearer ${token}`
						return api(originalRequest)
					})
					.catch(e => Promise.reject(e))
			}

			isRefreshing = true
			const refreshToken = localStorage.getItem('refreshToken')
			try {
				const resp = await axios.post(
					'/api/v1/auth/refresh',
					{ refreshToken },
					{
						withCredentials: true,
						headers: { 'Content-Type': 'application/json' },
					}
				)
				const newAccess =
					resp.data?.data?.accessToken || resp.data?.accessToken || null
				const newRefresh =
					resp.data?.data?.refreshToken || resp.data?.refreshToken || null
				if (!newAccess) {
					// refresh failed
					processQueue(new Error('No token from refresh'), null)
					isRefreshing = false
					// clear local state
					localStorage.removeItem('accessToken')
					localStorage.removeItem('refreshToken')
					localStorage.removeItem('user')
					return Promise.reject(err)
				}
				// store tokens
				localStorage.setItem('accessToken', newAccess)
				if (newRefresh) localStorage.setItem('refreshToken', newRefresh)
				api.defaults.headers.common['Authorization'] = `Bearer ${newAccess}`
				processQueue(null, newAccess)
				isRefreshing = false
				originalRequest.headers['Authorization'] = `Bearer ${newAccess}`
				return api(originalRequest)
			} catch (refreshErr) {
				processQueue(refreshErr, null)
				isRefreshing = false
				// Clear stored tokens on refresh failure
				localStorage.removeItem('accessToken')
				localStorage.removeItem('refreshToken')
				localStorage.removeItem('user')
				return Promise.reject(refreshErr)
			}
		}

		return Promise.reject(err)
	}
)

export default api
