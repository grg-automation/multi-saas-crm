'use client'

import RoleBasedNavigation, {
	useCurrentUser,
} from '@/components/navigation/RoleBasedNavigation'
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'

interface AuthenticatedLayoutProps {
	children: React.ReactNode
}

export default function AuthenticatedLayout({
	children,
}: AuthenticatedLayoutProps) {
	const user = useCurrentUser()
	const [isLoading, setIsLoading] = useState(true)
	const [authChecked, setAuthChecked] = useState(false)

	useEffect(() => {
		const timestamp = new Date().toLocaleTimeString()
		console.log(
			`🏗️ [${timestamp}] AUTHENTICATED LAYOUT: Layout mounted, user:`,
			user
		)

		// Give useCurrentUser some time to load
		const timer = setTimeout(() => {
			console.log(
				`⏰ [${timestamp}] AUTHENTICATED LAYOUT: Timer finished, user:`,
				user
			)
			setAuthChecked(true)
			setIsLoading(false)
		}, 500) // Reduced from 1000ms to 500ms

		return () => clearTimeout(timer)
	}, [user])

	// Show loading while checking authentication
	if (isLoading || !authChecked) {
		return (
			<div className='min-h-screen flex items-center justify-center bg-gray-50'>
				<div className='text-center'>
					<Loader2 className='h-8 w-8 animate-spin mx-auto text-blue-600' />
					<p className='mt-2 text-gray-600'>Загрузка...</p>
				</div>
			</div>
		)
	}

	// Only redirect after we've actually checked for the user
	if (authChecked && !user) {
		const timestamp = new Date().toLocaleTimeString()
		console.log(
			`🚪 [${timestamp}] AUTHENTICATED LAYOUT: No user found, redirecting to login`
		)

		// ✅ BETTER: Use window.location.replace to avoid back button issues
		window.location.replace('/login')
		return null
	}

	// ✅ Only render if we have a user
	if (!user) {
		return null
	}

	const timestamp = new Date().toLocaleTimeString()
	console.log(
		`✅ [${timestamp}] AUTHENTICATED LAYOUT: Rendering layout with user:`,
		user.email
	)

	return (
		<div className='min-h-screen bg-gray-50 flex'>
			{/* Navigation */}
			<RoleBasedNavigation user={user} />

			{/* Main content */}
			<div className='flex-1 md:ml-64'>
				<main className='min-h-screen'>{children}</main>
			</div>
		</div>
	)
}
