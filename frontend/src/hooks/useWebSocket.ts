import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';

interface TelegramUpdate {
  type: 'new_message' | 'message_updated' | 'file_uploaded';
  sessionId: string;
  chatId: string;
  data: any;
}

interface UseWebSocketProps {
  sessionId?: string;
  onUpdate?: (update: TelegramUpdate) => void;
  enabled?: boolean;
}

export const useWebSocket = ({ sessionId, onUpdate, enabled = true }: UseWebSocketProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const isConnectingRef = useRef(false); // Защита от двойного подключения

  // Сохраняем onUpdate в ref для стабильности
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!enabled || !sessionId || isConnectingRef.current) return;
    
    isConnectingRef.current = true;

    console.log('🔄 useWebSocket: Creating connection for session:', sessionId);

    // Подключаемся к WebSocket серверу
    const wsUrl = process.env.NEXT_PUBLIC_MESSAGING_API_URL?.replace('/api/v1', '') || 'http://localhost:3003'
    const socket = io(wsUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    socketRef.current = socket;

    // Обработчики подключения
    socket.on('connect', () => {
      console.log('✅ Connected to WebSocket server');
      setIsConnected(true);
      setConnectionError(null);
      
      // Подписываемся на сессию если указана
      if (sessionId) {
        socket.emit('subscribe_to_session', { sessionId });
      }
    });

    socket.on('disconnect', () => {
      console.log('❌ Disconnected from WebSocket server');
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('❌ WebSocket connection error:', error);
      setConnectionError(error.message);
      setIsConnected(false);
    });

    // Подтверждение подписки
    socket.on('subscription_confirmed', (data: { sessionId: string }) => {
      console.log(`✅ Subscribed to session: ${data.sessionId}`);
      toast.success(`Connected to real-time updates for session ${data.sessionId.substring(0, 10)}...`);
    });

    // Обработка Telegram обновлений
    socket.on('telegram_update', (update: TelegramUpdate) => {
      console.log('📨 Received Telegram update:', update);
      
      // Показываем уведомление в зависимости от типа
      switch (update.type) {
        case 'new_message':
          toast.success(`📨 New message: ${update.data.text?.substring(0, 50)}...`);
          break;
        case 'file_uploaded':
          toast.success(`📎 File uploaded: ${update.data.fileName}`);
          break;
        case 'message_updated':
          toast(`✏️ Message updated`);
          break;
      }

      // Вызываем callback если предоставлен
      if (onUpdateRef.current) {
        onUpdateRef.current(update);
      }
    });

    // Обработка ошибок
    socket.on('error', (error: string) => {
      console.error('❌ WebSocket error:', error);
      toast.error(`WebSocket error: ${error}`);
    });

    // Cleanup при размонтировании
    return () => {
      console.log('🔌 Disconnecting WebSocket');
      isConnectingRef.current = false;
      socket.disconnect();
    };
  }, [enabled, sessionId]);

  // Методы для управления подпиской
  const subscribeToSession = (newSessionId: string) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('subscribe_to_session', { sessionId: newSessionId });
    }
  };

  const unsubscribeFromSession = (sessionIdToUnsubscribe: string) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('unsubscribe_from_session', { sessionId: sessionIdToUnsubscribe });
    }
  };

  return {
    isConnected,
    connectionError,
    subscribeToSession,
    unsubscribeFromSession,
    socket: socketRef.current,
  };
};

export default useWebSocket;