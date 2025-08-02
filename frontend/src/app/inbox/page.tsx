'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ThreadList } from '@/components/inbox/ThreadList'
import { MessageView } from '@/components/inbox/MessageView'
import { InboxHeader } from '@/components/inbox/InboxHeader'
import { InboxStats } from '@/components/inbox/InboxStats'

export default function InboxPage() {
  const router = useRouter()
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    const userData = localStorage.getItem('user')
    
    if (!token || !userData) {
      router.push('/login')
      return
    }

    try {
      setIsAuthenticated(true)
      setUser(JSON.parse(userData))
    } catch (error) {
      console.error('Error parsing user data:', error)
      router.push('/login')
    }
  }, [router])

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Загрузка...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <InboxHeader user={user} />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Stats */}
        <InboxStats />

        {/* Inbox Layout */}
        <div className="mt-6 bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="flex h-[calc(100vh-280px)]">
            {/* Thread List - Left Panel */}
            <div className="w-1/3 border-r border-gray-200 flex flex-col">
              <div className="p-4 border-b border-gray-200 bg-gray-50">
                <h2 className="text-lg font-semibold text-gray-900">
                  📥 Входящие сообщения
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Активные диалоги с клиентами
                </p>
              </div>
              <div className="flex-1 overflow-y-auto">
                <ThreadList 
                  selectedThreadId={selectedThreadId}
                  onThreadSelect={setSelectedThreadId}
                  managerId={user?.id}
                />
              </div>
            </div>

            {/* Message View - Right Panel */}
            <div className="flex-1 flex flex-col">
              {selectedThreadId ? (
                <MessageView 
                  threadId={selectedThreadId}
                  currentUserId={user?.id}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center bg-gray-50">
                  <div className="text-center">
                    <div className="text-6xl mb-4">💬</div>
                    <h3 className="text-xl font-medium text-gray-900 mb-2">
                      Выберите диалог
                    </h3>
                    <p className="text-gray-600">
                      Выберите диалог из списка слева, чтобы начать общение с клиентом
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}