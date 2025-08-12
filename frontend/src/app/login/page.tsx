// frontend/src/app/login/page.tsx
'use client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import React, { useEffect, useState } from 'react'

function detectTenantFromHost(hostname?: string) {
	if (!hostname) return null
	try {
		const parts = hostname.split('.')
		if (parts.length >= 3 && parts[0] !== 'www') return parts[0]
		return null
	} catch {
		return null
	}
}

export default function LoginPage() {
	const router = useRouter()
	const auth = useAuth()
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
	const [tenant, setTenant] = useState<string | null>(null)

	useEffect(() => {
		// Detect tenant from URL or localStorage
		const fromHost = detectTenantFromHost(
			typeof window !== 'undefined' ? window.location.hostname : ''
		)
		const fromQuery =
			typeof window !== 'undefined'
				? new URL(window.location.href).searchParams.get('tenant')
				: null
		const saved =
			typeof window !== 'undefined' ? localStorage.getItem('tenantId') : null
		setTenant(saved || fromQuery || fromHost)
	}, [])

	useEffect(() => {
		const checkAuth = async () => {
			await new Promise(resolve => setTimeout(resolve, 50))
			const logoutInProgress =
				localStorage.getItem('logoutInProgress') === 'true'
			if (logoutInProgress) {
				localStorage.removeItem('logoutInProgress')
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
						if (role === 'ADMIN') router.replace('/admin/chat-assignments')
						else if (role === 'MANAGER') router.replace('/manager/inbox')
						else router.replace('/dashboard')
						return
					}
				} catch (err) {
					console.error('Token parsing error:', err)
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
			await auth.login({ email: loginData.email, password: loginData.password })
			// read role from token
			const token = localStorage.getItem('accessToken')
			const payload = token ? JSON.parse(atob(token.split('.')[1])) : null
			const role = payload?.role
			if (role === 'ADMIN') router.replace('/admin/chat-assignments')
			else if (role === 'MANAGER') router.replace('/manager/inbox')
			else router.replace('/dashboard')
		} catch (err: any) {
			setError(err?.message || 'Login failed')
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
			const payload = {
				email: registerData.email,
				password: registerData.password,
				firstName: registerData.firstName,
				lastName: registerData.lastName,
				...(tenant ? { tenant } : {}),
			}
			const res = await fetch(
				`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/register`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					credentials: 'include',
					body: JSON.stringify(payload),
				}
			)
			const data = await res.json()
			if (res.ok) {
				setError('')
				setIsLogin(true)
				setLoginData({ email: registerData.email, password: '' })
				alert('Registration successful! Please log in.')
			} else {
				setError(
					data?.message || data?.detail || data?.error || 'Registration failed'
				)
			}
		} catch (err) {
			console.error('Registration error:', err)
			setError('Server connection error')
		} finally {
			setLoading(false)
		}
	}

	if (isCheckingAuth || auth.loading) {
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
					<div className='mt-2 text-center text-sm text-gray-500'>
						{tenant ? `Тенант: ${tenant}` : 'Тенант не определён'}
					</div>
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
								{/* registration form unchanged */}
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
			</div>
		</div>
	)
}
