'use client'

import { useState, useEffect } from 'react'

interface Contact {
  id: string
  firstName: string
  lastName: string
  fullName: string
  email?: string
  phone?: string
}

interface Channel {
  id: string
  type: 'TELEGRAM' | 'WHATSAPP' | 'EMAIL' | 'SMS'
  displayName?: string
  status: string
}

interface Thread {
  id: string
  status: 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED'
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  subject?: string
  unreadCount: number
  lastMessageAt?: string
  lastCustomerMessageAt?: string
  contact?: Contact
  channel?: Channel
  lastMessage?: {
    content?: string
    senderName?: string
    direction: 'INBOUND' | 'OUTBOUND'
  }
}

interface ThreadListProps {
  selectedThreadId: string | null
  onThreadSelect: (threadId: string) => void
  managerId?: string
}

export function ThreadList({ selectedThreadId, onThreadSelect, managerId }: ThreadListProps) {
  const [threads, setThreads] = useState<Thread[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unread' | 'assigned'>('all')
  const [channelFilter, setChannelFilter] = useState<string>('all')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [searchLoading, setSearchLoading] = useState(false)

  // Debounced search effect
  useEffect(() => {
    if (searchQuery.trim()) {
      setSearchLoading(true)
      const debounceTimer = setTimeout(() => {
        fetchThreads()
      }, 500) // 500ms delay

      return () => clearTimeout(debounceTimer)
    } else {
      fetchThreads()
    }
  }, [searchQuery])

  useEffect(() => {
    fetchThreads()
    
    // ОТКЛЮЧЕНО: Auto-refresh ломает отправку файлов и обновление UI
    // Автообновление threads вызывает переход между чатами
    // TODO: Реализовать более умное обновление только измененных threads
    const interval = null // autoRefresh ? setInterval(() => {
    //   if (!document.hidden) {
    //     // Вместо fetchThreads() нужно проверять только обновленные threads
    //     // fetchThreads()
    //   }
    // }, 30000) : null
    
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [filter, channelFilter, managerId, autoRefresh])

  const fetchThreads = async () => {
    try {
      setLoading(true)
      
      // Get threads from messaging API (includes Telegram integration)
      const { messagingApi } = await import('@/lib/messaging-api')
      
      const response = await messagingApi.getInboxThreads(managerId)
      let filteredThreads = response.content

      console.log('Fetched threads:', filteredThreads)

      // Apply filters
      if (filter === 'unread') {
        filteredThreads = filteredThreads.filter(t => t.unreadCount > 0)
      } else if (filter === 'assigned') {
        filteredThreads = filteredThreads.filter(t => t.status === 'OPEN')
      }

      if (channelFilter !== 'all') {
        filteredThreads = filteredThreads.filter(t => 
          t.channel?.type.toLowerCase() === channelFilter.toLowerCase()
        )
      }

      // Apply search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim()
        filteredThreads = filteredThreads.filter(t => {
          const contactName = (t.contact?.fullName || '').toLowerCase()
          const channelName = (t.channel?.displayName || '').toLowerCase() 
          const subject = (t.subject || '').toLowerCase()
          const lastMessage = (t.lastMessage?.content || '').toLowerCase()
          
          return contactName.includes(query) || 
                 channelName.includes(query) || 
                 subject.includes(query) || 
                 lastMessage.includes(query)
        })
      }

      console.log('Filtered threads:', filteredThreads)
      setThreads(filteredThreads)
    } catch (error) {
      console.error('Error fetching threads:', error)
    } finally {
      setLoading(false)
      setSearchLoading(false)
    }
  }

  const formatTimeAgo = (dateString?: string) => {
    if (!dateString) return ''
    
    const now = new Date()
    const date = new Date(dateString)
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'сейчас'
    if (diffMins < 60) return `${diffMins}м назад`
    if (diffHours < 24) return `${diffHours}ч назад`
    if (diffDays < 7) return `${diffDays}д назад`
    
    return date.toLocaleDateString('ru-RU')
  }

  const getChannelIcon = (type: string) => {
    switch (type) {
      case 'TELEGRAM': return '📱'
      case 'WHATSAPP': return '💚'
      case 'EMAIL': return '📧'
      case 'SMS': return '📲'
      default: return '💬'
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'URGENT': return 'bg-red-100 text-red-800'
      case 'HIGH': return 'bg-orange-100 text-orange-800'
      case 'NORMAL': return 'bg-blue-100 text-blue-800'
      case 'LOW': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN': return 'bg-green-100 text-green-800'
      case 'PENDING': return 'bg-yellow-100 text-yellow-800'
      case 'RESOLVED': return 'bg-blue-100 text-blue-800'
      case 'CLOSED': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="p-4 border-b border-gray-200 space-y-3">
        {/* Search Field */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            {searchLoading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            ) : (
              <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
          </div>
          <input
            type="text"
            placeholder="Поиск по имени, каналу или сообщению..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
            >
              <svg className="h-4 w-4 text-gray-400 hover:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex space-x-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 text-xs font-medium rounded-full ${
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Все ({threads.length})
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`px-3 py-1 text-xs font-medium rounded-full ${
              filter === 'unread'
                ? 'bg-red-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Непрочитанные ({threads.filter(t => t.unreadCount > 0).length})
          </button>
          <button
            onClick={() => setFilter('assigned')}
            className={`px-3 py-1 text-xs font-medium rounded-full ${
              filter === 'assigned'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Мои
          </button>
        </div>

        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          className="w-full text-xs border border-gray-300 rounded-md px-2 py-1 bg-white mb-2"
        >
          <option value="all">Все каналы</option>
          <option value="telegram">📱 Telegram</option>
          <option value="whatsapp">💚 WhatsApp</option>
          <option value="email">📧 Email</option>
          <option value="sms">📲 SMS</option>
        </select>
        
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600">Автообновление</span>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${autoRefresh ? 'bg-blue-600' : 'bg-gray-200'}`}
          >
            <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${autoRefresh ? 'translate-x-5' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>

      {/* Thread List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="mb-4 p-3 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-2/3"></div>
              </div>
            ))}
          </div>
        ) : threads.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <div className="text-4xl mb-4">📭</div>
            {searchQuery.trim() ? (
              <>
                <p className="text-sm">Ничего не найдено</p>
                <p className="text-xs mt-1">Попробуйте изменить поисковый запрос</p>
                {searchLoading && (
                  <p className="text-xs mt-2 text-blue-600">🔍 Поиск...</p>
                )}
              </>
            ) : (
              <>
                <p className="text-sm">Нет диалогов</p>
                <p className="text-xs mt-1">Диалоги появятся при получении сообщений</p>
              </>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {console.log(`🎨 Rendering ${threads.length} threads in UI`)}
            {threads.map((thread) => (
              <div
                key={thread.id}
                onClick={() => onThreadSelect(thread.id)}
                className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                  selectedThreadId === thread.id ? 'bg-blue-50 border-r-2 border-blue-600' : ''
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">
                      {getChannelIcon(thread.channel?.type || '')}
                    </span>
                    <span className="font-medium text-gray-900 text-sm">
                      {thread.contact?.fullName || 'Неизвестный контакт'}
                    </span>
                    {thread.unreadCount > 0 && (
                      <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5 min-w-[20px] text-center">
                        {thread.unreadCount}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">
                    {formatTimeAgo(thread.lastMessageAt)}
                  </span>
                </div>

                <div className="flex items-center space-x-2 mb-2">
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor(thread.status)}`}>
                    {thread.status}
                  </span>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getPriorityColor(thread.priority)}`}>
                    {thread.priority}
                  </span>
                </div>

                {thread.subject && (
                  <p className="text-sm font-medium text-gray-700 mb-1">
                    {thread.subject}
                  </p>
                )}

                <p className="text-xs text-gray-600 line-clamp-2">
                  {thread.lastMessage?.direction === 'INBOUND' ? (
                    <span className="text-blue-600">← </span>
                  ) : (
                    <span className="text-green-600">→ </span>
                  )}
                  {thread.lastMessage?.content || 'Сообщение'}
                </p>

                <div className="mt-2 text-xs text-gray-500">
                  {thread.channel?.displayName}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}