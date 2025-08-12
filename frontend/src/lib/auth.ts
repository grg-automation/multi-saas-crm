import api from './api'

export async function login(email: string, password: string) {
	const { data } = await api.post('/auth/login', { email, password })
	localStorage.setItem('token', data.accessToken) // adjust to your actual token field
	return data
}

export function logout() {
	localStorage.removeItem('token')
}
