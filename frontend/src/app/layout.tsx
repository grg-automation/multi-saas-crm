// frontend/src/app/layout.tsx
import { AuthProvider } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
	title: 'Salesforce Clone - Enterprise CRM Platform',
	description:
		'Полнофункциональный клон Salesforce CRM с современной архитектурой',
}

export default function RootLayout({
	children,
}: {
	children: React.ReactNode
}) {
	return (
		<html lang='en'>
			<body className='antialiased'>
				<ThemeProvider>
					<AuthProvider>{children}</AuthProvider>
				</ThemeProvider>
			</body>
		</html>
	)
}
