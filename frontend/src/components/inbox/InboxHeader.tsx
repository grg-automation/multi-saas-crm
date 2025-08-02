'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

interface InboxHeaderProps {
  user: any
}

export function InboxHeader({ user }: InboxHeaderProps) {
  const router = useRouter()

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    router.push('/login')
  }

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Left side - Logo and Navigation */}
          <div className="flex items-center space-x-8">
            <Link href="/" className="flex items-center">
              <span className="text-xl font-bold text-gray-900">
                📧 CRM Inbox
              </span>
            </Link>
            
            <nav className="flex space-x-4">
              <Link 
                href="/inbox" 
                className="text-blue-600 font-medium px-3 py-2 rounded-md text-sm bg-blue-50"
              >
                Входящие
              </Link>
              <Link 
                href="/dashboard" 
                className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm hover:bg-gray-50"
              >
                Dashboard
              </Link>
              <Link 
                href="/contacts" 
                className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm hover:bg-gray-50"
              >
                Контакты
              </Link>
              <Link 
                href="/opportunities" 
                className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm hover:bg-gray-50"
              >
                Сделки
              </Link>
            </nav>
          </div>

          {/* Right side - User menu */}
          <div className="flex items-center space-x-4">
            {/* Notifications */}
            <button className="relative p-2 text-gray-600 hover:text-gray-900 rounded-md hover:bg-gray-50">
              <span className="sr-only">Уведомления</span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5zM10.8 21.8L9.2 17.2C8.8 16.4 8.8 15.6 9.2 14.8L12 8L14.8 14.8C15.2 15.6 15.2 16.4 14.8 17.2L13.2 21.8C12.6 23 11.4 23 10.8 21.8Z" />
              </svg>
              <span className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full text-xs text-white flex items-center justify-center">
                3
              </span>
            </button>

            {/* User info */}
            <div className="flex items-center space-x-3">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">
                  {user?.first_name} {user?.last_name}
                </p>
                <p className="text-xs text-gray-600">
                  {user?.email}
                </p>
              </div>
              <div className="h-8 w-8 bg-blue-600 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium text-white">
                  {user?.first_name?.[0]}{user?.last_name?.[0]}
                </span>
              </div>
            </div>

            {/* Logout */}
            <Button 
              onClick={handleLogout} 
              variant="outline" 
              size="sm"
            >
              Выйти
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}