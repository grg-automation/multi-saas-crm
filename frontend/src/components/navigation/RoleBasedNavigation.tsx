'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  Settings, 
  MessageCircle, 
  Users, 
  UserCog, 
  Shield,
  BarChart3,
  Menu,
  X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface User {
  id: string
  email: string
  fullName: string
  role: 'ADMIN' | 'MANAGER'
}

interface NavigationItem {
  label: string
  href: string
  icon: React.ReactNode
  roles: ('ADMIN' | 'MANAGER')[]
  badge?: string
}

const navigationItems: NavigationItem[] = [
  {
    label: 'Входящие',
    href: '/inbox',
    icon: <MessageCircle className="h-5 w-5" />,
    roles: ['ADMIN']
  },
  {
    label: 'Мои чаты',
    href: '/manager/inbox',
    icon: <MessageCircle className="h-5 w-5" />,
    roles: ['MANAGER']
  },
  {
    label: 'Контакты',
    href: '/contacts',
    icon: <Users className="h-5 w-5" />,
    roles: ['ADMIN']
  },
  {
    label: 'Назначения чатов',
    href: '/admin/chat-assignments',
    icon: <UserCog className="h-5 w-5" />,
    roles: ['ADMIN']
  },
  {
    label: 'Аналитика',
    href: '/analytics',
    icon: <BarChart3 className="h-5 w-5" />,
    roles: ['ADMIN']
  },
  {
    label: 'Настройки',
    href: '/settings',
    icon: <Settings className="h-5 w-5" />,
    roles: ['ADMIN', 'MANAGER']
  }
]

interface RoleBasedNavigationProps {
  user?: User
  className?: string
}

export default function RoleBasedNavigation({ user, className = '' }: RoleBasedNavigationProps) {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    // Fetch unread counts based on user role
    if (user) {
      fetchUnreadCounts()
    }
  }, [user])

  const fetchUnreadCounts = async () => {
    try {
      let endpoint = '/api/v1/messaging/inbox/stats'
      if (user?.role === 'MANAGER') {
        endpoint += '?role=manager'
      }
      
      const response = await fetch(endpoint)
      if (response.ok) {
        const data = await response.json()
        setUnreadCounts({
          inbox: data.unreadCount || 0
        })
      }
    } catch (error) {
      console.error('Error fetching unread counts:', error)
    }
  }

  const filteredItems = navigationItems.filter(item => 
    user?.role && item.roles.includes(user.role)
  )

  const isActive = (href: string) => {
    if (href === '/' && pathname === '/') return true
    if (href !== '/' && pathname.startsWith(href)) return true
    return false
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return <Badge variant="destructive" className="text-xs">Админ</Badge>
      case 'MANAGER':
        return <Badge variant="secondary" className="text-xs">Менеджер</Badge>
      default:
        return null
    }
  }

  const getUnreadBadge = (href: string) => {
    if (href.includes('inbox') && unreadCounts.inbox > 0) {
      return (
        <Badge variant="destructive" className="ml-auto text-xs">
          {unreadCounts.inbox}
        </Badge>
      )
    }
    return null
  }

  if (!user) {
    return null
  }

  return (
    <>
      {/* Mobile menu button */}
      <div className="md:hidden fixed top-4 left-4 z-50">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          className="bg-white shadow-md"
        >
          {isOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </Button>
      </div>

      {/* Navigation sidebar */}
      <nav className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0 md:static md:inset-0
        ${className}
      `}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              <Shield className="h-8 w-8 text-blue-600" />
              <div>
                <h2 className="font-semibold text-gray-900">CRM</h2>
                <p className="text-xs text-gray-600">Multi-tenant</p>
              </div>
            </div>
            <div className="md:hidden">
              <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* User info */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium text-blue-600">
                  {user.fullName.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user.fullName}
                </p>
                <div className="flex items-center space-x-2">
                  <p className="text-xs text-gray-600">{user.email}</p>
                  {getRoleBadge(user.role)}
                </div>
              </div>
            </div>
          </div>

          {/* Navigation items */}
          <div className="flex-1 overflow-y-auto py-4">
            <nav className="space-y-1 px-3">
              {filteredItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={`
                    flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors
                    ${isActive(item.href)
                      ? 'bg-blue-100 text-blue-700 border-r-2 border-blue-600'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }
                  `}
                >
                  <span className="mr-3">{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  {getUnreadBadge(item.href)}
                </Link>
              ))}
            </nav>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-200">
            <div className="text-xs text-gray-500">
              <p>Версия 2.0.0</p>
              <p>© 2025 Multi-SaaS CRM</p>
            </div>
          </div>
        </div>
      </nav>

      {/* Overlay for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-30 bg-black bg-opacity-50 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  )
}

// Hook для получения текущего пользователя
export function useCurrentUser(): User | null {
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    const loadUserFromStorage = () => {
      try {
        const token = localStorage.getItem('token')
        const userData = localStorage.getItem('user')
        
        if (token && userData && userData !== 'undefined' && userData !== 'null') {
          const parsedUser = JSON.parse(userData)
          console.log('Loading user from localStorage:', parsedUser)
          
          // Преобразуем в формат ожидаемый компонентом
          const user: User = {
            id: parsedUser.id,
            email: parsedUser.email,
            fullName: `${parsedUser.firstName || ''} ${parsedUser.lastName || ''}`.trim() || parsedUser.email,
            role: parsedUser.role as 'ADMIN' | 'MANAGER'
          }
          
          setUser(user)
        }
      } catch (error) {
        console.error('Error loading user from localStorage:', error)
      }
    }

    loadUserFromStorage()
  }, [])

  return user
}