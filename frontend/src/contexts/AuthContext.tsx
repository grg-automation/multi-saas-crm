// Path: src/contexts/AuthContext.tsx (create this if not exists)
import { createContext, ReactNode, useEffect, useState } from 'react'

// Context
export const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Provider (wrap in _app.tsx or layout)
export const AuthProvider = ({ children }: { children: ReactNode }) => {
	const [token, setToken] = useState<string | null>(null)
	const [tenantId, setTenantId] = useState<string | null>(null)

	useEffect(() => {
		// Load from localStorage or your auth lib (e.g., after login)
		const storedToken = localStorage.getItem('accessToken')
		const storedTenant = localStorage.getItem('tenantId')
		if (storedToken) setToken(storedToken)
		if (storedTenant) setTenantId(storedTenant)
		// Integrate with real auth flow, e.g., Keycloak or Auth0 callback
	}, [])

	// Add methods like login: (newToken, newTenant) => { setToken(newToken); setTenantId(newTenant); localStorage.setItem... }

	return (
		<AuthContext.Provider value={{ token, tenantId }}>
			{children}
		</AuthContext.Provider>
	)
}
