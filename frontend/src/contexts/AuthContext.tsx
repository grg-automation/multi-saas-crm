import { createContext, useContext, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import axios from '../utils/axiosInstance'

const AuthContext = createContext()

export function AuthProvider({ children }) {
	const { tenantId } = useParams()
	const navigate = useNavigate()

	const [token, setToken] = useState(
		() => localStorage.getItem('token') || null
	)
	const [currentTenant, setCurrentTenant] = useState(
		() => localStorage.getItem('tenantId') || tenantId || null
	)

	useEffect(() => {
		if (tenantId && tenantId !== currentTenant) {
			setCurrentTenant(tenantId)
			localStorage.setItem('tenantId', tenantId)
		}
	}, [tenantId])

	const login = async (email, password) => {
		try {
			const res = await axios.post(`/${currentTenant}/api/v1/auth/login`, {
				email,
				password,
			})
			setToken(res.data.token)
			localStorage.setItem('token', res.data.token)
			navigate(`/${currentTenant}/dashboard`)
		} catch (err) {
			console.error('Login failed', err)
			throw err
		}
	}

	const logout = () => {
		setToken(null)
		localStorage.removeItem('token')
		navigate(`/${currentTenant}/login`)
	}

	return (
		<AuthContext.Provider value={{ token, currentTenant, login, logout }}>
			{children}
		</AuthContext.Provider>
	)
}

export function useAuth() {
	return useContext(AuthContext)
}
