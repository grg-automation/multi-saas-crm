/**
 * API для интеграции Telegram User API с Inbox
 */

const NOTIFICATION_SERVICE_BASE = process.env.NEXT_PUBLIC_MESSAGING_API_URL?.replace('/api/v1', '') || 'http://localhost:3003'

export interface TelegramContact {
  id: string
  firstName: string
  lastName: string // Обязательное поле для совместимости с Thread
  username?: string
  fullName: string
  phone?: string
}

export interface TelegramChannel {
  id: string
  type: 'TELEGRAM'
  displayName: string
  status: 'ACTIVE' | 'INACTIVE'
}

export interface TelegramThread {
  id: string
  status: 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED'
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  subject: string
  unreadCount: number
  lastMessageAt: string
  lastCustomerMessageAt: string
  contact: TelegramContact
  channel: TelegramChannel
  lastMessage: {
    content: string
    senderName: string
    direction: 'INBOUND' | 'OUTBOUND'
  }
}

export interface TelegramMessage {
  id: string
  threadId: string
  direction: 'INBOUND' | 'OUTBOUND'
  content: string
  messageType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT'
  senderName: string
  sentAt: string
  deliveredAt?: string
  readAt?: string
  status: 'SENT' | 'DELIVERED' | 'READ'
  isInbound: boolean
  isOutbound: boolean
  sentimentLabel?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'
  fileName?: string  // Реальное имя файла для медиа сообщений
  fileSize?: number  // Размер файла в байтах  
  mimeType?: string  // MIME тип файла
}

/**
 * Получить активные Telegram сессии
 */
export async function getTelegramSessions() {
  try {
    console.log('📞 Fetching Telegram sessions from:', `${NOTIFICATION_SERVICE_BASE}/api/v1/telegram-user-v2/sessions`)
    const response = await fetch(`${NOTIFICATION_SERVICE_BASE}/api/v1/telegram-user-v2/sessions`, {
      cache: 'no-cache'
    })
    
    if (!response.ok) {
      console.error('❌ Sessions API response not ok:', response.status, response.statusText)
      return []
    }
    
    const data = await response.json()
    console.log('📞 Sessions API response:', data)
    return data.sessions || []
  } catch (error: any) {
    console.error('❌ Error fetching Telegram sessions:', error)
    return []
  }
}

/**
 * Конвертировать Telegram чаты в формат Thread для Inbox
 */
export async function getTelegramThreads(sessionId?: string): Promise<TelegramThread[]> {
  try {
    console.log('🔍 Getting Telegram threads...')
    
    // Получаем активные сессии
    const sessions = await getTelegramSessions()
    console.log('📱 Telegram sessions:', sessions)
    
    if (sessions.length === 0) {
      console.warn('❌ No active Telegram sessions found')
      return []
    }

    // Берем первую рабочую аутентифицированную сессию или указанную
    let activeSession = sessionId 
      ? sessions.find((s: any) => s.id === sessionId && s.isAuthenticated)
      : null
    
    // Если сессия не указана, проверим каждую сессию на работоспособность
    if (!activeSession) {
      for (const session of sessions.filter((s: any) => s.isAuthenticated && s.isConnected)) {
        // Проверяем, работает ли сессия, сделав тестовый запрос
        try {
          const testUrl = `${NOTIFICATION_SERVICE_BASE}/api/v1/telegram-user-v2/${session.id}/chats?limit=1`
          const testResponse = await fetch(testUrl, { cache: 'no-cache' })
          const testData = await testResponse.json()
          
          if (testData.success) {
            console.log(`✅ Working session found: ${session.id}`)
            activeSession = session
            break
          } else {
            console.warn(`❌ Session ${session.id} not working:`, testData.message)
          }
        } catch (error) {
          console.warn(`❌ Session ${session.id} test failed:`, error)
        }
      }
    }

    console.log('✅ Active session:', activeSession)

    if (!activeSession) {
      console.warn('❌ No authenticated Telegram session found')
      return []
    }

    // Получаем чаты
    const chatsUrl = `${NOTIFICATION_SERVICE_BASE}/api/v1/telegram-user-v2/${activeSession.id}/chats`
    console.log('📞 Fetching chats from URL:', chatsUrl)
    
    const chatsResponse = await fetch(chatsUrl, {
      cache: 'no-cache'
    })
    console.log('📞 Chats response status:', chatsResponse.status, chatsResponse.statusText)
    
    const chatsData = await chatsResponse.json()
    console.log('📞 Chats response data:', chatsData)
    
    // 🔍 ДЕТАЛЬНАЯ ОТЛАДКА: какие именно чаты возвращает API
    if (chatsData.success && chatsData.chats) {
      console.log('🔍 ДЕТАЛЬНЫЙ АНАЛИЗ ЧАТОВ:')
      chatsData.chats.forEach((chat: any, index: number) => {
        console.log(`  ${index + 1}. Chat ID: ${chat.id}`)
        console.log(`     Name: ${chat.firstName || chat.title || 'Unknown'}`)
        console.log(`     Type: ${chat.type}`)
        console.log(`     Username: ${chat.username || 'none'}`)
      })
      
      console.log(`📊 Total chats received from API: ${chatsData.chats.length}`)
    }
    
    if (!chatsData.success || !chatsData.chats) {
      console.error('Failed to get Telegram chats:', chatsData)
      return []
    }

    // Конвертируем чаты в формат Thread
    const threads: TelegramThread[] = chatsData.chats.map((chat: any) => {
      // Определяем имя контакта
      let displayName = 'Unknown Contact'
      let fullName = 'Unknown Contact'
      
      if (chat.username) {
        displayName = `@${chat.username}`
        fullName = chat.username
      } else if (chat.title) {
        displayName = chat.title
        fullName = chat.title
      } else if (chat.firstName || chat.lastName) {
        const firstName = chat.firstName || ''
        const lastName = chat.lastName || ''
        fullName = `${firstName} ${lastName}`.trim()
        displayName = fullName
      }
      
      const contact: TelegramContact = {
        id: chat.id, // V2 уже возвращает строку
        firstName: chat.firstName || chat.title || fullName,
        lastName: chat.lastName || '', // Всегда строка для совместимости
        username: chat.username,
        fullName: fullName,
        phone: chat.phone || undefined // Используем телефон контакта, если есть
      }

      const channel: TelegramChannel = {
        id: `telegram_${activeSession.id}`,
        type: 'TELEGRAM',
        displayName: `Telegram: ${displayName}`,
        status: 'ACTIVE'
      }

      const thread: TelegramThread = {
        id: `telegram_thread_${chat.id}`,
        status: 'OPEN',
        priority: 'NORMAL',
        subject: `Чат с ${displayName}`,
        unreadCount: 0, // TODO: реализовать подсчет непрочитанных
        lastMessageAt: new Date().toISOString(),
        lastCustomerMessageAt: new Date().toISOString(),
        contact,
        channel,
        lastMessage: {
          content: 'Чат доступен для переписки',
          senderName: displayName,
          direction: 'INBOUND'
        }
      }

      return thread
    })

    console.log(`Converted ${threads.length} Telegram chats to threads`)
    return threads

  } catch (error: any) {
    console.error('❌ Error getting Telegram threads:', error)
    console.error('❌ Full error details:', {
      message: error?.message,
      stack: error?.stack,
      name: error?.name
    })
    return []
  }
}

/**
 * Отправить сообщение через Telegram
 */
export async function sendTelegramMessage(threadId: string, content: string, file?: File): Promise<boolean> {
  try {
    console.log('🚀 Starting sendTelegramMessage with:', { threadId, content, hasFile: !!file })
    
    // Извлекаем chat ID из thread ID
    const chatId = threadId.replace('telegram_thread_', '')
    console.log('📞 Chat ID:', chatId)
    
    // Получаем активную рабочую сессию
    const sessions = await getTelegramSessions()
    console.log('📞 Got sessions:', sessions)
    
    let activeSession = null
    
    // Проверим каждую сессию на работоспособность
    for (const session of sessions.filter((s: any) => s.isAuthenticated && s.isConnected)) {
      try {
        const testUrl = `${NOTIFICATION_SERVICE_BASE}/api/v1/telegram-user-v2/${session.id}/chats?limit=1`
        const testResponse = await fetch(testUrl, { cache: 'no-cache' })
        const testData = await testResponse.json()
        
        if (testData.success) {
          activeSession = session
          break
        }
      } catch (error) {
        console.warn(`❌ Session ${session.id} test failed:`, error)
      }
    }
    
    console.log('✅ Active session:', activeSession)
    
    if (!activeSession) {
      console.error('❌ No authenticated Telegram session found')
      throw new Error('No authenticated Telegram session')
    }

    let response
    
    if (file) {
      console.log('📎 Sending file:', file.name, file.size, 'bytes')
      
      // Отправляем файл
      const formData = new FormData()
      formData.append('sessionId', activeSession.id)
      formData.append('chatId', chatId)
      formData.append('file', file)
      if (content.trim()) {
        formData.append('caption', content)
      }
      
      console.log('📤 FormData entries:')
      for (const [key, value] of formData.entries()) {
        console.log(`  ${key}:`, value instanceof File ? `File(${value.name}, ${value.size}b)` : value)
      }
      
      const fileUrl = `${NOTIFICATION_SERVICE_BASE}/api/v1/telegram-user-v2/send-file`
      console.log('📤 Sending file to:', fileUrl)
      
      response = await fetch(fileUrl, {
        method: 'POST',
        body: formData
      })
      
      console.log('📤 File send response status:', response.status, response.statusText)
    } else {
      // Отправляем текстовое сообщение
      response = await fetch(`${NOTIFICATION_SERVICE_BASE}/api/v1/telegram-user-v2/send-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: activeSession.id,
          chatId: chatId,
          message: content
        })
      })
    }

    const data = await response.json()
    console.log('📤 Response data:', data)
    
    const success = data.success || false
    console.log('✅ Send result:', success)
    return success

  } catch (error) {
    console.error('❌ Error sending Telegram message:', error)
    return false
  }
}

/**
 * Получить реальные сообщения из Telegram чата
 */
export async function getTelegramMessages(threadId: string): Promise<TelegramMessage[]> {
  const chatId = threadId.replace('telegram_thread_', '')
  
  try {
    console.log(`🔍 Getting messages for chat ${chatId}`)
    
    // Получаем активную рабочую сессию (используем ту же логику, что и в getTelegramThreads)
    const sessions = await getTelegramSessions()
    let activeSession = null
    
    // Проверим каждую сессию на работоспособность
    for (const session of sessions.filter((s: any) => s.isAuthenticated && s.isConnected)) {
      try {
        const testUrl = `${NOTIFICATION_SERVICE_BASE}/api/v1/telegram-user-v2/${session.id}/chats?limit=1`
        const testResponse = await fetch(testUrl, { cache: 'no-cache' })
        const testData = await testResponse.json()
        
        if (testData.success) {
          activeSession = session
          break
        }
      } catch (error) {
        console.warn(`❌ Session ${session.id} test failed:`, error)
      }
    }
    
    if (!activeSession) {
      console.warn('❌ No authenticated session for messages')
      return []
    }

    // Получаем историю сообщений
    const response = await fetch(`${NOTIFICATION_SERVICE_BASE}/api/v1/telegram-user-v2/${activeSession.id}/chats/${chatId}/history`)
    const data = await response.json()
    
    if (!data.success || !data.messages) {
      console.warn('❌ Failed to get chat history:', data)
      return []
    }

    console.log(`📨 Retrieved ${data.messages.length} messages`)

    // Конвертируем Telegram сообщения в формат для Inbox
    const telegramMessages: TelegramMessage[] = data.messages.map((msg: any, index: number) => {
      const isOutbound = msg.out === true // V2 возвращает boolean напрямую
      
      // Определяем тип сообщения и контент
      let messageType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' = 'TEXT'
      let content = msg.message || msg.text || ''
      
      // Проверяем есть ли медиа (V2 формат)
      if (msg.media) {
        if (msg.media.type === 'MessageMediaPhoto' || msg.media.photo) {
          messageType = 'IMAGE'
          content = content || '🖼️ Изображение'
        } else if (msg.media.type === 'MessageMediaDocument' || msg.media.document) {
          const document = msg.media.document
          let fileName = 'Документ'
          let fileSize = 0
          let mimeType = 'application/octet-stream'
          
          if (document) {
            mimeType = document.mimeType || document.mime_type || mimeType
            fileSize = document.size || 0
            
            // Извлекаем имя файла из атрибутов (правильный формат GramJS)
            if (document.attributes) {
              for (const attr of document.attributes) {
                if (attr.fileName || (attr.className && attr.className.includes('DocumentAttributeFilename'))) {
                  fileName = attr.fileName || attr.file_name || fileName
                  break
                }
                if (attr._ === 'documentAttributeFilename' || attr._name === 'DocumentAttributeFilename') {
                  fileName = attr.fileName || attr.file_name || fileName
                  break
                }
              }
            }
            
            if (mimeType.startsWith('video/')) {
              messageType = 'VIDEO'
              content = content || `🎥 ${fileName}`
            } else if (mimeType.startsWith('audio/')) {
              messageType = 'AUDIO'
              content = content || `🎧 ${fileName}`
            } else {
              messageType = 'DOCUMENT'
              content = content || `📄 ${fileName}`
            }
          } else {
            messageType = 'DOCUMENT'
            content = content || '📄 Документ'
          }
        }
      }
      
      // Если контент всё ещё пустой
      if (!content) {
        content = messageType === 'TEXT' ? 'Сообщение' : 'Медиа'
      }
      
      const result: TelegramMessage = {
        id: msg.id?.toString() || `msg_${Date.now()}_${index}`,
        threadId,
        direction: isOutbound ? 'OUTBOUND' : 'INBOUND',
        content,
        messageType,
        senderName: isOutbound ? 'Вы' : 'Контакт',
        sentAt: new Date(msg.date * 1000).toISOString(),
        deliveredAt: new Date(msg.date * 1000).toISOString(),
        status: 'DELIVERED',
        isInbound: !isOutbound,
        isOutbound: isOutbound,
        sentimentLabel: 'NEUTRAL'
      }
      
      // Добавляем метаданные файла для медиа сообщений
      if (messageType !== 'TEXT' && msg.media?.document) {
        const document = msg.media.document
        result.mimeType = document.mimeType || document.mime_type
        result.fileSize = document.size || 0
        
        // Извлекаем имя файла
        if (document.attributes) {
          for (const attr of document.attributes) {
            if (attr.fileName || (attr.className && attr.className.includes('DocumentAttributeFilename'))) {
              result.fileName = attr.fileName || attr.file_name
              break
            }
            if (attr._ === 'documentAttributeFilename' || attr._name === 'DocumentAttributeFilename') {
              result.fileName = attr.fileName || attr.file_name
              break
            }
          }
        }
      }
      
      return result
    }).reverse() // Сортируем от старых к новым

    console.log(`✅ Converted ${telegramMessages.length} messages`)
    return telegramMessages

  } catch (error) {
    console.error('❌ Error getting Telegram messages:', error)
    
    // Fallback к mock сообщениям
    const mockMessages: TelegramMessage[] = [
      {
        id: `msg_${Date.now()}_1`,
        threadId,
        direction: 'INBOUND',
        content: 'История сообщений недоступна',
        messageType: 'TEXT',
        senderName: 'System',
        sentAt: new Date(Date.now() - 3600000).toISOString(),
        deliveredAt: new Date(Date.now() - 3550000).toISOString(),
        status: 'DELIVERED',
        isInbound: true,
        isOutbound: false,
        sentimentLabel: 'NEUTRAL'
      }
    ]

    return mockMessages
  }
}

/**
 * Отправить файл через Telegram
 */
export async function sendTelegramFile(sessionId: string, chatId: string, file: File, caption?: string) {
  try {
    console.log(`📎 Sending file via session ${sessionId} to chat ${chatId}:`, file.name)
    
    const formData = new FormData()
    formData.append('file', file)
    formData.append('sessionId', sessionId)
    formData.append('chatId', chatId)
    if (caption) {
      formData.append('caption', caption)
    }
    
    const response = await fetch(`${NOTIFICATION_SERVICE_BASE}/api/v1/telegram-user-v2/send-file`, {
      method: 'POST',
      body: formData
    })
    
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.message || `HTTP ${response.status}`)
    }
    
    const result = await response.json()
    console.log('✅ File sent successfully:', result)
    return result
    
  } catch (error) {
    console.error('❌ Failed to send file:', error)
    throw error
  }
}

/**
 * Скачать файл из Telegram сообщения
 */
export async function downloadTelegramFile(messageId: string, chatId?: string): Promise<{ 
  data: string; 
  fileName: string; 
  contentType: string; 
  fileSize: number 
}> {
  console.log(`📥 Downloading file from messageId: ${messageId}, chatId: ${chatId}`);
  
  // Если chatId не передан, извлекаем его из messageId (если это Telegram thread)
  if (!chatId && messageId.includes('telegram_')) {
    // Для Telegram thread ID извлекаем chatId из threadId контекста
    // Это потребует дополнительной логики для получения chatId
    throw new Error('ChatId is required for Telegram file download');
  }
  
  // Получаем активную сессию
  const sessionsResponse = await fetch(`${NOTIFICATION_SERVICE_BASE}/api/v1/telegram-user-v2/sessions`);
  
  if (!sessionsResponse.ok) {
    throw new Error('Failed to get Telegram sessions');
  }
  
  const sessionsData = await sessionsResponse.json();
  const activeSessions = sessionsData.sessions.filter((s: any) => s.isAuthenticated && s.isConnected);
  
  if (activeSessions.length === 0) {
    throw new Error('No active Telegram sessions available');
  }
  
  const sessionId = activeSessions[0].id;
  console.log(`📥 Using session ${sessionId} for file download`);
  
  // Скачиваем файл
  const downloadResponse = await fetch(
    `${NOTIFICATION_SERVICE_BASE}/api/v1/telegram-user-v2/${sessionId}/download/${chatId}/${messageId}`
  );
  
  if (!downloadResponse.ok) {
    const errorData = await downloadResponse.json().catch(() => null);
    throw new Error(errorData?.message || `Failed to download file: ${downloadResponse.status}`);
  }
  
  const fileData = await downloadResponse.json();
  
  if (!fileData.success) {
    throw new Error(fileData.message || 'File download failed');
  }
  
  return {
    data: fileData.data, // base64 encoded
    fileName: fileData.fileName,
    contentType: fileData.contentType,
    fileSize: fileData.fileSize
  };
}