// Path: src/hooks/useAuth.ts
import { AuthContext } from '@/contexts/AuthContext' // Create this context if not exists
import { useContext } from 'react'

// Basic AuthContext type (expand as needed)
interface AuthContextType {
	token: string | null
	tenantId: string | null
	// Add more: user, login, logout, etc.
}

// Hook
export const useAuth = (): AuthContextType => {
	const context = useContext(AuthContext)
	if (!context) {
		throw new Error('useAuth must be used within an AuthProvider')
	}
	return context
}
