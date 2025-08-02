import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

interface TelegramUpdate {
  type: 'new_message' | 'message_updated' | 'file_uploaded';
  sessionId: string;
  chatId: string;
  data: any;
}

interface UserSession {
  socketId: string;
  userId: string;
  userRole: 'ADMIN' | 'MANAGER';
  assignedChatIds?: string[]; // Для менеджеров - ID назначенных чатов
}

@WebSocketGateway({
  cors: {
    origin: "*", // В продакшне ограничить конкретными доменами
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 600000, // 10 минут для ping timeout (для длительных операций)
  pingInterval: 25000,  // Интервал ping 25 секунд
  connectTimeout: 60000 // Timeout подключения 1 минута
})
export class MessagingWebSocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('WebSocketGateway');
  
  // Хранилище: sessionId -> Set<socketId>
  private sessionSockets = new Map<string, Set<string>>();
  
  // Хранилище пользователей: socketId -> UserSession
  private userSessions = new Map<string, UserSession>();

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    
    // Удаляем информацию о пользователе
    this.userSessions.delete(client.id);
    
    // Удаляем клиента из всех сессий
    for (const [sessionId, sockets] of this.sessionSockets.entries()) {
      if (sockets.has(client.id)) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.sessionSockets.delete(sessionId);
        }
        this.logger.log(`Removed client ${client.id} from session ${sessionId}`);
        break;
      }
    }
  }

  /**
   * Клиент подписывается на обновления для конкретной Telegram сессии
   */
  @SubscribeMessage('subscribe_to_session')
  handleSubscription(
    @MessageBody() data: { 
      sessionId: string;
      userId?: string;
      userRole?: 'ADMIN' | 'MANAGER';
      assignedChatIds?: string[];
    },
    @ConnectedSocket() client: Socket,
  ) {
    const { sessionId, userId, userRole, assignedChatIds } = data;
    
    if (!sessionId) {
      client.emit('error', 'sessionId is required');
      return;
    }

    // Сохраняем информацию о пользователе
    if (userId && userRole) {
      this.userSessions.set(client.id, {
        socketId: client.id,
        userId,
        userRole,
        assignedChatIds: assignedChatIds || []
      });
    }

    // Добавляем клиента к сессии
    if (!this.sessionSockets.has(sessionId)) {
      this.sessionSockets.set(sessionId, new Set());
    }
    
    this.sessionSockets.get(sessionId)!.add(client.id);
    this.logger.log(`Client ${client.id} (${userRole}:${userId}) subscribed to session ${sessionId}`);
    
    client.emit('subscription_confirmed', { sessionId });
  }

  /**
   * Клиент отписывается от сессии
   */
  @SubscribeMessage('unsubscribe_from_session')
  handleUnsubscription(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { sessionId } = data;
    
    if (this.sessionSockets.has(sessionId)) {
      this.sessionSockets.get(sessionId)!.delete(client.id);
      if (this.sessionSockets.get(sessionId)!.size === 0) {
        this.sessionSockets.delete(sessionId);
      }
    }
    
    this.logger.log(`Client ${client.id} unsubscribed from session ${sessionId}`);
    client.emit('unsubscription_confirmed', { sessionId });
  }

  /**
   * Отправить обновление клиентам с учетом ролей и назначений
   */
  sendTelegramUpdate(update: TelegramUpdate) {
    const { sessionId, chatId } = update;
    const sockets = this.sessionSockets.get(sessionId);
    
    if (!sockets || sockets.size === 0) {
      this.logger.debug(`No clients subscribed to session ${sessionId}`);
      return;
    }

    let sentCount = 0;

    // Отправляем обновление с учетом ролей пользователей
    for (const socketId of sockets) {
      const userSession = this.userSessions.get(socketId);
      
      if (!userSession) {
        // Если информация о пользователе отсутствует, отправляем (обратная совместимость)
        this.server.to(socketId).emit('telegram_update', update);
        sentCount++;
        continue;
      }

      // Проверяем права доступа на основе роли
      if (userSession.userRole === 'ADMIN') {
        // Админы видят все сообщения
        this.server.to(socketId).emit('telegram_update', update);
        sentCount++;
      } else if (userSession.userRole === 'MANAGER') {
        // Менеджеры видят только назначенные им чаты
        if (userSession.assignedChatIds && userSession.assignedChatIds.includes(chatId)) {
          // Анонимизируем данные для менеджеров
          const anonymizedUpdate = this.anonymizeUpdateForManager(update);
          this.server.to(socketId).emit('telegram_update', anonymizedUpdate);
          sentCount++;
        }
      }
    }
    
    this.logger.log(`Sent ${update.type} update to ${sentCount}/${sockets.size} clients for session ${sessionId} (chat: ${chatId})`);
  }

  /**
   * Анонимизировать данные сообщения для менеджеров
   */
  private anonymizeUpdateForManager(update: TelegramUpdate): TelegramUpdate {
    const anonymized = { ...update };
    
    // Скрываем чувствительную информацию
    if (anonymized.data) {
      anonymized.data = {
        ...anonymized.data,
        // Скрываем номера телефонов и username'ы
        fromId: anonymized.data.fromId ? 'hidden' : undefined,
        peerId: anonymized.data.peerId ? 'hidden' : undefined,
        // Оставляем только необходимую информацию для работы
        messageId: anonymized.data.messageId,
        text: anonymized.data.text,
        date: anonymized.data.date,
        isIncoming: anonymized.data.isIncoming,
        isOutgoing: anonymized.data.isOutgoing
      };
    }
    
    return anonymized;
  }

  /**
   * Отправить произвольное сообщение всем клиентам, подписанным на конкретную сессию
   */
  sendToSession(sessionId: string, message: any) {
    const sockets = this.sessionSockets.get(sessionId);
    
    if (!sockets || sockets.size === 0) {
      this.logger.debug(`No clients subscribed to session ${sessionId}`);
      return;
    }

    // Отправляем сообщение всем подписанным клиентам
    for (const socketId of sockets) {
      this.server.to(socketId).emit('session_message', message);
    }
    
    this.logger.debug(`Sent message to ${sockets.size} clients for session ${sessionId}`);
  }

  /**
   * Получить количество подключенных клиентов для сессии
   */
  getSessionClientsCount(sessionId: string): number {
    return this.sessionSockets.get(sessionId)?.size || 0;
  }

  /**
   * Получить все активные сессии
   */
  getActiveSessions(): string[] {
    return Array.from(this.sessionSockets.keys());
  }
}