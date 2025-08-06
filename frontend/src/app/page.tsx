'use client'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function HomePage() {
	const router = useRouter()
	const [isAuthenticated, setIsAuthenticated] = useState(false)
	const [user, setUser] = useState<any>(null)

	useEffect(() => {
		const token = localStorage.getItem('accessToken')
		if (token) {
			try {
				const payload = JSON.parse(atob(token.split('.')[1]))
				if (payload.exp * 1000 < Date.now()) {
					localStorage.removeItem('accessToken')
					localStorage.removeItem('refreshToken')
					setIsAuthenticated(false)
					setUser(null)
					return
				}
				setIsAuthenticated(true)
				setUser({ role: payload.role }) // Minimal from token
				fetchUserData(token)
			} catch (error) {
				console.error('Error parsing token:', error)
				localStorage.removeItem('accessToken')
				localStorage.removeItem('refreshToken')
				setIsAuthenticated(false)
				setUser(null)
			}
		} else {
			setIsAuthenticated(false)
			setUser(null)
		}
	}, [router])

	const fetchUserData = async (token: string) => {
		try {
			const response = await fetch(
				`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/me`,
				{
					headers: { Authorization: `Bearer ${token}` },
				}
			)
			if (response.ok) {
				const userData = await response.json()
				setUser(userData)
				localStorage.setItem('user', JSON.stringify(userData)) // Store for persistence
			} else {
				console.error('Failed to fetch user data:', await response.text())
			}
		} catch (error) {
			console.error('Error fetching user data:', error)
		}
	}

	const handleLogout = () => {
		localStorage.setItem('logoutInProgress', 'true') // Flag to break loop
		localStorage.removeItem('accessToken')
		localStorage.removeItem('refreshToken')
		localStorage.removeItem('user')
		setIsAuthenticated(false)
		setUser(null)
		router.replace('/login') // Use replace to avoid history issues
	}

	return (
		<div className='min-h-screen bg-gray-50'>
			<div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12'>
				<div className='flex justify-between items-center mb-8'>
					<div>
						<h1 className='text-4xl font-bold text-gray-900'>
							Salesforce Clone
						</h1>
						<p className='text-xl text-gray-600'>Enterprise CRM Platform</p>
					</div>
					<div className='flex items-center space-x-4'>
						{isAuthenticated && user ? (
							<>
								<span className='text-gray-700'>
									Добро пожаловать, {user.first_name || 'User'}{' '}
									{user.last_name || ''}
								</span>
								<Button onClick={handleLogout} variant='outline'>
									Выйти
								</Button>
							</>
						) : (
							<Button onClick={() => router.push('/login')}>Войти</Button>
						)}
					</div>
				</div>
				<div className='text-center'>
					<div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8'>
						<Link
							href='/inbox'
							className='bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-lg p-6 hover:shadow-xl transition-all transform hover:scale-105 text-white'
						>
							<div className='text-center'>
								<div className='text-4xl mb-4'>📥</div>
								<h3 className='text-xl font-semibold mb-2'>Inbox</h3>
								<p className='text-blue-100'>Входящие сообщения и диалоги</p>
								<div className='mt-3 inline-block bg-red-500 text-white text-xs px-2 py-1 rounded-full'>
									Новое!
								</div>
							</div>
						</Link>
						<Link
							href='/dashboard'
							className='bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow'
						>
							<div className='text-center'>
								<div className='text-4xl mb-4'>📊</div>
								<h3 className='text-xl font-semibold text-gray-800 mb-2'>
									Dashboard
								</h3>
								<p className='text-gray-600'>Аналитика и ключевые метрики</p>
							</div>
						</Link>
						<Link
							href='/contacts'
							className='bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow'
						>
							<div className='text-center'>
								<div className='text-4xl mb-4'>👥</div>
								<h3 className='text-xl font-semibold text-gray-800 mb-2'>
									Контакты
								</h3>
								<p className='text-gray-600'>
									Управление контактами и клиентами
								</p>
							</div>
						</Link>
						<Link
							href='/opportunities'
							className='bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow'
						>
							<div className='text-center'>
								<div className='text-4xl mb-4'>💼</div>
								<h3 className='text-xl font-semibold text-gray-800 mb-2'>
									Сделки
								</h3>
								<p className='text-gray-600'>
									Канбан-доска для управления сделками
								</p>
							</div>
						</Link>
						<Link
							href='/companies'
							className='bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow'
						>
							<div className='text-center'>
								<div className='text-4xl mb-4'>🏢</div>
								<h3 className='text-xl font-semibold text-gray-800 mb-2'>
									Компании
								</h3>
								<p className='text-gray-600'>
									Управление компаниями и организациями
								</p>
							</div>
						</Link>
					</div>
					<div className='bg-white rounded-lg shadow-lg p-8 max-w-2xl mx-auto'>
						<h2 className='text-2xl font-semibold text-gray-800 mb-4'>
							🚀 Проект запущен успешно!
						</h2>
						<p className='text-gray-600 mb-6'>
							Backend API и инфраструктура работают корректно.
						</p>
						<div className='grid grid-cols-1 md:grid-cols-2 gap-4 text-left'>
							<div className='bg-green-50 p-4 rounded-lg'>
								<h3 className='font-semibold text-green-800'>✅ Backend API</h3>
								<p className='text-green-600'>http://localhost:3001</p>
							</div>
							<div className='bg-blue-50 p-4 rounded-lg'>
								<h3 className='font-semibold text-blue-800'>📚 API Docs</h3>
								<p className='text-blue-600'>http://localhost:3001/docs</p>
							</div>
							<div className='bg-purple-50 p-4 rounded-lg'>
								<h3 className='font-semibold text-purple-800'>📈 Grafana</h3>
								<p className='text-purple-600'>http://localhost:3001</p>
							</div>
							<div className='bg-orange-50 p-4 rounded-lg'>
								<h3 className='font-semibold text-orange-800'>📊 Prometheus</h3>
								<p className='text-orange-600'>http://localhost:9090</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
