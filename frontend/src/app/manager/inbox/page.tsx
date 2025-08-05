'use client'

import AuthenticatedLayout from '@/components/layout/AuthenticatedLayout' // ✅ RESTORED
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { CheckCircle, Clock, MessageCircle, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

interface AnonymizedThread {
	id: string
	subject: string
	contact: {
		fullName: string
	}
	channel: {
		displayName: string
		type: string
	}
	messageCount: number
	unreadCount: number
	lastMessageAt: string
	status: 'OPEN' | 'PENDING' | 'RESOLVED'
}

export default function ManagerInboxPage() {
	const router = useRouter()
	const [threads, setThreads] = useState<AnonymizedThread[]>([])
	const [searchQuery, setSearchQuery] = useState('')
	const [statusFilter, setStatusFilter] = useState<
		'all' | 'unread' | 'assigned'
	>('all')
	const [loading, setLoading] = useState(true)
	const [selectedThread, setSelectedThread] = useState<string | null>(null)

	useEffect(() => {
		// Simplified auth check since AuthenticatedLayout handles the main auth
		const token = localStorage.getItem('accessToken')
		if (token) {
			fetchThreads()
		} else {
			setLoading(false)
		}
	}, [])

	const fetchThreads = async () => {
		try {
			setLoading(true)

			const token = localStorage.getItem('accessToken')
			if (!token) {
				console.log('❌ MANAGER PAGE: No token available for API call')
				return
			}

			let user
			try {
				const payload = JSON.parse(atob(token.split('.')[1]))
				user = {
					id: payload.sub || payload.userId || payload.id,
					role: payload.role,
				}
				console.log('👤 MANAGER PAGE: User from token:', user)
			} catch (error) {
				console.error(
					'❌ MANAGER PAGE: Failed to parse user from token:',
					error
				)
				return
			}

			const headers = {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			}

			console.log('📡 MANAGER PAGE: Fetching assigned threads for manager...')

			const managerId = user.id
			if (!managerId) {
				console.error('❌ MANAGER PAGE: Manager ID not found in token:', user)
				return
			}

			console.log('🆔 MANAGER PAGE: Manager ID:', managerId)

			try {
				// 1. Get assigned thread IDs
				const assignedResponse = await fetch(
					`http://localhost:3001/api/v1/manager/assigned-thread-ids?managerId=${managerId}`,
					{ headers }
				)

				if (!assignedResponse.ok) {
					console.warn(
						'Failed to get assigned threads:',
						assignedResponse.status
					)
					// Set empty threads if API call fails
					setThreads([])
					return
				}

				const assignedData = await assignedResponse.json()
				const assignedThreadIds = assignedData.data || []
				console.log('Assigned thread IDs:', assignedThreadIds)

				if (assignedThreadIds.length === 0) {
					console.log('No assigned threads for this manager')
					setThreads([])
					return
				}

				// 2. Get Telegram threads
				const { messagingApi } = await import('@/lib/messaging-api')
				const telegramThreads = await messagingApi.getInboxThreads()

				// 3. Filter assigned chats
				const assignedChats =
					telegramThreads.content?.filter((thread: any) => {
						const threadId = thread.id?.toString()
						return (
							assignedThreadIds.includes(threadId) ||
							assignedThreadIds.includes(`telegram_thread_${threadId}`)
						)
					}) || []

				console.log('Filtered assigned chats:', assignedChats.length)

				// 4. Anonymize data
				const anonymizedChats = assignedChats.map(
					(chat: any, index: number) => ({
						id: chat.id,
						subject: `Диалог #${index + 1}`,
						contact: {
							fullName: `Контакт #${index + 1}`,
						},
						channel: {
							displayName: 'Telegram',
							type: 'TELEGRAM',
						},
						messageCount: chat.messageCount || 0,
						unreadCount: chat.unreadCount || 0,
						lastMessageAt: chat.lastMessageAt || new Date().toISOString(),
						status: 'OPEN' as const,
					})
				)

				setThreads(anonymizedChats)
				console.log('✅ MANAGER PAGE: Threads loaded successfully')
			} catch (apiError) {
				console.error('❌ MANAGER PAGE: API error, using mock data:', apiError)

				// Fallback to mock data if API fails
				setThreads([
					{
						id: '1',
						subject: 'Test Dialog',
						contact: { fullName: 'Контакт #1' },
						channel: { displayName: 'Telegram', type: 'TELEGRAM' },
						messageCount: 5,
						unreadCount: 2,
						lastMessageAt: new Date().toISOString(),
						status: 'OPEN',
					},
				])
			}
		} catch (error) {
			console.error('❌ MANAGER PAGE: Error in fetchThreads:', error)
		} finally {
			setLoading(false)
		}
	}

	const filteredThreads = threads.filter(thread => {
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase()
			const matchesSearch =
				thread.contact.fullName.toLowerCase().includes(query) ||
				thread.subject.toLowerCase().includes(query)

			if (!matchesSearch) return false
		}

		if (statusFilter === 'unread' && thread.unreadCount === 0) return false
		if (statusFilter === 'assigned' && thread.status !== 'OPEN') return false

		return true
	})

	const formatDate = (dateString: string) => {
		const date = new Date(dateString)
		const now = new Date()
		const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60)

		if (diffInHours < 1) {
			return 'Только что'
		} else if (diffInHours < 24) {
			return `${Math.floor(diffInHours)} ч назад`
		} else {
			return date.toLocaleDateString('ru-RU', {
				day: 'numeric',
				month: 'short',
				hour: '2-digit',
				minute: '2-digit',
			})
		}
	}

	const getStatusIcon = (status: string) => {
		switch (status) {
			case 'OPEN':
				return <MessageCircle className='h-4 w-4 text-green-600' />
			case 'PENDING':
				return <Clock className='h-4 w-4 text-orange-600' />
			case 'RESOLVED':
				return <CheckCircle className='h-4 w-4 text-gray-600' />
			default:
				return <MessageCircle className='h-4 w-4 text-gray-600' />
		}
	}

	const getStatusText = (status: string) => {
		switch (status) {
			case 'OPEN':
				return 'Активен'
			case 'PENDING':
				return 'Ожидает'
			case 'RESOLVED':
				return 'Закрыт'
			default:
				return status
		}
	}

	if (loading) {
		return (
			<AuthenticatedLayout>
				<div className='p-6'>
					<div className='flex items-center justify-center h-64'>
						<div className='text-center'>
							<div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto'></div>
							<p className='mt-2 text-gray-600'>Загрузка...</p>
						</div>
					</div>
				</div>
			</AuthenticatedLayout>
		)
	}

	return (
		<AuthenticatedLayout>
			<div className='p-6 space-y-6'>
				{/* Header */}
				<div className='flex items-center justify-between'>
					<div>
						<h1 className='text-2xl font-bold text-gray-900'>Мои чаты</h1>
						<p className='text-gray-600'>
							Назначенные вам диалоги для обработки
						</p>
					</div>
					<div className='flex items-center space-x-2'>
						<MessageCircle className='h-5 w-5 text-gray-400' />
						<span className='text-sm text-gray-600'>
							{threads.length} чатов
						</span>
					</div>
				</div>

				{/* Search and Filters */}
				<Card>
					<CardContent className='p-4'>
						<div className='flex flex-col md:flex-row gap-4'>
							<div className='relative flex-1'>
								<Search className='absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400' />
								<Input
									type='text'
									placeholder='Поиск по контакту или теме...'
									value={searchQuery}
									onChange={e => setSearchQuery(e.target.value)}
									className='pl-10'
								/>
							</div>

							<div className='flex space-x-2'>
								<Button
									variant={statusFilter === 'all' ? 'default' : 'outline'}
									size='sm'
									onClick={() => setStatusFilter('all')}
								>
									Все ({threads.length})
								</Button>
								<Button
									variant={statusFilter === 'unread' ? 'default' : 'outline'}
									size='sm'
									onClick={() => setStatusFilter('unread')}
								>
									Непрочитанные ({threads.filter(t => t.unreadCount > 0).length}
									)
								</Button>
								<Button
									variant={statusFilter === 'assigned' ? 'default' : 'outline'}
									size='sm'
									onClick={() => setStatusFilter('assigned')}
								>
									Активные ({threads.filter(t => t.status === 'OPEN').length})
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Stats */}
				<div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
					<Card>
						<CardContent className='p-4'>
							<div className='text-2xl font-bold text-blue-600'>
								{threads.length}
							</div>
							<div className='text-sm text-gray-600'>Всего чатов</div>
						</CardContent>
					</Card>
					<Card>
						<CardContent className='p-4'>
							<div className='text-2xl font-bold text-orange-600'>
								{threads.filter(t => t.unreadCount > 0).length}
							</div>
							<div className='text-sm text-gray-600'>Непрочитанных</div>
						</CardContent>
					</Card>
					<Card>
						<CardContent className='p-4'>
							<div className='text-2xl font-bold text-green-600'>
								{threads.filter(t => t.status === 'OPEN').length}
							</div>
							<div className='text-sm text-gray-600'>Активных</div>
						</CardContent>
					</Card>
					<Card>
						<CardContent className='p-4'>
							<div className='text-2xl font-bold text-gray-600'>
								{threads.filter(t => t.status === 'RESOLVED').length}
							</div>
							<div className='text-sm text-gray-600'>Закрытых</div>
						</CardContent>
					</Card>
				</div>

				{/* Threads List */}
				<Card>
					<CardHeader>
						<CardTitle>Чаты ({filteredThreads.length})</CardTitle>
					</CardHeader>
					<CardContent>
						<div className='space-y-2'>
							{filteredThreads.map(thread => (
								<div
									key={thread.id}
									className={`border rounded-lg p-4 cursor-pointer transition-colors hover:bg-gray-50 ${
										selectedThread === thread.id
											? 'bg-blue-50 border-blue-200'
											: ''
									}`}
									onClick={() => router.push(`/manager/chat/${thread.id}`)}
								>
									<div className='flex items-center justify-between'>
										<div className='flex-1'>
											<div className='flex items-center space-x-3'>
												<div className='flex-shrink-0'>
													{getStatusIcon(thread.status)}
												</div>
												<div className='flex-1 min-w-0'>
													<h3 className='font-medium text-gray-900 truncate'>
														{thread.contact.fullName}
													</h3>
													<div className='flex items-center space-x-2 text-sm text-gray-600'>
														<span>{thread.channel.displayName}</span>
														<span>•</span>
														<span>{getStatusText(thread.status)}</span>
														<span>•</span>
														<span>{formatDate(thread.lastMessageAt)}</span>
													</div>
													{thread.subject && (
														<p className='text-sm text-gray-500 truncate mt-1'>
															{thread.subject}
														</p>
													)}
												</div>
											</div>
										</div>

										<div className='flex items-center space-x-3 flex-shrink-0'>
											<div className='text-right'>
												<div className='text-sm text-gray-600'>
													{thread.messageCount} сообщений
												</div>
												{thread.unreadCount > 0 && (
													<Badge variant='destructive' className='text-xs mt-1'>
														{thread.unreadCount} новых
													</Badge>
												)}
											</div>
										</div>
									</div>
								</div>
							))}

							{filteredThreads.length === 0 && (
								<div className='text-center py-12'>
									<div className='text-gray-400 text-4xl mb-4'>📭</div>
									<p className='text-gray-600'>
										{searchQuery ? 'Чаты не найдены' : 'Нет назначенных чатов'}
									</p>
									<p className='text-gray-500 text-sm mt-1'>
										{searchQuery
											? 'Попробуйте изменить поисковый запрос'
											: 'Чаты появятся когда администратор назначит их вам'}
									</p>
								</div>
							)}
						</div>
					</CardContent>
				</Card>

				{/* Privacy Notice */}
				<Card className='border-yellow-200 bg-yellow-50'>
					<CardContent className='p-4'>
						<div className='flex items-start space-x-3'>
							<div className='text-yellow-600 text-lg'>🔒</div>
							<div>
								<h4 className='font-medium text-yellow-800'>
									Конфиденциальность
								</h4>
								<p className='text-sm text-yellow-700 mt-1'>
									Контакты анонимизированы в соответствии с политикой
									безопасности. Номера телефонов и персональные данные скрыты.
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</AuthenticatedLayout>
	)
}
