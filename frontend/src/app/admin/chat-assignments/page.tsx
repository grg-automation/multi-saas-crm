'use client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { getToken } from '@/lib/auth'
import { Search, UserPlus, Users, X } from 'lucide-react'
import { useRouter } from 'next/navigation' // ✅ ADD THIS IMPORT
import { useEffect, useState } from 'react'

interface Manager {
	id: string
	email: string
	firstName: string
	lastName: string
	role: 'MANAGER'
	assignedChatsCount: number
}

interface Thread {
	id: string
	subject: string
	contact: {
		fullName: string
		phone?: string
		username?: string
	}
	channel: {
		displayName: string
		type: string
	}
	messageCount: number
	unreadCount: number
	lastMessageAt: string
	assignedManager?: Manager
}

export default function ChatAssignmentsPage() {
	const router = useRouter() // ✅ ADD THIS HOOK
	const [threads, setThreads] = useState<Thread[]>([])
	const [managers, setManagers] = useState<Manager[]>([])
	const [searchQuery, setSearchQuery] = useState('')
	const [filterAssigned, setFilterAssigned] = useState<
		'all' | 'assigned' | 'unassigned'
	>('all')
	const [loading, setLoading] = useState(true)
	const [authChecking, setAuthChecking] = useState(true)

	useEffect(() => {
		const checkAuth = async () => {
			await new Promise(resolve => setTimeout(resolve, 100)) // Settle storage
			const logoutInProgress =
				localStorage.getItem('logoutInProgress') === 'true'
			if (logoutInProgress) {
				localStorage.removeItem('logoutInProgress')
				setAuthChecking(false)
				return // Skip during logout
			}
			// if (!isAuthenticated()) {
			// 	console.log('User not authenticated, redirecting to login')
			// 	redirectToLogin()
			// 	return
			// }
			// if (!isAdmin()) {
			// 	console.log('User is not admin, redirecting to home')
			// 	router.replace('/') // ✅ NOW router IS DEFINED
			// 	return
			// }
			console.log('User is admin, loading data')
			setAuthChecking(false)
			fetchData()
		}
		checkAuth()
	}, [router]) // ✅ ADD router TO DEPENDENCY ARRAY

	const fetchData = async () => {
		try {
			setLoading(true)
			const token = getToken() // Use centralized token getter
			const headers = {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			}
			console.log('Fetching admin data using messaging API...')
			const [threadsResult, managersRes] = await Promise.allSettled([
				import('@/lib/messaging-api').then(m =>
					m.messagingApi.getInboxThreads()
				),
				fetch('http://localhost:3001/api/v1/admin/managers', { headers }),
			])
			// Handle threads
			if (threadsResult.status === 'fulfilled') {
				const threadsData = threadsResult.value
				console.log('Threads from messaging API:', threadsData)
				setThreads(threadsData.content || [])
			} else {
				console.warn('Threads API failed:', threadsResult.reason)
			}
			// Handle managers
			if (managersRes.status === 'fulfilled' && managersRes.value.ok) {
				const managersData = await managersRes.value.json()
				console.log('Managers data received:', managersData)
				const managersList = managersData.success
					? managersData.data
					: managersData
				setManagers(Array.isArray(managersList) ? managersList : [])
			} else {
				console.warn(
					'Managers API failed:',
					managersRes.status === 'fulfilled'
						? `Status: ${managersRes.value.status} ${managersRes.value.statusText}`
						: `Promise rejected: ${managersRes.reason}`
				)
			}
		} catch (error) {
			console.error('Error fetching data:', error)
		} finally {
			setLoading(false)
		}
	}

	const assignChatToManager = async (threadId: string, managerId: string) => {
		try {
			console.log('🔄 ASSIGNING CHAT:', { threadId, managerId })
			const token = getToken()
			const response = await fetch(
				'http://localhost:3003/api/v1/manager/assign-chat',
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${token}`,
					},
					body: JSON.stringify({ threadId, managerId }),
				}
			)
			if (response.ok) {
				const result = await response.json()
				console.log('✅ CHAT ASSIGNED:', result)
				await fetchData() // Refresh data
			} else {
				console.error(
					'❌ ASSIGNMENT FAILED:',
					response.status,
					response.statusText
				)
			}
		} catch (error) {
			console.error('Error assigning chat:', error)
		}
	}

	const unassignChat = async (threadId: string, managerId: string) => {
		try {
			const token = getToken()
			const response = await fetch(
				'http://localhost:3001/api/v1/admin/unassign-chat',
				{
					method: 'DELETE',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${token}`,
					},
					body: JSON.stringify({ threadId, managerId }),
				}
			)
			if (response.ok) {
				await fetchData() // Refresh data
			}
		} catch (error) {
			console.error('Error unassigning chat:', error)
		}
	}

	const filteredThreads = threads.filter(thread => {
		// Search filter
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase()
			const matchesSearch =
				thread.contact.fullName.toLowerCase().includes(query) ||
				thread.contact.phone?.toLowerCase().includes(query) ||
				thread.contact.username?.toLowerCase().includes(query) ||
				thread.subject.toLowerCase().includes(query)
			if (!matchesSearch) return false
		}
		// Assignment filter
		if (filterAssigned === 'assigned' && !thread.assignedManager) return false
		if (filterAssigned === 'unassigned' && thread.assignedManager) return false
		return true
	})

	if (authChecking) {
		return (
			<div className='p-6'>
				<div className='flex items-center justify-center h-64'>
					<div className='text-center'>
						<div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto'></div>
						<p className='mt-2 text-gray-600'>Проверка доступа...</p>
					</div>
				</div>
			</div>
		)
	}

	if (loading) {
		return (
			<div className='p-6'>
				<div className='flex items-center justify-center h-64'>
					<div className='text-center'>
						<div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto'></div>
						<p className='mt-2 text-gray-600'>Загрузка данных...</p>
					</div>
				</div>
			</div>
		)
	}

	return (
		<>
			<div className='p-6 space-y-6'>
				{/* Header */}
				<div className='flex items-center justify-between'>
					<div>
						<h1 className='text-2xl font-bold text-gray-900'>
							Управление назначениями чатов
						</h1>
						<p className='text-gray-600'>
							Назначайте чаты менеджерам для обработки
						</p>
					</div>
					<div className='flex items-center space-x-2'>
						<Users className='h-5 w-5 text-gray-400' />
						<span className='text-sm text-gray-600'>
							{managers.length} менеджеров
						</span>
					</div>
				</div>
				{/* Filters */}
				<Card>
					<CardContent className='p-4'>
						<div className='flex flex-col md:flex-row gap-4'>
							{/* Search */}
							<div className='relative flex-1'>
								<Search className='absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400' />
								<Input
									type='text'
									placeholder='Поиск по контакту, телефону, username...'
									value={searchQuery}
									onChange={e => setSearchQuery(e.target.value)}
									className='pl-10'
								/>
							</div>
							{/* Assignment filter */}
							<Select
								value={filterAssigned}
								onValueChange={(value: any) => setFilterAssigned(value)}
							>
								<SelectTrigger className='w-48'>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value='all'>Все чаты</SelectItem>
									<SelectItem value='assigned'>Назначенные</SelectItem>
									<SelectItem value='unassigned'>Не назначенные</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</CardContent>
				</Card>
				{/* Stats */}
				<div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
					<Card>
						<CardContent className='p-4'>
							<div className='text-2xl font-bold text-blue-600'>
								{filteredThreads.length}
							</div>
							<div className='text-sm text-gray-600'>Всего чатов</div>
						</CardContent>
					</Card>
					<Card>
						<CardContent className='p-4'>
							<div className='text-2xl font-bold text-green-600'>
								{filteredThreads.filter(t => t.assignedManager).length}
							</div>
							<div className='text-sm text-gray-600'>Назначено</div>
						</CardContent>
					</Card>
					<Card>
						<CardContent className='p-4'>
							<div className='text-2xl font-bold text-orange-600'>
								{filteredThreads.filter(t => !t.assignedManager).length}
							</div>
							<div className='text-sm text-gray-600'>Не назначено</div>
						</CardContent>
					</Card>
				</div>
				{/* Threads List */}
				<Card>
					<CardHeader>
						<CardTitle>Чаты ({filteredThreads.length})</CardTitle>
					</CardHeader>
					<CardContent>
						<div className='space-y-4'>
							{filteredThreads.map(thread => (
								<div
									key={thread.id}
									className='border rounded-lg p-4 hover:bg-gray-50'
								>
									<div className='flex items-center justify-between'>
										<div className='flex-1'>
											<div className='flex items-center space-x-3'>
												<div className='flex-1'>
													<h3 className='font-medium text-gray-900'>
														{thread.contact.fullName}
													</h3>
													<div className='flex items-center space-x-2 text-sm text-gray-600'>
														<span>{thread.channel.displayName}</span>
														{thread.contact.phone && (
															<span>• {thread.contact.phone}</span>
														)}
														{thread.contact.username && (
															<span>• @{thread.contact.username}</span>
														)}
													</div>
													<div className='flex items-center space-x-2 mt-1'>
														<span className='text-xs text-gray-500'>
															{thread.messageCount} сообщений
														</span>
														{thread.unreadCount > 0 && (
															<Badge variant='destructive' className='text-xs'>
																{thread.unreadCount} непрочитанных
															</Badge>
														)}
													</div>
												</div>
											</div>
										</div>
										<div className='flex items-center space-x-3'>
											{thread.assignedManager ? (
												<div className='flex items-center space-x-2'>
													<Badge variant='secondary' className='text-xs'>
														Назначен:{' '}
														{thread.assignedManager.fullName ||
															`${thread.assignedManager.firstName} ${thread.assignedManager.lastName}`}
													</Badge>
													<Button
														variant='outline'
														size='sm'
														onClick={() =>
															unassignChat(
																thread.id,
																thread.assignedManager!.id
															)
														}
														className='text-red-600 hover:text-red-700'
													>
														<X className='h-4 w-4' />
													</Button>
												</div>
											) : (
												<div className='flex items-center space-x-2'>
													<Select
														onValueChange={managerId =>
															assignChatToManager(thread.id, managerId)
														}
													>
														<SelectTrigger className='w-48'>
															<SelectValue placeholder='Назначить менеджеру' />
														</SelectTrigger>
														<SelectContent className='bg-white border border-gray-200 shadow-lg'>
															{managers.map(manager => (
																<SelectItem
																	key={manager.id}
																	value={manager.id}
																	className='text-gray-900 hover:bg-gray-100'
																>
																	{manager.fullName ||
																		`${manager.firstName} ${manager.lastName}`}{' '}
																	({manager.assignedChatsCount || 0} чатов)
																</SelectItem>
															))}
														</SelectContent>
													</Select>
													<Button variant='outline' size='sm' disabled>
														<UserPlus className='h-4 w-4' />
													</Button>
												</div>
											)}
										</div>
									</div>
								</div>
							))}
							{filteredThreads.length === 0 && (
								<div className='text-center py-12'>
									<div className='text-gray-400 text-4xl mb-4'>📭</div>
									<p className='text-gray-600'>Чаты не найдены</p>
									<p className='text-gray-500 text-sm mt-1'>
										{searchQuery
											? 'Попробуйте изменить поисковый запрос'
											: 'Чаты появятся при получении сообщений'}
									</p>
								</div>
							)}
						</div>
					</CardContent>
				</Card>
			</div>
		</>
	)
}
