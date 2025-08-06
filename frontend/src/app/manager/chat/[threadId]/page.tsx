'use client'
import AuthenticatedLayout from '@/components/layout/AuthenticatedLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { messagingApi } from '@/lib/messaging-api'
import { ArrowLeft, MessageCircle, Send, Settings, User } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import io from 'socket.io-client'

interface ChatInfo {
	title: string
	contact: string
	channel: 'telegram'
	status: string
}

interface Message {
	id: string
	threadId: string
	content: string
	senderId: string
	senderName: string
	timestamp: string
	direction: 'inbound' | 'outbound'
}

export default function ManagerChatPage() {
	const router = useRouter()
	const params = useParams()
	const threadId = params.threadId as string
	const [loading, setLoading] = useState(true)
	const [chatInfo, setChatInfo] = useState<ChatInfo | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [socketConnected, setSocketConnected] = useState(false)
	const [messages, setMessages] = useState<Message[]>([])
	const [newMessage, setNewMessage] = useState('')
	const [sending, setSending] = useState(false)

	// Testing controls
	const [currentUserId, setCurrentUserId] = useState('manager_1')
	const [showTestControls, setShowTestControls] = useState(false)
	const [testMessage, setTestMessage] = useState('')
	const [testUserId, setTestUserId] = useState('user456')

	const socketRef = useRef<any>(null)
	const messagesEndRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (threadId) {
			fetchChatData()
			initializeWebSocket()
		}

		return () => {
			if (socketRef.current) {
				console.log('🔌 Disconnecting WebSocket on cleanup')
				socketRef.current.disconnect()
			}
		}
	}, [threadId])

	useEffect(() => {
		scrollToBottom()
	}, [messages])

	const scrollToBottom = () => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
	}

	const fetchChatData = async () => {
		try {
			setLoading(true)
			setError(null)

			console.log('🔍 Fetching thread data for threadId:', threadId)

			// Try to get thread data
			const threadData = await messagingApi.getThread(threadId)
			console.log('✅ Thread data received:', threadData)

			setChatInfo({
				title:
					threadData.contact?.fullName ||
					threadData.contact?.name ||
					`User ${threadId.slice(-3)}`,
				contact:
					threadData.contact?.phone ||
					threadData.contact?.telegramId ||
					threadData.contact?.username ||
					'Contact',
				channel: 'telegram',
				status: threadData.status || 'OPEN',
			})

			// Try to get messages
			await fetchMessages()
		} catch (error) {
			console.error('❌ Error fetching chat data:', error)

			let errorMessage = 'Failed to load chat information'
			if (error.code === 'ECONNREFUSED') {
				errorMessage =
					'Cannot connect to messaging service (port 3000). Is it running?'
			} else if (error.response?.status === 404) {
				errorMessage = `Thread ${threadId} not found`
			}

			setError(errorMessage)

			// Fallback for development
			setChatInfo({
				title: `User ${threadId.slice(-3)}`,
				contact: 'Development Mode',
				channel: 'telegram',
				status: 'OPEN',
			})
		} finally {
			setLoading(false)
		}
	}

	const fetchMessages = async () => {
		try {
			console.log('📬 Fetching messages for thread:', threadId)

			// Try to get messages from your API
			const response = await fetch(
				`http://localhost:3000/api/threads/${threadId}/messages`
			)

			if (response.ok) {
				const messagesData = await response.json()
				console.log('📨 Messages received:', messagesData)
				// Ensure we always set an array
				setMessages(Array.isArray(messagesData) ? messagesData : [])
			} else {
				console.log('⚠️ No messages found or API not available')
				setMessages([])
			}
		} catch (error) {
			console.error('❌ Error fetching messages:', error)
			setMessages([])
		}
	}

	const initializeWebSocket = () => {
		console.log('🔌 Initializing WebSocket connection to localhost:3000')

		const socket = io('http://localhost:3000', {
			transports: ['websocket'],
			path: '/socket.io',
			reconnection: true,
			reconnectionAttempts: 10,
			reconnectionDelay: 1000,
			timeout: 20000,
		})

		socketRef.current = socket

		socket.on('connect', () => {
			console.log('✅ Connected to WebSocket, socket ID:', socket.id)
			setSocketConnected(true)
			socket.emit('subscribe', 'tenant_default')
			socket.emit('join_thread', threadId)
		})

		socket.on('subscribed', data => {
			console.log('✅ Subscribed to session:', data.sessionId)
		})

		socket.on('new_message', data => {
			console.log('📨 New message received via WebSocket:', data)

			// Check if the message belongs to current thread
			if (data.threadId === threadId) {
				const newMsg: Message = {
					id: data.id || Date.now().toString(),
					threadId: data.threadId,
					content: data.content || data.message,
					senderId: data.senderId || data.from,
					senderName: data.senderName || data.fromName || data.senderId,
					timestamp: data.timestamp || new Date().toISOString(),
					direction: data.senderId === currentUserId ? 'outbound' : 'inbound',
				}

				setMessages(prev => {
					// Avoid duplicates
					const exists = prev.some(msg => msg.id === newMsg.id)
					if (exists) return prev
					return [...prev, newMsg]
				})
			}
		})

		socket.on('message_sent', data => {
			console.log('✅ Message sent confirmation:', data)
			setSending(false)
		})

		socket.on('disconnect', reason => {
			console.log('❌ WebSocket disconnected:', reason)
			setSocketConnected(false)
		})

		socket.on('connect_error', error => {
			console.error('❌ WebSocket connection error:', error.message)
			setSocketConnected(false)
		})
	}

	const sendMessage = async () => {
		if (!newMessage.trim() || sending || !socketConnected) return

		setSending(true)

		try {
			const messageData = {
				threadId: threadId,
				content: newMessage.trim(),
				senderId: currentUserId,
				senderName: currentUserId === 'manager_1' ? 'Manager' : currentUserId,
				timestamp: new Date().toISOString(),
			}

			console.log('📤 Sending message:', messageData)

			// Send via WebSocket
			socketRef.current?.emit('send_message', messageData)

			// Also try to send via HTTP API as backup
			try {
				await fetch(`http://localhost:3000/api/threads/${threadId}/messages`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify(messageData),
				})
			} catch (apiError) {
				console.log('⚠️ HTTP API not available, using WebSocket only')
			}

			// Add to local state immediately for better UX
			const localMessage: Message = {
				id: Date.now().toString(),
				...messageData,
				direction: 'outbound',
			}

			setMessages(prev => [...prev, localMessage])
			setNewMessage('')
		} catch (error) {
			console.error('❌ Error sending message:', error)
		} finally {
			setSending(false)
		}
	}

	const sendTestMessage = async () => {
		if (!testMessage.trim() || !socketConnected) return

		const messageData = {
			threadId: threadId,
			content: testMessage.trim(),
			senderId: testUserId,
			senderName: testUserId === 'user456' ? 'User 456' : testUserId,
			timestamp: new Date().toISOString(),
		}

		console.log('🧪 Sending test message:', messageData)
		socketRef.current?.emit('send_message', messageData)

		setTestMessage('')
	}

	if (loading) {
		return (
			<AuthenticatedLayout>
				<div className='p-6'>
					<div className='flex items-center justify-center h-64'>
						<div className='text-center'>
							<MessageCircle className='h-8 w-8 text-gray-400 mx-auto mb-2 animate-pulse' />
							<p className='text-gray-500'>Loading chat...</p>
							<p className='text-xs text-gray-400 mt-1'>
								Thread ID: {threadId}
							</p>
						</div>
					</div>
				</div>
			</AuthenticatedLayout>
		)
	}

	if (error) {
		return (
			<AuthenticatedLayout>
				<div className='p-6'>
					<div className='flex items-center justify-center h-64'>
						<div className='text-center'>
							<MessageCircle className='h-8 w-8 text-red-400 mx-auto mb-2' />
							<p className='text-red-500 mb-2'>{error}</p>
							<p className='text-xs text-gray-400 mb-4'>
								Thread ID: {threadId}
							</p>
							<div className='space-x-2'>
								<Button onClick={fetchChatData} variant='outline' size='sm'>
									Retry Connection
								</Button>
								<Button onClick={() => router.back()} variant='ghost' size='sm'>
									Go Back
								</Button>
							</div>
						</div>
					</div>
				</div>
			</AuthenticatedLayout>
		)
	}

	return (
		<AuthenticatedLayout>
			<div className='flex flex-col h-screen'>
				{/* Chat Header */}
				<div className='flex items-center gap-4 p-4 border-b border-gray-200 bg-white'>
					<Button
						variant='ghost'
						size='sm'
						onClick={() => router.back()}
						className='flex items-center gap-2'
					>
						<ArrowLeft className='h-4 w-4' />
						Back to Chats
					</Button>

					<div className='flex items-center gap-3 flex-1'>
						<div className='w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-lg'>
							📱
						</div>
						<div className='flex-1'>
							<h1 className='text-lg font-bold'>{chatInfo?.title}</h1>
							<div className='flex items-center gap-3 text-sm text-gray-600'>
								<span>{chatInfo?.contact}</span>
								<Badge className='bg-blue-100 text-blue-800 text-xs'>
									Telegram
								</Badge>
								<Badge variant='secondary' className='text-xs'>
									{chatInfo?.status}
								</Badge>
								<div className='flex items-center gap-1'>
									<div
										className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-green-500' : 'bg-red-500'}`}
									></div>
									<span className='text-xs'>
										{socketConnected ? 'Connected' : 'Disconnected'}
									</span>
								</div>
							</div>
						</div>
					</div>

					{/* Test Controls Toggle */}
					<Button
						variant='outline'
						size='sm'
						onClick={() => setShowTestControls(!showTestControls)}
						className='flex items-center gap-2'
					>
						<Settings className='h-4 w-4' />
						Test
					</Button>
				</div>

				{/* Test Controls Panel */}
				{showTestControls && (
					<div className='p-4 bg-gray-50 border-b border-gray-200'>
						<div className='space-y-3'>
							<div className='flex items-center gap-2 text-sm'>
								<User className='h-4 w-4' />
								<span>Current User:</span>
								<select
									value={currentUserId}
									onChange={e => setCurrentUserId(e.target.value)}
									className='px-2 py-1 border rounded text-sm'
								>
									<option value='manager_1'>Manager (manager_1)</option>
									<option value='user456'>User 456</option>
									<option value='admin'>Admin</option>
								</select>
							</div>

							<div className='flex gap-2'>
								<Input
									placeholder='Test message from user456...'
									value={testMessage}
									onChange={e => setTestMessage(e.target.value)}
									className='text-sm'
									onKeyPress={e => e.key === 'Enter' && sendTestMessage()}
								/>
								<select
									value={testUserId}
									onChange={e => setTestUserId(e.target.value)}
									className='px-2 py-1 border rounded text-sm'
								>
									<option value='user456'>user456</option>
									<option value='manager_1'>manager_1</option>
									<option value='admin'>admin</option>
								</select>
								<Button
									size='sm'
									onClick={sendTestMessage}
									disabled={!testMessage.trim()}
								>
									Send Test
								</Button>
							</div>
						</div>
					</div>
				)}

				{/* Messages Area */}
				<div className='flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50'>
					{!Array.isArray(messages) || messages.length === 0 ? (
						<div className='flex items-center justify-center h-full text-gray-500'>
							<div className='text-center'>
								<MessageCircle className='h-12 w-12 mx-auto mb-2 opacity-50' />
								<p>No messages yet</p>
								<p className='text-sm'>Start a conversation!</p>
							</div>
						</div>
					) : (
						messages.map(message => (
							<div
								key={message.id}
								className={`flex ${message.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
							>
								<div
									className={`max-w-[70%] rounded-lg p-3 ${
										message.direction === 'outbound'
											? 'bg-blue-500 text-white'
											: 'bg-white text-gray-900 shadow-sm'
									}`}
								>
									<div className='flex items-center gap-2 mb-1'>
										<span className='text-xs opacity-75 font-medium'>
											{message.senderName}
										</span>
										<span className='text-xs opacity-50'>
											{new Date(message.timestamp).toLocaleTimeString()}
										</span>
									</div>
									<p>{message.content}</p>
								</div>
							</div>
						))
					)}
					<div ref={messagesEndRef} />
				</div>

				{/* Message Input */}
				<div className='p-4 border-t border-gray-200 bg-white'>
					<div className='flex gap-2'>
						<Input
							placeholder='Введите сообщение...'
							value={newMessage}
							onChange={e => setNewMessage(e.target.value)}
							onKeyPress={e =>
								e.key === 'Enter' && !e.shiftKey && sendMessage()
							}
							disabled={!socketConnected}
							className='flex-1'
						/>
						<Button
							onClick={sendMessage}
							disabled={!newMessage.trim() || sending || !socketConnected}
							className='flex items-center gap-2'
						>
							<Send className='h-4 w-4' />
							{sending ? 'Sending...' : 'Send'}
						</Button>
					</div>
					{!socketConnected && (
						<p className='text-sm text-red-500 mt-1'>
							WebSocket disconnected - messages cannot be sent
						</p>
					)}
				</div>

				{/* Privacy Notice */}
				<div className='p-3 bg-yellow-50 border-t border-yellow-200'>
					<p className='text-sm text-yellow-800'>
						🔒 <strong>Privacy:</strong> Telegram chats are anonymized per
						security policy.
					</p>
				</div>
			</div>
		</AuthenticatedLayout>
	)
}
