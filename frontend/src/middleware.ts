import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Защищённые маршруты, требующие аутентификации
const protectedRoutes = [
  '/admin',
  '/manager',
  '/inbox', 
  '/dashboard',
  '/contacts',
  '/opportunities',
  '/companies',
  '/settings',
  '/profile'
]

// Маршруты только для админов
const adminOnlyRoutes = [
  '/admin'
]

// Маршруты только для менеджеров  
const managerOnlyRoutes = [
  '/manager'
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Проверяем, является ли маршрут защищённым
  const isProtectedRoute = protectedRoutes.some(route => 
    pathname.startsWith(route)
  )
  
  if (!isProtectedRoute) {
    return NextResponse.next()
  }

  // В браузерной среде мы не можем получить localStorage
  // Поэтому просто пропускаем запрос, а проверку делаем на клиенте
  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}