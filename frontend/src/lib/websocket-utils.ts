// Утилиты для работы с WebSocket и получения sessionId

interface TelegramSession {
  id: string;
  phoneNumber: string;
  userId: string;
  isAuthenticated: boolean;
  isConnected: boolean;
  lastActivity: string;
}

interface SessionsResponse {
  success: boolean;
  sessions: TelegramSession[];
  count: number;
}

/**
 * Извлекает userId из threadId
 * @param threadId - ID треда (например: "telegram_thread_5032442070")
 * @returns userId или null
 */
export function extractUserIdFromThreadId(threadId: string): string | null {
  const match = threadId.match(/telegram_thread_(\d+)/);
  return match ? match[1] : null;
}

/**
 * Получает sessionId по threadId через API
 * Использует любую активную сессию для работы со всеми чатами
 * @param threadId - ID треда
 * @returns sessionId или null
 */
export async function getSessionIdByThreadId(threadId: string): Promise<string | null> {
  try {
    // Извлекаем userId из threadId
    const userId = extractUserIdFromThreadId(threadId);
    if (!userId) {
      console.warn('Cannot extract userId from threadId:', threadId);
      return null;
    }

    // Получаем все активные сессии
    const response = await fetch('http://localhost:3003/api/v1/telegram-user-v2/sessions');
    if (!response.ok) {
      console.error('Failed to fetch Telegram sessions:', response.status);
      return null;
    }

    const data: SessionsResponse = await response.json();
    
    // Берем любую активную и аутентифицированную сессию
    // Одна сессия может работать со всеми чатами через поллинг
    const session = data.sessions.find(s => s.isAuthenticated && s.isConnected);
    
    if (session) {
      console.log(`📍 Using active session for threadId ${threadId}:`, session.id);
      return session.id;
    } else {
      console.warn(`No active sessions available for threadId: ${threadId}`);
      return null;
    }
  } catch (error) {
    console.error('Error getting sessionId by threadId:', error);
    return null;
  }
}

/**
 * Проверяет, является ли threadId Telegram тредом
 * @param threadId - ID треда
 * @returns boolean
 */
export function isTelegramThread(threadId: string): boolean {
  return threadId.startsWith('telegram_thread_');
}