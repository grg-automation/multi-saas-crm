export const isAuthenticated = (): boolean => {
	if (typeof window === 'undefined') return false
	const token = localStorage.getItem('token')
	return !!(token && token !== 'undefined' && token !== 'null')
}

export const getToken = (): string | null => {
	if (typeof window === 'undefined') return null
	return localStorage.getItem('accessToken')
}

export const getUser = (): any | null => {
	if (typeof window === 'undefined') return null
	const userData = localStorage.getItem('user')
	if (!userData || userData === 'undefined' || userData === 'null') return null
	try {
		return JSON.parse(userData)
	} catch (error) {
		console.error('Error parsing user data:', error)
		// НЕ очищаем localStorage автоматически - это может создать цикл
		return null
	}
}

export const logout = (): void => {
	if (typeof window === 'undefined') return
	localStorage.removeItem('token')
	localStorage.removeItem('user')
}

export const redirectToLogin = (): void => {
	if (typeof window !== 'undefined') {
		window.location.href = '/login'
	}
}

export const hasRole = (requiredRole: 'ADMIN' | 'MANAGER'): boolean => {
	const user = getUser()
	console.log('hasRole check:', { user, requiredRole })
	if (!user) return false

	// Проверяем разные возможные структуры данных
	const userRole =
		user.role ||
		user.data?.role ||
		user.authorities?.includes(`ROLE_${requiredRole}`)
	console.log('User role found:', userRole)

	return userRole === requiredRole
}

export const isAdmin = (): boolean => {
	return hasRole('ADMIN')
}

export const isManager = (): boolean => {
	return hasRole('MANAGER')
}
