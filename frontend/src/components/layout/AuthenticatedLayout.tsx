'use client'
import RoleBasedNavigation, {
	useCurrentUser,
} from '@/components/navigation/RoleBasedNavigation'
import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

interface AuthenticatedLayoutProps {
	children: React.ReactNode
}

export default function AuthenticatedLayout({
	children,
}: AuthenticatedLayoutProps) {
	const router = useRouter()
	const { user, loading: userLoading } = useCurrentUser() // ✅ USE NEW HOOK STRUCTURE
	const [redirecting, setRedirecting] = useState(false)

	useEffect(() => {
		const timestamp = new Date().toLocaleTimeString()

		// Only attempt redirect if not loading and no user
		if (!userLoading && !user && !redirecting) {
			const timestamp = new Date().toLocaleTimeString()

			setRedirecting(true)

			// ✅ STORE CURRENT PATH FOR REDIRECT AFTER LOGIN
			const currentPath = window.location.pathname
			if (currentPath !== '/login') {
				localStorage.setItem('redirectAfterLogin', currentPath)
			}

			// Clear any auth-related storage before redirect
			localStorage.removeItem('accessToken')
			localStorage.removeItem('refreshToken')

			// Use window.location for reliable redirect
			setTimeout(() => {
				window.location.href = '/login'
			}, 100)
		}
	}, [user, userLoading, redirecting])

	// Show loading while user is loading or redirecting
	if (userLoading || redirecting) {
		return (
			<div className='min-h-screen flex items-center justify-center bg-gray-50'>
				<div className='text-center'>
					<Loader2 className='h-8 w-8 animate-spin mx-auto text-blue-600' />
					<p className='mt-2 text-gray-600'>
						{redirecting ? 'Перенаправление...' : 'Загрузка...'}
					</p>
				</div>
			</div>
		)
	}

	// If not loading and no user, show loading while redirect happens
	if (!userLoading && !user) {
		return (
			<div className='min-h-screen flex items-center justify-center bg-gray-50'>
				<div className='text-center'>
					<Loader2 className='h-8 w-8 animate-spin mx-auto text-blue-600' />
					<p className='mt-2 text-gray-600'>Проверка авторизации...</p>
				</div>
			</div>
		)
	}

	// Render the authenticated layout
	const timestamp = new Date().toLocaleTimeString()

	return (
		<div className='min-h-screen bg-gray-50 flex'>
			{/* Navigation */}
			<RoleBasedNavigation user={user} />
			{/* Main content */}
			<div className='flex-1'>
				<main className='min-h-screen'>{children}</main>
			</div>
		</div>
	)
}
