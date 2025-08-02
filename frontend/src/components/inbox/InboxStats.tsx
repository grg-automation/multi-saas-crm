'use client'

import { useState, useEffect } from 'react'

interface Stats {
  totalThreads: number
  unreadThreads: number
  todayMessages: number
  avgResponseTime: number
  channelStats: {
    telegram: number
    whatsapp: number
    email: number
    sms: number
  }
}

export function InboxStats() {
  const [stats, setStats] = useState<Stats>({
    totalThreads: 0,
    unreadThreads: 0,
    todayMessages: 0,
    avgResponseTime: 0,
    channelStats: {
      telegram: 0,
      whatsapp: 0,
      email: 0,
      sms: 0
    }
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      setLoading(true)
      
      // Mock data for now - replace with actual API call
      const mockStats: Stats = {
        totalThreads: 24,
        unreadThreads: 7,
        todayMessages: 156,
        avgResponseTime: 12,
        channelStats: {
          telegram: 15,
          whatsapp: 8,
          email: 1,
          sms: 0
        }
      }

      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 500))
      
      setStats(mockStats)
    } catch (error) {
      console.error('Error fetching stats:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg shadow p-6 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div className="h-8 bg-gray-200 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    )
  }

  const statCards = [
    {
      title: 'Активные диалоги',
      value: stats.totalThreads,
      icon: '💬',
      color: 'blue',
      description: 'Всего открытых диалогов'
    },
    {
      title: 'Непрочитанные',
      value: stats.unreadThreads,
      icon: '🔴',
      color: 'red',
      description: 'Требуют внимания'
    },
    {
      title: 'Сообщений сегодня',
      value: stats.todayMessages,
      icon: '📩',
      color: 'green',
      description: 'За последние 24 часа'
    },
    {
      title: 'Время ответа',
      value: `${stats.avgResponseTime}м`,
      icon: '⏱️',
      color: 'purple',
      description: 'Среднее время ответа'
    }
  ]

  const channelCards = [
    {
      name: 'Telegram',
      count: stats.channelStats.telegram,
      icon: '📱',
      color: 'blue'
    },
    {
      name: 'WhatsApp',
      count: stats.channelStats.whatsapp,
      icon: '💚',
      color: 'green'
    },
    {
      name: 'Email',
      count: stats.channelStats.email,
      icon: '📧',
      color: 'gray'
    },
    {
      name: 'SMS',
      count: stats.channelStats.sms,
      icon: '📲',
      color: 'orange'
    }
  ]

  return (
    <div className="space-y-6">
      {/* Main Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, index) => (
          <div key={index} className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">
                  {card.title}
                </p>
                <p className="text-3xl font-bold text-gray-900">
                  {card.value}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {card.description}
                </p>
              </div>
              <div className="text-3xl">
                {card.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Channel Distribution */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          📊 Распределение по каналам
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {channelCards.map((channel, index) => (
            <div key={index} className="text-center p-4 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
              <div className="text-2xl mb-2">
                {channel.icon}
              </div>
              <p className="text-sm font-medium text-gray-600 mb-1">
                {channel.name}
              </p>
              <p className="text-xl font-bold text-gray-900">
                {channel.count}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          ⚡ Быстрые действия
        </h3>
        <div className="flex flex-wrap gap-3">
          <button className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors">
            <span className="mr-2">📱</span>
            Настроить Telegram
          </button>
          <button className="inline-flex items-center px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors">
            <span className="mr-2">💚</span>
            Настроить WhatsApp
          </button>
          <button className="inline-flex items-center px-4 py-2 bg-gray-600 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors">
            <span className="mr-2">📧</span>
            Настроить Email
          </button>
          <button className="inline-flex items-center px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 transition-colors">
            <span className="mr-2">📊</span>
            Посмотреть отчеты
          </button>
        </div>
      </div>
    </div>
  )
}