'use client'

import { useEffect, useState } from 'react'
import RoleBasedNavigation, { useCurrentUser } from '@/components/navigation/RoleBasedNavigation'
import { Loader2 } from 'lucide-react'

interface AuthenticatedLayoutProps {
  children: React.ReactNode
}

export default function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  const user = useCurrentUser()
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Симулируем загрузку пользователя
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 1000)

    return () => clearTimeout(timer)
  }, [])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
          <p className="mt-2 text-gray-600">Загрузка...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    // Redirect to login if not authenticated
    window.location.href = '/login'
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Navigation */}
      <RoleBasedNavigation user={user} />
      
      {/* Main content */}
      <div className="flex-1 md:ml-64">
        <main className="min-h-screen">
          {children}
        </main>
      </div>
    </div>
  )
}