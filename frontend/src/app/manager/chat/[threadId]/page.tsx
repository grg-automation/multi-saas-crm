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
		let isMounted = true

		if (threadId && isMounted) {
			console.log('🚀 Initializing chat for thread:', threadId)
			fetchChatData()
			initializeWebSocket()
		}

		return () => {
			isMounted = false
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
			const token = localStorage.getItem('accessToken')

			const response = await fetch(
				`http://localhost:3003/api/v1/thread/${threadId}/messages`,
				{
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${token}`, // Fixed typo in 'Authorization'
					},
				}
			)

			const responseData = await response.json()
			console.log('📨 Messages API Response:', responseData)

			if (response.ok) {
				// Update to handle paginated response structure
				const messages = responseData.content || []
				const formattedMessages: Message[] = messages.map(msg => ({
					id: msg.id || String(Date.now()),
					threadId: msg.threadId || threadId,
					content: msg.content || msg.text || '',
					senderId: msg.senderId || msg.from || 'unknown',
					senderName: msg.senderName || 'Unknown Sender',
					timestamp: msg.timestamp || msg.createdAt || new Date().toISOString(),
					direction: msg.direction ? msg.direction.toLowerCase() as 'inbound' | 'outbound' : (msg.senderId === currentUserId ? 'outbound' : 'inbound'),
				}))

				console.log('📝 Formatted Messages:', formattedMessages)
				console.log('🔍 Direction mapping check:')
				messages.forEach((msg, index) => {
					console.log(`  Message ${index + 1}:`, {
						id: msg.id,
						content: msg.content?.substring(0, 30) + '...',
						backendDirection: msg.direction,
						senderId: msg.senderId,
						currentUserId: currentUserId,
						finalDirection: msg.direction || (msg.senderId === currentUserId ? 'outbound' : 'inbound'),
						senderName: msg.senderName
					})
				})
				setMessages(formattedMessages)
			} else {
				console.error('❌ Failed to fetch messages:', responseData)
				setMessages([])
			}
		} catch (error) {
			console.error('❌ Error fetching messages:', error)
			setMessages([])
		}
	}

	const initializeWebSocket = () => {
		console.log('🔌 Initializing WebSocket connection to localhost:3003')

		const socket = io('http://localhost:3003', {
			transports: ['websocket'],
			path: '/socket.io',
			reconnection: true,
			reconnectionAttempts: 10,
			reconnectionDelay: 1000,
			timeout: 20000,
			// Add these options
			forceNew: true,
			autoConnect: true,
			withCredentials: true,
		})

		socketRef.current = socket

		socket.on('connect', () => {
			console.log('✅ Connected to WebSocket, socket ID:', socket.id)
			setSocketConnected(true)
			// Subscribe to general tenant updates
			socket.emit('subscribe', 'tenant_default')
			// Join specific thread for real-time chat
			socket.emit('join_thread', threadId)
			console.log(`🏠 Joining thread: ${threadId}`)
		})

		socket.on('subscribed', data => {
			console.log('✅ Subscribed to session:', data.sessionId)
		})

		socket.on('joined_thread', data => {
			console.log('✅ Joined thread:', data.threadId)
		})

		socket.on('new_message', data => {
			console.log('📨 Raw WebSocket message:', data)

			// Check if the message belongs to current thread
			if (data.threadId === threadId) {
				const newMsg: Message = {
					id: data.id || `ws_${Date.now()}`,
					threadId: data.threadId,
					content: data.content || data.text || data.message || '',
					senderId: data.senderId || data.from || 'unknown',
					senderName: data.senderName || 'Unknown Sender',
					timestamp: data.timestamp || new Date().toISOString(),
					direction: data.direction ? data.direction.toLowerCase() as 'inbound' | 'outbound' : (data.senderId === currentUserId ? 'outbound' : 'inbound'),
				}

				console.log('📝 Formatted WebSocket message:', newMsg)

				setMessages(prev => {
					// Avoid duplicates by checking ID and content
					const isDuplicate = prev.some(msg => 
						msg.id === newMsg.id || 
						(msg.content === newMsg.content && 
						 msg.senderId === newMsg.senderId && 
						 Math.abs(new Date(msg.timestamp).getTime() - new Date(newMsg.timestamp).getTime()) < 1000)
					)
					
					if (isDuplicate) {
						console.log('⚠️ Duplicate message skipped:', newMsg.id)
						return prev
					}
					
					console.log('✅ Adding new WebSocket message:', newMsg.id)
					return [...prev, newMsg]
				})
			} else {
				console.log('🚫 Message for different thread:', data.threadId, 'current:', threadId)
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
			// Add reconnection attempt
			setTimeout(() => {
				console.log('🔄 Attempting to reconnect...')
				socket.connect()
			}, 5000)
		})
	}

	const sendMessage = async () => {
		if (!newMessage.trim() || sending) return

		setSending(true)
		const messageContent = newMessage.trim()
		setNewMessage('') // Clear input immediately for better UX

		try {
			const messageData = {
				threadId: threadId,
				content: messageContent,
				senderId: currentUserId,
				senderName: currentUserId === 'manager_1' ? 'Manager' : currentUserId,
				timestamp: new Date().toISOString(),
			}

			console.log('📤 Sending message:', messageData)

			// Always send via HTTP API first to ensure persistence
			try {
				const response = await fetch(
					`http://localhost:3003/api/v1/thread/${threadId}/messages`,
					{
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
						},
						body: JSON.stringify(messageData),
					}
				)

				const responseData = await response.json()
				console.log('✅ HTTP API response:', responseData)

				if (response.ok) {
					// Message was saved successfully
					const savedMessage: Message = {
						id: responseData.id || Date.now().toString(),
						threadId: responseData.threadId || threadId,
						content: responseData.content || messageContent,
						senderId: responseData.senderId || currentUserId,
						senderName: responseData.senderName || 'Manager',
						timestamp: responseData.timestamp || responseData.sentAt || new Date().toISOString(),
						direction: 'outbound',
					}

					// Add to local state immediately
					setMessages(prev => [...prev, savedMessage])

					// Send via WebSocket for real-time updates to other clients only
					// Don't broadcast to self to avoid duplicates
					if (socketConnected && socketRef.current) {
						socketRef.current.emit('send_message', {
							...savedMessage,
							id: savedMessage.id
						})
					}
				} else {
					throw new Error(`HTTP request failed: ${response.status}`)
				}
			} catch (apiError) {
				console.error('❌ HTTP API failed:', apiError)
				
				// Fallback to WebSocket only
				if (socketConnected && socketRef.current) {
					const fallbackMessage: Message = {
						id: Date.now().toString(),
						threadId,
						content: messageContent,
						senderId: currentUserId,
						senderName: currentUserId === 'manager_1' ? 'Manager' : currentUserId,
						timestamp: new Date().toISOString(),
						direction: 'outbound',
					}

					setMessages(prev => [...prev, fallbackMessage])
					socketRef.current.emit('send_message', fallbackMessage)
					console.log('⚠️ Used WebSocket fallback')
				} else {
					// No connection available - add message locally with warning
					const localMessage: Message = {
						id: `local_${Date.now()}`,
						threadId,
						content: messageContent,
						senderId: currentUserId,
						senderName: 'Manager (Offline)',
						timestamp: new Date().toISOString(),
						direction: 'outbound',
					}
					setMessages(prev => [...prev, localMessage])
					console.error('❌ No connection available - message saved locally only')
				}
			}

		} catch (error) {
			console.error('❌ Error sending message:', error)
			setNewMessage(messageContent) // Restore message content on error
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

	const addTestMessage = () => {
		const testMessage: Message = {
			id: String(Date.now()),
			threadId: threadId,
			content: 'This is a test message',
			senderId: 'user456',
			senderName: 'Test User',
			timestamp: new Date().toISOString(),
			direction: 'inbound',
		}

		setMessages(prev => [...prev, testMessage])
	}

	const simulateIncomingMessage = () => {
		const mockWebSocketMessage = {
			id: `ws_${Date.now()}`,
			threadId: threadId,
			content: 'This is a simulated Telegram message',
			senderId: 'telegram_user',
			senderName: 'Telegram User',
			timestamp: new Date().toISOString(),
		}

		// Simulate WebSocket event
		if (socketRef.current) {
			socketRef.current.emit('new_message', mockWebSocketMessage)
		}
	}

	// Add this function after your existing functions
	const runTestSequence = () => {
		// Add initial message from user
		const userMessage: Message = {
			id: `test_${Date.now()}`,
			threadId: threadId,
			content: 'Hello! I need help with my order',
			senderId: 'user456',
			senderName: 'Test User',
			timestamp: new Date().toISOString(),
			direction: 'inbound',
		}
		setMessages(prev => [...prev, userMessage])

		// Simulate manager response after 1 second
		setTimeout(() => {
			const managerMessage: Message = {
				id: `test_${Date.now()}`,
				threadId: threadId,
				content: "Hi! I'm here to help. What's your order number?",
				senderId: 'manager_1',
				senderName: 'Manager',
				timestamp: new Date().toISOString(),
				direction: 'outbound',
			}
			setMessages(prev => [...prev, managerMessage])
		}, 1000)
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
								<Button size='sm' onClick={addTestMessage} className='ml-2'>
									Add Test Message
								</Button>
								<Button size='sm' onClick={runTestSequence} className='ml-2'>
									Run Test Chat
								</Button>
								<Button
									size='sm'
									onClick={simulateIncomingMessage}
									className='ml-2'
									disabled={!socketConnected}
								>
									Simulate Message
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
							className='flex-1'
						/>
						<Button
							onClick={sendMessage}
							disabled={!newMessage.trim() || sending}
							className='flex items-center gap-2'
						>
							<Send className='h-4 w-4' />
							{sending ? 'Sending...' : 'Send'}
						</Button>
					</div>
					{!socketConnected && (
						<p className='text-sm text-orange-500 mt-1'>
							⚠️ WebSocket disconnected - using HTTP API only
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
