import { Injectable, Logger } from '@nestjs/common';
import { TelegramUserService } from './telegram-user.service';
import { MessagingWebSocketGateway } from '../websocket/websocket.gateway';

interface ChatLastMessage {
  chatId: string;
  lastMessageId: number;
  lastChecked: Date;
}

interface SessionPolling {
  sessionId: string;
  isActive: boolean;
  interval: NodeJS.Timeout | null;
  chatsTracking: Map<string, ChatLastMessage>;
}

@Injectable()
export class TelegramPollingService {
  private readonly logger = new Logger(TelegramPollingService.name);
  private readonly pollingSessions = new Map<string, SessionPolling>();
  private readonly POLLING_INTERVAL = 30000; // 30 секунд (уменьшаем частоту для стабильности)

  constructor(
    private readonly telegramUserService: TelegramUserService,
    private readonly webSocketGateway: MessagingWebSocketGateway,
  ) {}

  /**
   * Начать поллинг для сессии
   */
  async startPolling(sessionId: string): Promise<void> {
    try {
      this.logger.log(`Starting polling for session: ${sessionId}`);

      // Останавливаем существующий поллинг если есть
      this.stopPolling(sessionId);

      // Получаем список чатов для этой сессии
      const chats = await this.telegramUserService.getUserChats(sessionId);
      
      if (!chats || chats.length === 0) {
        this.logger.warn(`No chats found for session ${sessionId}`);
        return;
      }

      // Инициализируем трекинг чатов
      const chatsTracking = new Map<string, ChatLastMessage>();
      
      for (const chat of chats) {
        const chatId = this.extractChatId(chat);
        if (chatId) {
          // Получаем текущий последний ID сообщения
          const lastMessageId = await this.getLastMessageId(sessionId, chatId);
          
          chatsTracking.set(chatId, {
            chatId,
            lastMessageId: lastMessageId || 0,
            lastChecked: new Date()
          });
          
          // this.logger.log(`Tracking chat ${chatId} with lastMessageId: ${lastMessageId}`); // Убираем для уменьшения спама логов
        }
      }

      // Создаем сессию поллинга
      const sessionPolling: SessionPolling = {
        sessionId,
        isActive: true,
        interval: null,
        chatsTracking
      };

      this.pollingSessions.set(sessionId, sessionPolling);

      // Запускаем интервал поллинга
      sessionPolling.interval = setInterval(async () => {
        await this.pollSessionChats(sessionId);
      }, this.POLLING_INTERVAL);

      this.logger.log(`Polling started for session ${sessionId} with ${chatsTracking.size} chats`);
    } catch (error) {
      this.logger.error(`Failed to start polling for session ${sessionId}:`, error);
    }
  }

  /**
   * Остановить поллинг для сессии
   */
  stopPolling(sessionId: string): void {
    const sessionPolling = this.pollingSessions.get(sessionId);
    
    if (sessionPolling) {
      sessionPolling.isActive = false;
      
      if (sessionPolling.interval) {
        clearInterval(sessionPolling.interval);
        sessionPolling.interval = null;
      }
      
      this.pollingSessions.delete(sessionId);
      this.logger.log(`Polling stopped for session: ${sessionId}`);
    }
  }

  /**
   * Проверить новые сообщения для всех чатов сессии
   */
  private async pollSessionChats(sessionId: string): Promise<void> {
    const sessionPolling = this.pollingSessions.get(sessionId);
    
    if (!sessionPolling || !sessionPolling.isActive) {
      return;
    }

    try {
      // Проверяем каждый чат
      for (const [chatId, chatTracking] of sessionPolling.chatsTracking) {
        await this.checkChatForNewMessages(sessionId, chatId, chatTracking);
      }
    } catch (error) {
      this.logger.error(`Error during polling for session ${sessionId}:`, error);
    }
  }

  /**
   * Проверить новые сообщения в конкретном чате  
   */
  private async checkChatForNewMessages(
    sessionId: string, 
    chatId: string, 
    chatTracking: ChatLastMessage
  ): Promise<void> {
    try {
      // Получаем историю чата (только последние 5 сообщений для поллинга)
      const messages = await this.telegramUserService.getChatHistory(sessionId, chatId, 5);
      
      if (!messages || messages.length === 0) {
        return;
      }

      // Фильтруем новые сообщения (с ID больше последнего известного)
      const newMessages = messages.filter(msg => msg.id > chatTracking.lastMessageId);
      
      if (newMessages.length > 0) {
        this.logger.log(`Found ${newMessages.length} new messages in chat ${chatId}`);
        
        // Обрабатываем новые сообщения
        for (const message of newMessages) {
          await this.processNewMessage(sessionId, chatId, message);
        }
        
        // Обновляем последний ID сообщения
        const latestMessageId = Math.max(...newMessages.map(msg => msg.id));
        chatTracking.lastMessageId = latestMessageId;
        chatTracking.lastChecked = new Date();
        
        this.logger.log(`Updated lastMessageId for chat ${chatId}: ${latestMessageId}`);
      }
    } catch (error) {
      // Обработка FLOOD_WAIT в поллинге
      if (error?.error_message?.includes('FLOOD_WAIT')) {
        const waitTime = parseInt(error.error_message.match(/\d+/)?.[0] || '60');
        this.logger.warn(`FLOOD_WAIT during polling chat ${chatId}: pausing for ${waitTime} seconds`);
        
        // Временно останавливаем поллинг для этой сессии
        const polling = this.pollingSessions.get(sessionId);
        if (polling && polling.interval) {
          this.logger.log(`Temporarily stopping polling for session ${sessionId} due to rate limit`);
          clearInterval(polling.interval);
          
          // Возобновляем поллинг через указанное время + буфер
          setTimeout(() => {
            this.logger.log(`Resuming polling for session ${sessionId} after rate limit`);
            this.startPolling(sessionId);
          }, (waitTime + 5) * 1000);
        }
        return;
      }
      
      this.logger.error(`Error checking chat ${chatId} for new messages:`, error);
    }
  }

  /**
   * Обработать новое сообщение
   */
  private async processNewMessage(sessionId: string, chatId: string, message: any): Promise<void> {
    try {
      this.logger.log(`Processing new message ${message.id} in chat ${chatId}`);
      
      // Определяем тип сообщения
      const isIncoming = !message.out; // Входящее если не исходящее
      
      // Создаем WebSocket уведомление
      const telegramUpdate = {
        type: 'new_message' as const,
        sessionId: sessionId,
        chatId: chatId,
        data: {
          messageId: message.id,
          text: message.message || '',
          date: message.date,
          isIncoming: isIncoming,
          isOutgoing: !isIncoming,
          fromId: message.from_id?.user_id || null,
          peerId: message.peer_id?.user_id || chatId
        }
      };

      // Отправляем WebSocket уведомление
      this.webSocketGateway.sendTelegramUpdate(telegramUpdate);
      
      this.logger.log(`WebSocket notification sent for message ${message.id} in chat ${chatId}`);
    } catch (error) {
      this.logger.error(`Error processing new message ${message.id}:`, error);
    }
  }

  /**
   * Получить последний ID сообщения в чате
   */
  private async getLastMessageId(sessionId: string, chatId: string): Promise<number | null> {
    try {
      const messages = await this.telegramUserService.getChatHistory(sessionId, chatId, 5); // Берем 5 сообщений для надежности
      
      if (messages && messages.length > 0) {
        return messages[0].id;
      }
      
      return null;
    } catch (error) {
      this.logger.error(`Error getting last message ID for chat ${chatId}:`, error);
      return null;
    }
  }

  /**
   * Извлечь ID чата из объекта чата
   */
  private extractChatId(chat: any): string | null {
    try {
      // Для обычных пользователей
      if (chat.id) {
        return chat.id.toString();
      }
      
      // Для групп/каналов
      if (chat.peer && chat.peer.user_id) {
        return chat.peer.user_id.toString();
      }
      
      if (chat.peer && chat.peer.chat_id) {
        return chat.peer.chat_id.toString();
      }
      
      if (chat.peer && chat.peer.channel_id) {
        return chat.peer.channel_id.toString();
      }
      
      return null;
    } catch (error) {
      this.logger.error('Error extracting chat ID:', error);
      return null;
    }
  }

  /**
   * Получить статус поллинга
   */
  getPollingStatus(): any {
    const status = {};
    
    for (const [sessionId, sessionPolling] of this.pollingSessions) {
      status[sessionId] = {
        isActive: sessionPolling.isActive,
        chatsCount: sessionPolling.chatsTracking.size,
        chats: Array.from(sessionPolling.chatsTracking.values()).map(chat => ({
          chatId: chat.chatId,
          lastMessageId: chat.lastMessageId,
          lastChecked: chat.lastChecked
        }))
      };
    }
    
    return status;
  }

  /**
   * Очистка при завершении приложения
   */
  onModuleDestroy() {
    this.logger.log('Stopping all polling sessions...');
    
    for (const sessionId of this.pollingSessions.keys()) {
      this.stopPolling(sessionId);
    }
  }
}