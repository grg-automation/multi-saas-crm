'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { MessageInput } from './MessageInput'
import { useWebSocket } from '@/hooks/useWebSocket'
import { getSessionIdByThreadId, isTelegramThread } from '@/lib/websocket-utils'

interface Message {
  id: string
  threadId: string
  direction: 'INBOUND' | 'OUTBOUND'
  content?: string
  messageType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT'
  senderName?: string
  sentAt: string
  deliveredAt?: string
  readAt?: string
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'
  isInbound: boolean
  isOutbound: boolean
  sentimentLabel?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | 'MIXED'
  fileName?: string    // Реальное имя файла для медиа сообщений
  fileSize?: number    // Размер файла в байтах
  mimeType?: string    // MIME тип файла
}

interface Thread {
  id: string
  status: 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED'
  contact?: {
    id: string
    fullName: string
    phone?: string
    email?: string
  }
  channel?: {
    type: 'TELEGRAM' | 'WHATSAPP' | 'EMAIL' | 'SMS'
    displayName?: string
  }
  unreadCount: number
}

interface MessageViewProps {
  threadId: string
  currentUserId: string
}

export function MessageView({ threadId, currentUserId }: MessageViewProps) {
  console.log('🚀 MessageView rendered with threadId:', threadId);
  
  const [thread, setThread] = useState<Thread | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Отладка WebSocket
  console.log('🔍 MessageView Debug:', { 
    threadId, 
    isTelegramThread: isTelegramThread(threadId || ''),
    sessionId,
    shouldConnect: !!threadId && isTelegramThread(threadId || '') && !!sessionId
  });

  // Получаем sessionId для Telegram тредов
  useEffect(() => {
    if (threadId && isTelegramThread(threadId)) {
      getSessionIdByThreadId(threadId).then(id => {
        setSessionId(id);
        console.log('🔗 SessionId resolved for threadId:', threadId, '→', id);
      });
    } else {
      setSessionId(null);
    }
  }, [threadId]);

  useEffect(() => {
    if (threadId) {
      console.log('🚀 MessageView effect triggered for threadId:', threadId)
      
      // Создаем AbortController для отмены запросов при смене threadId
      const abortController = new AbortController()
      
      fetchThread()
      // Загружаем сообщения автоматически
      fetchMessages(abortController.signal)
      console.log('✅ Автозагрузка сообщений включена')
      markAsRead()
      
      // ОТКЛЮЧЕНО: Auto-refresh ломает отправку файлов
      // Автообновление перезаписывает состояние messages и сбрасывает UI
      // TODO: Реализовать более умное обновление только новых сообщений
      const interval = null // autoRefresh ? setInterval(() => {
      //   if (!document.hidden && document.hasFocus()) {
      //     // Вместо fetchMessages() нужно проверять только новые сообщения
      //     // fetchMessages(abortController.signal)
      //   }
      // }, 15000) : null
      
      return () => {
        console.log('🧹 Cleanup: aborting requests for threadId:', threadId)
        abortController.abort()
        if (interval) clearInterval(interval)
      }
    }
  }, [threadId, autoRefresh])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const fetchThread = async () => {
    try {
      // Try real API first, fallback to mock if Core CRM is not running
      try {
        const { messagingApi } = await import('@/lib/messaging-api')
        const threadData = await messagingApi.getThread(threadId)
        setThread(threadData)
      } catch (apiError) {
        console.warn('Core CRM API not available for thread, using mock data:', apiError)
        
        // Fallback to mock data
        const mockThread: Thread = {
          id: threadId,
          status: 'OPEN',
          contact: {
            id: 'c1',
            fullName: 'Иван Петров',
            phone: '+7-900-123-45-67'
          },
          channel: {
            type: 'TELEGRAM',
            displayName: 'Telegram: @ivan_petrov'
          },
          unreadCount: 3
        }
        setThread(mockThread)
      }
    } catch (error) {
      console.error('Error fetching thread:', error)
    }
  }

  const fetchMessages = useCallback(async (abortSignal?: AbortSignal) => {
    try {
      setLoading(true)
      console.log('🔄 Fetching messages for threadId:', threadId)

      // Check if request was cancelled
      if (abortSignal?.aborted) {
        console.log('🚫 Message fetch cancelled for threadId:', threadId)
        return
      }

      // Try real API first, fallback to mock if Core CRM is not running
      try {
        const { messagingApi } = await import('@/lib/messaging-api')
        const response = await messagingApi.getThreadMessages(threadId)
        
        // Check again if request was cancelled before setting state
        if (abortSignal?.aborted) {
          console.log('🚫 Message fetch cancelled after API call for threadId:', threadId)
          return
        }
        
        setMessages(response.content)
        console.log('✅ Messages loaded for threadId:', threadId, '- count:', response.content.length)
      } catch (apiError) {
        if (abortSignal?.aborted) {
          console.log('🚫 Message fetch cancelled during API error for threadId:', threadId)
          return
        }
        
        console.warn('Core CRM API not available for messages, using mock data:', apiError)
        
        // Fallback to mock data
        const { mockMessagingApi } = await import('@/lib/messaging-api')
        const response = await mockMessagingApi.getThreadMessages()
        
        if (!abortSignal?.aborted) {
          setMessages(response.content)
        }
      }
    } catch (error) {
      if (!abortSignal?.aborted) {
        console.error('Error fetching messages:', error)
      }
    } finally {
      if (!abortSignal?.aborted) {
        setLoading(false)
      }
    }
  }, [threadId])

  // Стабильная функция для WebSocket обновлений  
  const handleWebSocketUpdate = useCallback((update: any) => {
    console.log('📨 Real-time update received:', update);
    
    // ✅ ВКЛЮЧЕНО: Smart Polling решил проблему FLOOD_WAIT
    if (update.type === 'new_message' || update.type === 'file_uploaded') {
      console.log('🔄 Auto-refreshing messages due to real-time update');
      fetchMessages();
    }
  }, [fetchMessages]);

  // WebSocket для real-time обновлений (для всех Telegram тредов)
  const { isConnected } = useWebSocket({
    sessionId: sessionId,
    onUpdate: handleWebSocketUpdate,
    enabled: !!threadId && isTelegramThread(threadId) && !!sessionId, // Включаем для всех Telegram тредов с активной сессией
  });

  const markAsRead = async () => {
    try {
      // Try real API first
      try {
        const { messagingApi } = await import('@/lib/messaging-api')
        await messagingApi.markThreadAsRead(threadId)
        console.log('Thread marked as read:', threadId)
      } catch (apiError) {
        console.warn('Core CRM API not available for mark as read:', apiError)
      }
    } catch (error) {
      console.error('Error marking as read:', error)
    }
  }

  const handleSendMessage = async (content: string, files?: File[]) => {
    if ((!content.trim() && (!files || files.length === 0)) || sending) return

    setSending(true)
    
    try {
      // Если есть текстовое сообщение, отправляем его первым
      if (content.trim()) {
        const textTempId = `temp_text_${Date.now()}`
        const textMessage: Message = {
          id: textTempId,
          threadId,
          direction: 'OUTBOUND',
          content: content.trim(),
          messageType: 'TEXT',
          senderName: 'Менеджер',
          sentAt: new Date().toISOString(),
          status: 'QUEUED',
          isInbound: false,
          isOutbound: true
        }
        
        setMessages(prev => [...prev, textMessage])
        
        // Отправляем текстовое сообщение
        await sendMessageToAPI(textMessage, null)
      }
      
      // Если есть файлы, отправляем каждый как отдельное сообщение
      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          const tempId = `temp_file_${Date.now()}_${i}`
          
          // Определяем тип сообщения
          let messageType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' = 'DOCUMENT'
          
          if (file.type.startsWith('image/')) {
            messageType = 'IMAGE'
          } else if (file.type.startsWith('video/')) {
            messageType = 'VIDEO'
          } else if (file.type.startsWith('audio/')) {
            messageType = 'AUDIO'
          } else {
            messageType = 'DOCUMENT'
          }
          
          const fileMessage: Message = {
            id: tempId,
            threadId,
            direction: 'OUTBOUND',
            content: file.name,
            messageType,
            senderName: 'Менеджер',
            sentAt: new Date().toISOString(),
            status: 'QUEUED',
            isInbound: false,
            isOutbound: true,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type
          }

          // Optimistically add message
          setMessages(prev => [...prev, fileMessage])
          
          // Отправляем файл с небольшой задержкой между файлами
          await sendMessageToAPI(fileMessage, file)
          if (i < files.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500)) // 500ms задержка
          }
        }
      }
      
    } catch (error) {
      console.error('Error sending message:', error)
    } finally {
      setSending(false)
    }
  }
  
  // Вспомогательная функция для отправки сообщения
  const sendMessageToAPI = async (message: Message, file?: File | null) => {
    try {
      // For Telegram threads, use specific Telegram API for file uploads
      if (isTelegramThread(threadId) && file) {
        const { sendTelegramFile } = await import('@/lib/telegram-inbox-api')
        const { getSessionIdByThreadId } = await import('@/lib/websocket-utils')
        
        const sessionId = await getSessionIdByThreadId(threadId)
        if (!sessionId) {
          throw new Error('No session ID found for Telegram thread')
        }
        
        // Extract chatId from threadId (format: telegram_thread_CHATID) 
        const match = threadId.match(/telegram_thread_(\d+)/)
        if (!match) {
          throw new Error('Invalid Telegram thread ID format')
        }
        const chatId = match[1]
        
        const result = await sendTelegramFile(sessionId, chatId, file, message.content || undefined)
        
        // Replace temp message with real one
        setMessages(prev => 
          prev.map(msg => 
            msg.id === message.id 
              ? { 
                  ...msg, 
                  id: result.messageId.toString(),
                  status: 'SENT' as const, 
                  deliveredAt: new Date().toISOString(),
                  fileName: result.fileName,
                  fileSize: result.fileSize
                }
              : msg
          )
        )
      } else {
        // For non-Telegram or text messages, use regular messaging API
        const { messagingApi } = await import('@/lib/messaging-api')
        const sentMessage = await messagingApi.sendMessage(
          threadId,
          message.content || '',
          currentUserId,
          'Менеджер',
          message.messageType,
          file
        )
        
        // Replace temp message with real one
        setMessages(prev => 
          prev.map(msg => 
            msg.id === message.id ? sentMessage : msg
          )
        )
      }
    } catch (apiError) {
      console.warn('API not available for sending message:', apiError)
      
      // Fallback: just update status to simulate sending
      setTimeout(() => {
        setMessages(prev => 
          prev.map(msg => 
            msg.id === message.id 
              ? { ...msg, status: 'SENT' as const, deliveredAt: new Date().toISOString() }
              : msg
          )
        )
      }, 1000)
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('ru-RU', { 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return 'Сегодня'
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Вчера'
    } else {
      return date.toLocaleDateString('ru-RU')
    }
  }

  const getStatusIcon = (message: Message) => {
    if (message.isInbound) return null

    switch (message.status) {
      case 'QUEUED': return '⏳'
      case 'SENT': return '✓'
      case 'DELIVERED': return '✓✓'
      case 'READ': return '✅'
      case 'FAILED': return '❌'
      default: return null
    }
  }

  const getSentimentColor = (sentiment?: string) => {
    switch (sentiment) {
      case 'POSITIVE': return 'border-l-green-400'
      case 'NEGATIVE': return 'border-l-red-400'
      case 'MIXED': return 'border-l-yellow-400'
      default: return 'border-l-gray-300'
    }
  }

  const handleDownloadFile = async (messageId: string, fileName?: string) => {
    try {
      console.log(`📥 Starting download for message: ${messageId}`);
      
      // Извлекаем chatId из threadId для Telegram
      let chatId: string | undefined;
      if (threadId && isTelegramThread(threadId)) {
        // threadId имеет формат telegram_thread_925339638
        const match = threadId.match(/telegram_thread_(\d+)/);
        if (match) {
          chatId = match[1];
          console.log(`📥 Extracted chatId: ${chatId} from threadId: ${threadId}`);
        }
      }

      if (!chatId) {
        throw new Error('Cannot determine chatId for file download');
      }
      
      // Импортируем функцию скачивания
      const { downloadTelegramFile } = await import('@/lib/telegram-inbox-api');
      
      // Скачиваем файл
      const fileData = await downloadTelegramFile(messageId, chatId);
      
      // Создаем Blob из base64 данных
      const binaryString = atob(fileData.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const blob = new Blob([bytes], { type: fileData.contentType });
      
      // Создаем ссылку для скачивания
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName || fileData.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log(`✅ File downloaded: ${fileData.fileName}`);
    } catch (error) {
      console.error('Failed to download file:', error);
      alert(`Ошибка скачивания: ${error.message}`);
    }
  }

  const getChannelIcon = (type?: string) => {
    switch (type) {
      case 'TELEGRAM': return '📱'
      case 'WHATSAPP': return '💚'
      case 'EMAIL': return '📧'
      case 'SMS': return '📲'
      default: return '💬'
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Загрузка сообщений...</p>
        </div>
      </div>
    )
  }

  if (!thread) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-600">Диалог не найден</p>
      </div>
    )
  }

  // Group messages by date
  const groupedMessages = messages.reduce((groups, message) => {
    const date = formatDate(message.sentAt)
    if (!groups[date]) {
      groups[date] = []
    }
    groups[date].push(message)
    return groups
  }, {} as Record<string, Message[]>)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">
              {getChannelIcon(thread.channel?.type)}
            </span>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {thread.contact?.fullName}
              </h2>
              <p className="text-sm text-gray-600">
                {thread.channel?.displayName}
                {/* WebSocket статус */}
                <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  isConnected 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full mr-1 ${
                    isConnected ? 'bg-green-400' : 'bg-red-400'
                  }`} />
                  {isConnected ? 'Real-time' : 'Offline'}
                </span>
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <span className={`px-3 py-1 text-xs font-medium rounded-full ${
              thread.status === 'OPEN' ? 'bg-green-100 text-green-800' :
              thread.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {thread.status}
            </span>
            
            {/* Auto-refresh toggle */}
            <div className="flex items-center space-x-2">
              <span className="text-xs text-gray-600">Авто</span>
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                  autoRefresh ? 'bg-blue-600' : 'bg-gray-300'
                }`}
                title={`${autoRefresh ? 'Отключить' : 'Включить'} автообновление`}
              >
                <span className={`inline-block h-2 w-2 transform rounded-full bg-white transition-transform ${
                  autoRefresh ? 'translate-x-4' : 'translate-x-1'
                }`} />
              </button>
            </div>
            
            <button 
              onClick={() => fetchMessages()}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
              title="Обновить сообщения"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {Object.entries(groupedMessages).map(([date, dayMessages]) => (
          <div key={date}>
            {/* Date separator */}
            <div className="flex items-center justify-center my-4">
              <div className="bg-gray-100 px-3 py-1 rounded-full text-xs text-gray-600">
                {date}
              </div>
            </div>

            {/* Messages for this date */}
            <div className="space-y-3">
              {dayMessages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.isOutbound ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                      message.isOutbound
                        ? 'bg-blue-600 text-white'
                        : `bg-white border-l-4 ${getSentimentColor(message.sentimentLabel)} shadow-sm`
                    }`}
                  >
                    {message.isInbound && (
                      <p className="text-xs text-gray-600 mb-1 font-medium">
                        {message.senderName}
                      </p>
                    )}
                    
                    {/* Отображение сообщения в зависимости от типа */}
                    {message.messageType === 'IMAGE' ? (
                      <div className="space-y-2">
                        <div className="bg-gray-100 rounded-lg p-2 text-center relative group">
                          <svg className="w-8 h-8 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <p className="text-xs text-gray-600">🖼️ {message.fileName || 'Изображение'}</p>
                          <button
                            onClick={() => handleDownloadFile(message.id, message.fileName || `image_${message.id}.jpg`)}
                            className="absolute top-2 right-2 bg-blue-500 hover:bg-blue-600 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Скачать изображение"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </button>
                        </div>
                        {message.content && message.content.trim() && (
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        )}
                      </div>
                    ) : message.messageType === 'VIDEO' ? (
                      <div className="space-y-2">
                        <div className="bg-gray-100 rounded-lg p-2 text-center relative group">
                          <svg className="w-8 h-8 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          <p className="text-xs text-gray-600">🎥 {message.fileName || 'Видео'}</p>
                          <button
                            onClick={() => handleDownloadFile(message.id, message.fileName || `video_${message.id}.mp4`)}
                            className="absolute top-2 right-2 bg-blue-500 hover:bg-blue-600 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Скачать видео"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </button>
                        </div>
                        {message.content && message.content.trim() && (
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        )}
                      </div>
                    ) : message.messageType === 'AUDIO' ? (
                      <div className="space-y-2">
                        <div className="bg-gray-100 rounded-lg p-2 text-center relative group">
                          <svg className="w-8 h-8 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                          </svg>
                          <p className="text-xs text-gray-600">🎧 {message.fileName || 'Аудио'}</p>
                          <button
                            onClick={() => handleDownloadFile(message.id, message.fileName || `audio_${message.id}.mp3`)}
                            className="absolute top-2 right-2 bg-blue-500 hover:bg-blue-600 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Скачать аудио"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </button>
                        </div>
                        {message.content && message.content.trim() && (
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        )}
                      </div>
                    ) : message.messageType === 'DOCUMENT' ? (
                      <div className="space-y-2">
                        <div className="bg-gray-100 rounded-lg p-2 text-center relative group">
                          <svg className="w-8 h-8 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <p className="text-xs text-gray-600">📄 {message.fileName || 'Документ'}</p>
                          <button
                            onClick={() => handleDownloadFile(message.id, message.fileName || `document_${message.id}`)}
                            className="absolute top-2 right-2 bg-blue-500 hover:bg-blue-600 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Скачать документ"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </button>
                        </div>
                        {message.content && message.content.trim() && (
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">
                        {message.content}
                      </p>
                    )}
                    
                    <div className={`flex items-center justify-between mt-2 text-xs ${
                      message.isOutbound ? 'text-blue-100' : 'text-gray-500'
                    }`}>
                      <span>{formatTime(message.sentAt)}</span>
                      {message.isOutbound && (
                        <span className="ml-2">
                          {getStatusIcon(message)}
                        </span>
                      )}
                    </div>

                    {message.sentimentLabel && message.isInbound && (
                      <div className="mt-1">
                        <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                          message.sentimentLabel === 'POSITIVE' ? 'bg-green-100 text-green-800' :
                          message.sentimentLabel === 'NEGATIVE' ? 'bg-red-100 text-red-800' :
                          message.sentimentLabel === 'MIXED' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {message.sentimentLabel === 'POSITIVE' ? '😊' :
                           message.sentimentLabel === 'NEGATIVE' ? '😞' :
                           message.sentimentLabel === 'MIXED' ? '😐' : '😶'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="border-t border-gray-200 bg-white">
        <MessageInput 
          onSendMessage={handleSendMessage}
          disabled={sending || thread.status === 'CLOSED'}
          placeholder={
            thread.status === 'CLOSED' 
              ? 'Диалог закрыт' 
              : 'Введите сообщение...'
          }
        />
      </div>
    </div>
  )
}