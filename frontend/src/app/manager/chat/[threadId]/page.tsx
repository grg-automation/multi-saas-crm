'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { io, Socket } from 'socket.io-client'
import { ArrowLeft, Send, MessageCircle, Clock, Upload, Download } from 'lucide-react'
import AuthenticatedLayout from '@/components/layout/AuthenticatedLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default function ManagerChatPage() {
  const router = useRouter()
  const params = useParams()
  const threadId = params.threadId as string
  
  const [messages, setMessages] = useState<any[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [chatInfo, setChatInfo] = useState<any>(null)
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Получаем информацию о чате и сообщения
  useEffect(() => {
    if (threadId) {
      fetchChatData()
      setupWebSocket()
    }

    // Cleanup WebSocket connection
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [threadId])

  const setupWebSocket = () => {
    try {
      const userData = localStorage.getItem('user')
      const user = userData ? JSON.parse(userData) : null

      if (!user) {
        console.error('No user data found for WebSocket connection')
        return
      }

      // Подключаемся к WebSocket
      socketRef.current = io('http://localhost:3003', {
        timeout: 20000,
        transports: ['websocket', 'polling']
      })

      socketRef.current.on('connect', () => {
        console.log('WebSocket connected for manager chat')
        
        // Подписываемся на обновления для этого чата
        const sessionId = 'tg_user_1754039348073_xnqhblt8r' // Это должно браться из конфигурации
        const chatId = threadId.replace('telegram_thread_', '') // Извлекаем чистый chat ID
        socketRef.current?.emit('subscribe_to_session', {
          sessionId: sessionId,
          userId: user.id,
          userRole: 'MANAGER',
          assignedChatIds: [chatId] // Передаем чистые chat ID без префикса
        })
      })

      socketRef.current.on('subscription_confirmed', (data) => {
        console.log('WebSocket subscription confirmed:', data)
      })

      socketRef.current.on('telegram_update', (update) => {
        console.log('Received Telegram update:', update)
        console.log('🔍 Update data structure:', {
          type: update.type,
          chatId: update.chatId,
          data: update.data,
          hasMedia: !!update.data?.media,
          mediaType: update.data?.media?.type,
          text: update.data?.text,
          message: update.data?.message
        })
        
        if (update.type === 'new_message' && update.chatId === threadId.replace('telegram_thread_', '')) {
          // Правильно обрабатываем новое сообщение с файлами
          const detectMessageType = (updateData: any) => {
            if (updateData.media) {
              if (updateData.media.photo || updateData.media.type === 'MessageMediaPhoto') return 'image'
              if (updateData.media.document || updateData.media.type === 'MessageMediaDocument') return 'file'
            }
            return 'text'
          }

          const processFileContent = (updateData: any, messageType: string) => {
            let content = updateData.text || updateData.message || ''
            
            if (messageType === 'file' && updateData.media?.document) {
              const document = updateData.media.document
              let fileName = 'Документ'
              
              // Извлекаем имя файла из атрибутов
              if (document.attributes) {
                for (const attr of document.attributes) {
                  if (attr.fileName || (attr.className && attr.className.includes('DocumentAttributeFilename'))) {
                    fileName = attr.fileName || attr.file_name || fileName
                    break
                  }
                }
              }
              
              // Если не нашли в атрибутах, используем content как fallback
              if (fileName === 'Документ' && content) {
                fileName = content
              }
              
              // Определяем иконку по MIME типу
              const mimeType = document.mimeType || document.mime_type || ''
              let icon = '📄'
              if (mimeType.startsWith('image/')) {
                icon = '🖼️'
              } else if (mimeType.startsWith('video/')) {
                icon = '🎥'
              } else if (mimeType.startsWith('audio/')) {
                icon = '🎧'
              }
              
              return `${icon} ${fileName}`
            } else if (messageType === 'image') {
              return content ? `🖼️ Изображение\n${content}` : '🖼️ Изображение'
            } else if (!content && updateData.media) {
              return '[Медиа файл]'
            }
            
            return content
          }

          const messageType = detectMessageType(update.data)
          const processedContent = processFileContent(update.data, messageType)

          const newMsg = {
            id: update.data.messageId?.toString() || Date.now().toString(),
            content: processedContent,
            timestamp: update.data.date || new Date().toISOString(),
            sender: update.data.isOutgoing || update.data.fromManager ? 'Менеджер' : 'Контакт',
            isFromManager: update.data.isOutgoing || update.data.fromManager || false,
            messageType: messageType
          }
          
          // Проверяем, нет ли уже сообщения с таким ID (избегаем дубликатов)
          setMessages(prev => {
            const exists = prev.some(msg => msg.id === newMsg.id)
            if (exists) {
              console.log('Message already exists, skipping:', newMsg.id)
              return prev
            }
            console.log('Adding new message with type:', messageType, 'content:', processedContent)
            return [...prev, newMsg]
          })
        }
      })

      socketRef.current.on('disconnect', () => {
        console.log('WebSocket disconnected')
      })

      socketRef.current.on('error', (error) => {
        console.error('WebSocket error:', error)
      })

    } catch (error) {
      console.error('Failed to setup WebSocket:', error)
    }
  }

  const fetchChatData = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      
      // 1. Получаем анонимизированную информацию о чате
      const chatResponse = await fetch(`http://localhost:3003/api/v1/manager/chat/${threadId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (chatResponse.ok) {
        const chatData = await chatResponse.json()
        setChatInfo(chatData.data)
      }

      // 2. Получаем сообщения (анонимизированные) - загружаем больше сообщений
      const messagesResponse = await fetch(`http://localhost:3003/api/v1/manager/chat/${threadId}/messages?limit=200`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (messagesResponse.ok) {
        const messagesData = await messagesResponse.json()
        const anonymizedMessages = messagesData.data?.map((msg: any) => ({
          id: msg.id,
          content: msg.content,
          timestamp: msg.timestamp,
          sender: msg.sender,
          isFromManager: msg.isFromManager,
          messageType: msg.messageType
        })) || []
        
        // Сортируем сообщения по времени (старые сверху, новые снизу)
        const sortedMessages = anonymizedMessages.sort((a, b) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )
        
        setMessages(sortedMessages)
      }
      
    } catch (error) {
      console.error('Error fetching chat data:', error)
    } finally {
      setLoading(false)
    }
  }

  const sendMessage = async () => {
    if (!newMessage.trim() || sending) return
    
    try {
      setSending(true)
      const token = localStorage.getItem('token')
      const userData = localStorage.getItem('user')
      const managerId = userData ? JSON.parse(userData).id : undefined
      
      // Отправляем сообщение через новое API
      const response = await fetch(`http://localhost:3003/api/v1/manager/chat/${threadId}/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: newMessage,
          messageType: 'text',
          managerId: managerId
        })
      })
      
      if (response.ok) {
        const result = await response.json()
        
        // Добавляем сообщение локально (WebSocket может дублировать, но мы проверим)
        const newMsg = {
          id: result.data.messageId,
          content: newMessage,
          timestamp: result.data.sentAt,
          sender: 'Менеджер',
          isFromManager: true,
          messageType: 'text'
        }
        
        setMessages(prev => {
          const exists = prev.some(msg => msg.id === newMsg.id)
          if (exists) {
            console.log('Sent message already exists, skipping:', newMsg.id)
            return prev
          }
          return [...prev, newMsg]
        })
        setNewMessage('')
      } else {
        console.error('Failed to send message')
      }
      
    } catch (error) {
      console.error('Error sending message:', error)
    } finally {
      setSending(false)
    }
  }

  const sendFile = async (file: File) => {
    if (!file || uploading) return
    
    try {
      setUploading(true)
      const token = localStorage.getItem('token')
      const userData = localStorage.getItem('user')
      const managerId = userData ? JSON.parse(userData).id : undefined

      const formData = new FormData()
      formData.append('file', file)
      formData.append('managerId', managerId || '')

      const response = await fetch(`http://localhost:3003/api/v1/manager/chat/${threadId}/send-file`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData
      })

      if (response.ok) {
        const result = await response.json()
        
        // Добавляем файл локально (WebSocket может дублировать, но мы проверим)
        const newMsg = {
          id: result.data.messageId,
          content: `📎 ${file.name}`,
          timestamp: result.data.sentAt,
          sender: 'Менеджер',
          isFromManager: true,
          messageType: 'file'
        }
        
        setMessages(prev => {
          const exists = prev.some(msg => msg.id === newMsg.id)
          if (exists) {
            console.log('Sent file already exists, skipping:', newMsg.id)
            return prev
          }
          return [...prev, newMsg]
        })
      } else {
        console.error('Failed to send file')
      }
      
    } catch (error) {
      console.error('Error sending file:', error)
    } finally {
      setUploading(false)
    }
  }

  const handleDownloadFile = async (messageId: string, fileName?: string) => {
    try {
      console.log(`📥 Starting download for message: ${messageId}`);
      
      // Извлекаем chatId из threadId для Telegram
      let chatId: string | undefined;
      if (threadId && threadId.startsWith('telegram_thread_')) {
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

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      sendFile(file)
    }
    // Очищаем input для повторной загрузки того же файла
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('ru-RU', { 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  if (loading) {
    return (
      <AuthenticatedLayout>
        <div className="p-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <MessageCircle className="h-8 w-8 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500">Загрузка чата...</p>
            </div>
          </div>
        </div>
      </AuthenticatedLayout>
    )
  }

  return (
    <AuthenticatedLayout>
      <div className="p-6 max-w-4xl mx-auto">
        {/* Заголовок чата */}
        <div className="flex items-center gap-4 mb-6">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => router.back()}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Назад к чатам
          </Button>
          
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{chatInfo?.title}</h1>
            <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
              <span>{chatInfo?.contact}</span>
              <Badge variant="outline">{chatInfo?.channel}</Badge>
              <Badge variant="secondary">{chatInfo?.status}</Badge>
            </div>
          </div>
        </div>

        {/* Область сообщений */}
        <Card className="mb-4">
          <CardContent className="p-0">
            <div className="h-96 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  <MessageCircle className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  <p>Пока нет сообщений в этом чате</p>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.isFromManager ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg relative group ${
                        message.isFromManager
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 text-gray-900'
                      }`}
                    >
                      {/* Контент сообщения */}
                      <div className="flex items-start justify-between">
                        <p className="text-sm flex-1">{message.content}</p>
                        
                        {/* Кнопка скачивания для файлов */}
                        {(message.messageType === 'file' || 
                          message.messageType === 'image' ||
                          message.content.includes('📎') || 
                          message.content.includes('🖼️') || 
                          message.content.includes('🎥') || 
                          message.content.includes('🎧') || 
                          message.content.includes('📄')) && (
                          <button
                            onClick={() => {
                              const fileName = message.content.replace(/^📎\s*/, '').replace(/^🖼️\s*/, '').replace(/^🎥\s*/, '').replace(/^🎧\s*/, '').replace(/^📄\s*/, '')
                              handleDownloadFile(message.id, fileName)
                            }}
                            className={`ml-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                              message.isFromManager 
                                ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                            }`}
                            title="Скачать файл"
                          >
                            <Download className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-between mt-1">
                        <span className={`text-xs ${
                          message.isFromManager ? 'text-blue-100' : 'text-gray-500'
                        }`}>
                          {message.sender}
                        </span>
                        <span className={`text-xs ${
                          message.isFromManager ? 'text-blue-100' : 'text-gray-500'
                        }`}>
                          {formatTime(message.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Поле ввода сообщения */}
        <Card>
          <CardContent className="p-4">
            <div className="flex gap-2">
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Напишите сообщение..."
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                disabled={sending || uploading}
              />
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                style={{ display: 'none' }}
                accept="*/*"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                title="Прикрепить файл"
              >
                {uploading ? (
                  <Clock className="h-4 w-4" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
              </Button>
              <Button 
                onClick={sendMessage} 
                disabled={!newMessage.trim() || sending || uploading}
              >
                {sending ? (
                  <Clock className="h-4 w-4" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Информация о конфиденциальности */}
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            🔒 <strong>Конфиденциальность:</strong> Контакты анонимизированы в соответствии с политикой безопасности. 
            Номера телефонов и персональные данные скрыты.
          </p>
        </div>
      </div>
    </AuthenticatedLayout>
  )
}