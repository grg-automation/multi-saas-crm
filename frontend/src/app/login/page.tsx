'use client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter } from 'next/navigation'
import React, { useEffect, useState } from 'react'

export default function LoginPage() {
	const router = useRouter()
	const [isLogin, setIsLogin] = useState(true)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState('')
	const [isCheckingAuth, setIsCheckingAuth] = useState(true)
	const [loginData, setLoginData] = useState({
		email: '',
		password: '',
	})
	const [registerData, setRegisterData] = useState({
		email: '',
		password: '',
		passwordConfirm: '',
		firstName: '',
		lastName: '',
	})

	useEffect(() => {
		const checkAuth = async () => {
			await new Promise(resolve => setTimeout(resolve, 100)) // Allow storage to settle
			const logoutInProgress =
				localStorage.getItem('logoutInProgress') === 'true'
			if (logoutInProgress) {
				localStorage.removeItem('logoutInProgress') // Clear flag
				setIsCheckingAuth(false)
				return
			}
			const token = localStorage.getItem('accessToken')
			if (token) {
				try {
					const payload = JSON.parse(atob(token.split('.')[1]))
					if (payload.exp * 1000 < Date.now()) {
						localStorage.removeItem('accessToken')
						localStorage.removeItem('refreshToken')
					} else {
						const role = payload.role
						switch (role) {
							case 'ADMIN':
								router.replace('/admin/chat-assignments')
								return
							case 'MANAGER':
								router.replace('/manager/inbox')
								return
							default:
								router.replace('/dashboard')
								return
						}
					}
				} catch (error) {
					console.error('Token parsing error:', error)
					localStorage.removeItem('accessToken')
					localStorage.removeItem('refreshToken')
				}
			}
			setIsCheckingAuth(false)
		}
		checkAuth()
	}, [router])

	const handleLogin = async (e: React.FormEvent) => {
		e.preventDefault()
		setLoading(true)
		setError('')
		try {
			const response = await fetch(
				`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/login`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					credentials: 'include',
					body: JSON.stringify(loginData),
				}
			)
			const responseData = await response.json()
			if (response.ok) {
				const { accessToken, refreshToken } = responseData.data
				localStorage.setItem('accessToken', accessToken)
				localStorage.setItem('refreshToken', refreshToken)
				const payload = JSON.parse(atob(accessToken.split('.')[1]))
				const role = payload.role
				switch (role) {
					case 'ADMIN':
						router.replace('/admin/chat-assignments')
						break
					case 'MANAGER':
						router.replace('/manager/inbox')
						break
					default:
						router.replace('/dashboard')
				}
			} else {
				setError(
					responseData.message ||
						responseData.detail ||
						responseData.error ||
						'Login failed'
				)
			}
		} catch (err) {
			console.error('Login error:', err)
			setError('Server connection error')
		} finally {
			setLoading(false)
		}
	}

	const handleRegister = async (e: React.FormEvent) => {
		e.preventDefault()
		setLoading(true)
		setError('')
		if (registerData.password !== registerData.passwordConfirm) {
			setError('Passwords do not match')
			setLoading(false)
			return
		}
		if (registerData.password.length < 8) {
			setError('Password must be at least 8 characters')
			setLoading(false)
			return
		}
		try {
			const response = await fetch(
				`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/register`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					credentials: 'include',
					body: JSON.stringify(registerData),
				}
			)
			const responseData = await response.json()
			if (response.ok) {
				setError('')
				setIsLogin(true)
				setLoginData({ email: registerData.email, password: '' })
				alert('Registration successful! Please log in.')
			} else {
				setError(
					responseData.message ||
						responseData.detail ||
						responseData.error ||
						'Registration failed'
				)
			}
		} catch (err) {
			console.error('Registration error:', err)
			setError('Server connection error')
		} finally {
			setLoading(false)
		}
	}

	if (isCheckingAuth) {
		return (
			<div className='min-h-screen flex items-center justify-center'>
				<div>Loading...</div>
			</div>
		)
	}

	return (
		<div className='min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8'>
			<div className='max-w-md w-full space-y-8'>
				<div>
					<h2 className='mt-6 text-center text-3xl font-extrabold text-gray-900'>
						{isLogin ? 'Вход в систему' : 'Регистрация'}
					</h2>
					<p className='mt-2 text-center text-sm text-gray-600'>
						CRM система управления
					</p>
				</div>
				<Card>
					<CardHeader>
						<CardTitle className='text-center'>
							{isLogin ? 'Войти' : 'Создать аккаунт'}
						</CardTitle>
					</CardHeader>
					<CardContent>
						{error && (
							<div className='mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded'>
								{error}
								<details className='mt-2'>
									<summary className='cursor-pointer text-xs'>
										Техническая информация
									</summary>
									<pre className='text-xs mt-1 whitespace-pre-wrap'>
										Проверьте консоль браузера для подробностей
									</pre>
								</details>
							</div>
						)}
						{isLogin ? (
							<form onSubmit={handleLogin} className='space-y-4'>
								<div>
									<Label htmlFor='email'>Email</Label>
									<Input
										id='email'
										type='email'
										required
										value={loginData.email}
										onChange={e =>
											setLoginData({ ...loginData, email: e.target.value })
										}
										placeholder='your@email.com'
									/>
								</div>
								<div>
									<Label htmlFor='password'>Пароль</Label>
									<Input
										id='password'
										type='password'
										required
										value={loginData.password}
										onChange={e =>
											setLoginData({ ...loginData, password: e.target.value })
										}
										placeholder='Ваш пароль'
									/>
								</div>
								<Button type='submit' className='w-full' disabled={loading}>
									{loading ? 'Вход...' : 'Войти'}
								</Button>
								<div className='text-center'>
									<Button
										variant='link'
										onClick={() => router.push('/forgot-password')}
										className='text-sm text-blue-600'
									>
										Забыли пароль?
									</Button>
								</div>
							</form>
						) : (
							<form onSubmit={handleRegister} className='space-y-4'>
								<div className='grid grid-cols-2 gap-4'>
									<div>
										<Label htmlFor='first_name'>Имя</Label>
										<Input
											id='first_name'
											type='text'
											required
											value={registerData.firstName}
											onChange={e =>
												setRegisterData({
													...registerData,
													firstName: e.target.value,
												})
											}
											placeholder='Имя'
										/>
									</div>
									<div>
										<Label htmlFor='last_name'>Фамилия</Label>
										<Input
											id='last_name'
											type='text'
											required
											value={registerData.lastName}
											onChange={e =>
												setRegisterData({
													...registerData,
													lastName: e.target.value,
												})
											}
											placeholder='Фамилия'
										/>
									</div>
								</div>
								<div>
									<Label htmlFor='reg_email'>Email</Label>
									<Input
										id='reg_email'
										type='email'
										required
										value={registerData.email}
										onChange={e =>
											setRegisterData({
												...registerData,
												email: e.target.value,
											})
										}
										placeholder='your@email.com'
									/>
								</div>
								<div>
									<Label htmlFor='reg_password'>Пароль</Label>
									<Input
										id='reg_password'
										type='password'
										required
										value={registerData.password}
										onChange={e =>
											setRegisterData({
												...registerData,
												password: e.target.value,
											})
										}
										placeholder='Пароль (мин. 8 символов, заглавная буква, спец. символ)'
										minLength={8}
									/>
									<div className='text-xs text-gray-500 mt-1'>
										Пароль должен содержать минимум 8 символов, одну заглавную
										букву и один специальный символ
									</div>
								</div>
								<div>
									<Label htmlFor='password_confirm'>Подтвердите пароль</Label>
									<Input
										id='password_confirm'
										type='password'
										required
										value={registerData.passwordConfirm}
										onChange={e =>
											setRegisterData({
												...registerData,
												passwordConfirm: e.target.value,
											})
										}
										placeholder='Повторите пароль'
										minLength={8}
									/>
								</div>
								<Button type='submit' className='w-full' disabled={loading}>
									{loading ? 'Регистрация...' : 'Зарегистрироваться'}
								</Button>
							</form>
						)}
						<div className='mt-6'>
							<div className='relative'>
								<div className='absolute inset-0 flex items-center'>
									<div className='w-full border-t border-gray-300' />
								</div>
								<div className='relative flex justify-center text-sm'>
									<span className='px-2 bg-white text-gray-500'>или</span>
								</div>
							</div>
							<div className='mt-6'>
								<Button
									type='button'
									variant='outline'
									className='w-full'
									onClick={() => {
										setIsLogin(!isLogin)
										setError('')
									}}
								>
									{isLogin
										? 'Создать новый аккаунт'
										: 'Уже есть аккаунт? Войти'}
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>
				<Card className='bg-blue-50'>
					<CardContent className='pt-6'>
						<h3 className='text-sm font-medium text-blue-900 mb-2'>
							Для тестирования:
						</h3>
						<div className='text-xs text-blue-700 space-y-1'>
							<p>Email: testcontacts@example.com</p>
							<p>Пароль: TestPassword123!</p>
							<p className='mt-2 text-blue-600'>Или создайте новый аккаунт</p>
						</div>
					</CardContent>
				</Card>
				{process.env.NODE_ENV === 'development' && (
					<Card className='bg-yellow-50'>
						<CardContent className='pt-6'>
							<h3 className='text-sm font-medium text-yellow-900 mb-2'>
								Debug Info:
							</h3>
							<div className='text-xs text-yellow-700 space-y-1'>
								<p>API URL: http://localhost:3001/api/v1/auth/register</p>
								<p>Check browser console for detailed error logs</p>
								<p>Verify API Gateway is running on port 3001</p>
							</div>
						</CardContent>
					</Card>
				)}
			</div>
		</div>
	)
}
