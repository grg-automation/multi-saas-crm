import { apiRequest } from './api'
import { getTelegramThreads, getTelegramMessages, sendTelegramMessage } from './telegram-inbox-api'

// API Base URLs
const CORE_API_BASE = 'http://localhost:8080'

// Types
export interface Thread {
  id: string
  status: 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED'
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  subject?: string
  unreadCount: number
  lastMessageAt?: string
  lastCustomerMessageAt?: string
  contact?: {
    id: string
    firstName: string
    lastName: string
    fullName: string
    email?: string
    phone?: string
  }
  channel?: {
    id: string
    type: 'TELEGRAM' | 'WHATSAPP' | 'EMAIL' | 'SMS'
    displayName?: string
    status: string
  }
  lastMessage?: {
    content?: string
    senderName?: string
    direction: 'INBOUND' | 'OUTBOUND'
  }
}

export interface Message {
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
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export interface PagedResponse<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
  hasNext: boolean
  hasPrevious: boolean
}

// Mock Tenant ID for now - should come from auth context
const MOCK_TENANT_ID = '550e8400-e29b-41d4-a716-446655440000'

/**
 * Messaging API functions
 */
export const messagingApi = {
  // Get inbox threads
  async getInboxThreads(
    managerId?: string,
    channelId?: string,
    page = 0,
    size = 20
  ): Promise<PagedResponse<Thread>> {
    try {
      // Сначала пытаемся получить Telegram threads
      console.log('🔍 Пытаемся получить Telegram threads...')
      const telegramThreads = await getTelegramThreads()
      console.log('📊 Получено Telegram threads:', telegramThreads)
      
      // Если есть Telegram threads - используем их
      if (telegramThreads.length > 0) {
        console.log(`✅ Using ${telegramThreads.length} Telegram threads for Inbox`)
        return {
          content: telegramThreads,
          totalElements: telegramThreads.length,
          totalPages: 1,
          size: telegramThreads.length,
          number: 0,
          hasNext: false,
          hasPrevious: false
        }
      }
      
      // Если Telegram threads пустой - покажем инфо
      console.warn('⚠️ Telegram threads is empty, falling back to Core CRM API')

      // Fallback to Core CRM API
      const params = new URLSearchParams({
        tenantId: MOCK_TENANT_ID,
        page: page.toString(),
        size: size.toString()
      })
      
      if (managerId) params.append('managerId', managerId)
      if (channelId) params.append('channelId', channelId)

      const response = await fetch(`${CORE_API_BASE}/api/v1/messaging/inbox?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          // TODO: Add authorization header
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result: ApiResponse<PagedResponse<Thread>> = await response.json()
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch threads')
      }

      return result.data!
    } catch (error) {
      console.error('Error fetching threads:', error)
      throw error
    }
  },

  // Get specific thread
  async getThread(threadId: string): Promise<Thread> {
    try {
      // Проверяем если это Telegram thread
      if (threadId.startsWith('telegram_thread_')) {
        console.log('📊 Getting Telegram thread for:', threadId)
        const telegramThreads = await getTelegramThreads()
        const thread = telegramThreads.find(t => t.id === threadId)
        
        if (thread) {
          console.log('✅ Found Telegram thread:', thread)
          return thread
        } else {
          console.warn('⚠️ Telegram thread not found:', threadId)
          throw new Error('Telegram thread not found')
        }
      }

      // Fallback to Core CRM API
      const response = await fetch(`${CORE_API_BASE}/api/v1/messaging/threads/${threadId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result: ApiResponse<Thread> = await response.json()
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch thread')
      }

      return result.data!
    } catch (error) {
      console.error('Error fetching thread:', error)
      throw error
    }
  },

  // Get thread messages
  async getThreadMessages(
    threadId: string,
    page = 0,
    size = 100
  ): Promise<PagedResponse<Message>> {
    try {
      // Проверяем если это Telegram thread
      if (threadId.startsWith('telegram_thread_')) {
        const telegramMessages = await getTelegramMessages(threadId)
        return {
          content: telegramMessages,
          totalElements: telegramMessages.length,
          totalPages: 1,
          size: telegramMessages.length,
          number: 0,
          hasNext: false,
          hasPrevious: false
        }
      }

      // Fallback to Core CRM API
      const params = new URLSearchParams({
        page: page.toString(),
        size: size.toString()
      })

      const response = await fetch(`${CORE_API_BASE}/api/v1/messaging/threads/${threadId}/messages?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result: ApiResponse<PagedResponse<Message>> = await response.json()
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch messages')
      }

      return result.data!
    } catch (error) {
      console.error('Error fetching messages:', error)
      throw error
    }
  },

  // Send outbound message
  async sendMessage(
    threadId: string,
    content: string,
    senderId: string,
    senderName: string,
    messageType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' = 'TEXT',
    file?: File
  ): Promise<Message> {
    try {
      // Проверяем если это Telegram thread
      if (threadId.startsWith('telegram_thread_')) {
        const success = await sendTelegramMessage(threadId, content, file)
        
        if (success) {
          // Возвращаем mock message объект для UI
          return {
            id: `msg_${Date.now()}`,
            threadId,
            direction: 'OUTBOUND',
            content,
            messageType,
            senderName,
            sentAt: new Date().toISOString(),
            deliveredAt: new Date().toISOString(),
            status: 'DELIVERED',
            isInbound: false,
            isOutbound: true
          }
        } else {
          throw new Error('Failed to send Telegram message')
        }
      }

      // Fallback to Core CRM API
      const params = new URLSearchParams({
        tenantId: MOCK_TENANT_ID
      })

      const response = await fetch(`${CORE_API_BASE}/api/v1/messaging/messages/outbound?${params}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          threadId,
          content,
          senderId,
          senderName,
          messageType
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result: ApiResponse<Message> = await response.json()
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to send message')
      }

      return result.data!
    } catch (error) {
      console.error('Error sending message:', error)
      throw error
    }
  },

  // Mark thread as read
  async markThreadAsRead(threadId: string): Promise<Thread> {
    // Для Telegram threads не используем Core CRM API
    if (threadId.startsWith('telegram_thread_')) {
      console.log('✅ Telegram thread - skipping Core CRM mark as read')
      // Возвращаем фиктивный объект для совместимости
      return {
        id: threadId,
        status: 'OPEN' as const,
        priority: 'NORMAL' as const,
        unreadCount: 0,
      }
    }
    
    try {
      const response = await fetch(`${CORE_API_BASE}/api/v1/messaging/threads/${threadId}/read`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result: ApiResponse<Thread> = await response.json()
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to mark thread as read')
      }

      return result.data!
    } catch (error) {
      console.error('Error marking thread as read:', error)
      throw error
    }
  },

  // Update thread status
  async updateThreadStatus(
    threadId: string,
    status: 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED'
  ): Promise<Thread> {
    try {
      const params = new URLSearchParams({
        status
      })

      const response = await fetch(`${CORE_API_BASE}/api/v1/messaging/threads/${threadId}/status?${params}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result: ApiResponse<Thread> = await response.json()
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to update thread status')
      }

      return result.data!
    } catch (error) {
      console.error('Error updating thread status:', error)
      throw error
    }
  }
}

/**
 * Mock data fallback for development
 */
export const mockMessagingApi = {
  async getInboxThreads(): Promise<PagedResponse<Thread>> {
    // Return mock data if API fails
    return {
      content: [
        {
          id: '1',
          status: 'OPEN',
          priority: 'HIGH',
          subject: 'Вопрос о продукте',
          unreadCount: 3,
          lastMessageAt: '2024-01-15T10:30:00Z',
          lastCustomerMessageAt: '2024-01-15T10:30:00Z',
          contact: {
            id: 'c1',
            firstName: 'Иван',
            lastName: 'Петров',
            fullName: 'Иван Петров',
            phone: '+7-900-123-45-67'
          },
          channel: {
            id: 'ch1',
            type: 'TELEGRAM',
            displayName: 'Telegram: @ivan_petrov',
            status: 'ACTIVE'
          },
          lastMessage: {
            content: 'Здравствуйте! У меня вопрос по вашему продукту...',
            senderName: 'Иван Петров',
            direction: 'INBOUND'
          }
        }
      ],
      totalElements: 1,
      totalPages: 1,
      number: 0,
      size: 20,
      hasNext: false,
      hasPrevious: false
    }
  },

  async getThreadMessages(): Promise<PagedResponse<Message>> {
    return {
      content: [
        {
          id: '1',
          threadId: '1',
          direction: 'INBOUND',
          content: 'Здравствуйте! У меня вопрос по вашему продукту.',
          messageType: 'TEXT',
          senderName: 'Иван Петров',
          sentAt: '2024-01-15T08:30:00Z',
          deliveredAt: '2024-01-15T08:30:01Z',
          status: 'DELIVERED',
          isInbound: true,
          isOutbound: false,
          sentimentLabel: 'NEUTRAL'
        }
      ],
      totalElements: 1,
      totalPages: 1,
      number: 0,
      size: 50,
      hasNext: false,
      hasPrevious: false
    }
  }
}