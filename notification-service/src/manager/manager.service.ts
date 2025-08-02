import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import axios from 'axios';
import { TelegramServiceV2 } from '../telegram-user/telegram-service-v2';
import { MessagingWebSocketGateway } from '../websocket/websocket.gateway';

export interface AnonymizedChatInfo {
  id: string;
  title: string;
  contact: string;
  status: string;
  channel: string;
  lastActivity: string;
}

export interface AnonymizedMessage {
  id: string;
  content: string;
  timestamp: string;
  sender: string;
  isFromManager: boolean;
  messageType: 'text' | 'image' | 'file';
}

export interface ManagerStats {
  totalAssignedChats: number;
  activeChats: number;
  totalMessages: number;
  messagesThisWeek: number;
}

@Injectable()
export class ManagerService {
  private readonly logger = new Logger(ManagerService.name);

  constructor(
    private readonly telegramServiceV2: TelegramServiceV2,
    private readonly webSocketGateway: MessagingWebSocketGateway,
    private readonly dataSource: DataSource
  ) {}

  /**
   * Получить анонимизированную информацию о чате
   */
  async getAnonymizedChatInfo(chatId: string): Promise<AnonymizedChatInfo> {
    try {
      // Получаем информацию о чате из Telegram API
      const sessionId = await this.getActiveTelegramSession();
      
      // Для простоты возвращаем mock данные с анонимизацией
      // В реальной системе здесь будет запрос к Telegram API
      return {
        id: chatId,
        title: `Диалог с контактом`,
        contact: `Контакт #${chatId.slice(-4)}`, // Показываем только последние 4 цифры
        status: 'Активен',
        channel: 'Telegram',
        lastActivity: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error(`Failed to get chat info: ${error.message}`);
      throw error;
    }
  }

  /**
   * Получить анонимизированную историю сообщений
   */
  async getAnonymizedChatMessages(
    chatId: string, 
    limit: number = 50, 
    offset: number = 0
  ): Promise<AnonymizedMessage[]> {
    try {
      const sessionId = await this.getActiveTelegramSession();
      
      if (!sessionId) {
        this.logger.warn('No active Telegram session found');
        return [];
      }

      // Получаем историю из Telegram API
      const messages = await this.telegramServiceV2.getChatHistory(sessionId, chatId, limit);
      
      // Анонимизируем сообщения для менеджера
      const anonymizedMessages: AnonymizedMessage[] = (messages || []).map((msg: any, index: number) => {
        // Файлы обрабатываются с правильными названиями и иконками
        
        const messageType = this.detectMessageType(msg);
        let content = msg.message || msg.text || '';
        
        // Обрабатываем файлы правильно (независимо от наличия msg.message)
        if (messageType === 'file' && msg.media?.document) {
          const document = msg.media.document;
          let fileName = 'Документ';
          
          // Извлекаем имя файла из атрибутов
          if (document.attributes) {
            for (const attr of document.attributes) {
              if (attr.fileName || (attr.className && attr.className.includes('DocumentAttributeFilename'))) {
                fileName = attr.fileName || attr.file_name || fileName;
                break;
              }
              if (attr._ === 'documentAttributeFilename' || attr._name === 'DocumentAttributeFilename') {
                fileName = attr.fileName || attr.file_name || fileName;
                break;
              }
            }
          }
          
          // Если не нашли в атрибутах, используем msg.message как fallback
          if (fileName === 'Документ' && content) {
            fileName = content;
          }
          
          // Определяем иконку по MIME типу
          const mimeType = document.mimeType || document.mime_type || '';
          let icon = '📄';
          if (mimeType.startsWith('image/')) {
            icon = '🖼️';
          } else if (mimeType.startsWith('video/')) {
            icon = '🎥';
          } else if (mimeType.startsWith('audio/')) {
            icon = '🎧';
          }
          
          // Всегда показываем файл с иконкой и именем
          content = `${icon} ${fileName}`;
        } else if (messageType === 'image') {
          content = content ? `🖼️ Изображение\n${content}` : '🖼️ Изображение';
        } else if (!content) {
          content = '[Медиа файл]';
        }

        return {
          id: msg.id?.toString() || index.toString(),
          content: content,
          timestamp: msg.date ? new Date(msg.date * 1000).toISOString() : new Date().toISOString(),
          sender: msg.out ? 'Менеджер' : 'Контакт', // Не показываем реальные имена
          isFromManager: msg.out || false,
          messageType: messageType
        };
      });

      // Сортируем сообщения по времени (старые первые)
      const sortedMessages = anonymizedMessages.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      this.logger.log(`Retrieved ${sortedMessages.length} anonymized messages for chat ${chatId}`);
      return sortedMessages;
      
    } catch (error) {
      this.logger.error(`Failed to get chat messages: ${error.message}`);
      // Возвращаем пустой массив вместо ошибки для лучшего UX
      return [];
    }
  }

  /**
   * Отправить сообщение от имени менеджера
   */
  async sendMessageAsManager(
    chatId: string,
    content: string,
    messageType: 'text' | 'image' | 'file' = 'text',
    managerId?: string
  ): Promise<{ messageId: string; sentAt: string }> {
    try {
      const sessionId = await this.getActiveTelegramSession();
      
      if (!sessionId) {
        throw new Error('No active Telegram session available');
      }

      // Отправляем сообщение через Telegram API
      const result = await this.telegramServiceV2.sendMessage(sessionId, {
        chatId: chatId,
        message: content,
        parseMode: undefined
      });

      // Отправляем real-time обновление через WebSocket
      const update = {
        type: 'new_message' as const,
        sessionId: sessionId,
        chatId: chatId,
        data: {
          messageId: result.messageId,
          text: content,
          date: new Date().toISOString(),
          isOutgoing: true,
          fromManager: true,
          managerId: managerId
        }
      };

      this.webSocketGateway.sendTelegramUpdate(update);

      this.logger.log(`Manager message sent to chat ${chatId}: ${result.messageId}`);
      
      return {
        messageId: result.messageId?.toString() || Date.now().toString(),
        sentAt: new Date().toISOString()
      };
      
    } catch (error) {
      this.logger.error(`Failed to send manager message: ${error.message}`);
      throw error;
    }
  }

  /**
   * Отправить файл от имени менеджера
   */
  async sendFileAsManager(
    chatId: string,
    file: Express.Multer.File,
    managerId?: string
  ): Promise<{ messageId: string; sentAt: string }> {
    try {
      const sessionId = await this.getActiveTelegramSession();
      
      if (!sessionId) {
        throw new Error('No active Telegram session available');
      }

      // Отправляем файл через Telegram API
      const result = await this.telegramServiceV2.sendFile(
        sessionId, 
        chatId, 
        file, 
        file.originalname || 'Файл от менеджера'
      );

      // Отправляем real-time обновление через WebSocket
      const update = {
        type: 'new_message' as const,
        sessionId: sessionId,
        chatId: chatId,
        data: {
          messageId: result.messageId,
          text: `📎 ${file.originalname || 'Файл'}`,
          date: new Date().toISOString(),
          isOutgoing: true,
          fromManager: true,
          managerId: managerId,
          messageType: 'file'
        }
      };

      this.webSocketGateway.sendTelegramUpdate(update);

      this.logger.log(`Manager file sent to chat ${chatId}: ${result.messageId}`);
      
      return {
        messageId: result.messageId?.toString() || Date.now().toString(),
        sentAt: new Date().toISOString()
      };
      
    } catch (error) {
      this.logger.error(`Failed to send manager file: ${error.message}`);
      throw error;
    }
  }

  /**
   * Получить статистику для менеджера
   */
  async getManagerStats(managerId?: string): Promise<ManagerStats> {
    try {
      if (!managerId) {
        return {
          totalAssignedChats: 0,
          activeChats: 0,
          totalMessages: 0,
          messagesThisWeek: 0
        };
      }

      // Получаем реальное количество назначенных чатов из БД через прямой SQL
      const uniqueChatsCount = await this.dataSource.query(`
        SELECT COUNT(DISTINCT thread_id) as count
        FROM chat_assignments 
        WHERE manager_id = $1 AND is_active = $2
      `, [managerId, true]);

      const totalAssignedChats = parseInt(uniqueChatsCount[0]?.count || 0, 10);

      return {
        totalAssignedChats,
        activeChats: totalAssignedChats, // Пока считаем что все чаты активны
        totalMessages: 150, // Mock данные
        messagesThisWeek: 25 // Mock данные
      };
    } catch (error) {
      this.logger.error(`Failed to get manager stats: ${error.message}`);
      // Fallback к mock данным
      return {
        totalAssignedChats: 1,
        activeChats: 1,
        totalMessages: 150,
        messagesThisWeek: 25
      };
    }
  }

  /**
   * Получить список назначенных чатов для менеджера
   */
  /**
   * Получить ID назначенных чатов для менеджера
   */
  async getAssignedThreadIds(managerId: string): Promise<string[]> {
    try {
      this.logger.log(`Getting assigned thread IDs for manager: ${managerId}`);
      
      // Получаем назначения из БД (поддерживаем поиск по ID или email)
      let assignments;
      
      // Проверяем является ли managerId UUID или email
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(managerId);
      
      if (isUUID) {
        // Поиск по UUID
        assignments = await this.dataSource.query(`
          SELECT thread_id FROM chat_assignments 
          WHERE manager_id = $1 AND is_active = true
          ORDER BY assigned_at DESC
        `, [managerId]);
      } else {
        // Поиск по email
        assignments = await this.dataSource.query(`
          SELECT ca.thread_id 
          FROM chat_assignments ca
          INNER JOIN users u ON ca.manager_id = u.id
          WHERE u.email = $1 AND ca.is_active = true
          ORDER BY ca.assigned_at DESC
        `, [managerId]);
      }
      
      const threadIds = assignments.map((assignment: any) => assignment.thread_id);
      
      this.logger.log(`Found ${threadIds.length} assigned thread IDs for manager ${managerId}`);
      return threadIds;
    } catch (error) {
      this.logger.error(`Error getting assigned thread IDs: ${error.message}`);
      throw error;
    }
  }

  async getAssignedChats(managerId: string): Promise<AnonymizedChatInfo[]> {
    this.logger.log(`Getting assigned chats for manager: ${managerId}`);
    this.logger.log(`🔥 NEW CODE VERSION - SHOULD RETURN REAL CHATS!!! 🔥`);
    
    try {
      // Получаем реальные назначенные чаты из БД
      const threadIds = await this.getAssignedThreadIds(managerId);
      
      if (threadIds.length === 0) {
        this.logger.log(`No assigned chats found for manager ${managerId}`);
        return [];
      }
      
      // Создаем анонимизированную информацию о чатах
      const chats: AnonymizedChatInfo[] = threadIds.map((threadId, index) => {
        const chatNumber = threadId.replace('telegram_thread_', '');
        return {
          id: threadId,
          title: `Telegram Chat #${index + 1}`,
          contact: `Контакт #${chatNumber}`,
          status: 'open',
          channel: 'Telegram', 
          lastActivity: new Date().toISOString()
        };
      });
      
      this.logger.log(`Returning ${chats.length} assigned chats for manager ${managerId}`);
      return chats;
    } catch (error) {
      this.logger.error(`Error getting assigned chats: ${error.message}`);
      throw error;
    }
  }

  /**
   * Получить активную Telegram сессию
   */
  private async getActiveTelegramSession(): Promise<string | null> {
    try {
      // Пока что возвращаем жестко заданную активную сессию
      // В будущем это должно быть получено из базы данных или конфигурации
      return 'tg_user_1754039348073_xnqhblt8r';
      
    } catch (error) {
      this.logger.error(`Failed to get active session: ${error.message}`);
      return null;
    }
  }

  /**
   * Определить тип сообщения
   */
  private detectMessageType(msg: any): 'text' | 'image' | 'file' {
    if (msg.media) {
      if (msg.media.photo || msg.media.type === 'MessageMediaPhoto') return 'image';
      if (msg.media.document || msg.media.type === 'MessageMediaDocument') return 'file';
    }
    return 'text';
  }

  /**
   * Получить список всех менеджеров
   */
  async getAllManagers(): Promise<any[]> {
    try {
      this.logger.log('Getting all managers from database');
      
      const managers = await this.dataSource.query(`
        SELECT 
          u.id, 
          u.email, 
          u.first_name, 
          u.last_name, 
          u.created_at,
          COUNT(ca.id) as chat_count
        FROM users u
        LEFT JOIN chat_assignments ca ON u.id = ca.manager_id AND ca.is_active = true
        WHERE u.role = 'MANAGER' AND u.is_active = true
        GROUP BY u.id, u.email, u.first_name, u.last_name, u.created_at
        ORDER BY u.first_name, u.last_name
      `);
      
      this.logger.log(`Found ${managers.length} managers`);
      return managers.map((manager: any) => ({
        id: manager.id,
        email: manager.email,
        name: `${manager.first_name || ''} ${manager.last_name || ''}`.trim() || manager.email,
        firstName: manager.first_name,
        lastName: manager.last_name,
        createdAt: manager.created_at,
        chatCount: parseInt(manager.chat_count) || 0
      }));
    } catch (error) {
      this.logger.error(`Error getting managers: ${error.message}`);
      throw error;
    }
  }

  /**
   * Назначить чат менеджеру через прямой вызов Kotlin CRM API
   */
  async assignChatToManager(threadId: string, managerId: string): Promise<any> {
    try {
      this.logger.log(`Assigning chat ${threadId} to manager ${managerId} directly in DB`);
      
      // Проверяем существует ли менеджер
      const manager = await this.dataSource.query(`
        SELECT id, email FROM users 
        WHERE id = $1 AND role = 'MANAGER' AND is_active = true
      `, [managerId]);
      
      if (!manager || manager.length === 0) {
        throw new Error(`Manager with ID ${managerId} not found or inactive`);
      }
      
      // Проверяем существует ли уже назначение для этого чата
      const existingAssignment = await this.dataSource.query(`
        SELECT id FROM chat_assignments 
        WHERE thread_id = $1 AND is_active = true
      `, [threadId]);
      
      if (existingAssignment && existingAssignment.length > 0) {
        // Деактивируем старое назначение
        await this.dataSource.query(`
          UPDATE chat_assignments 
          SET is_active = false
          WHERE thread_id = $1 AND is_active = true
        `, [threadId]);
        this.logger.log(`Deactivated existing assignment for thread ${threadId}`);
      }
      
      // Создаем новое назначение
      const result = await this.dataSource.query(`
        INSERT INTO chat_assignments (id, manager_id, thread_id, assigned_at, is_active, assigned_by)
        VALUES (gen_random_uuid(), $1, $2, NOW(), true, $3)
        RETURNING id, assigned_at
      `, [managerId, threadId, '11111111-1111-1111-1111-111111111111']); // Используем ID админа
      
      this.logger.log(`Successfully assigned chat ${threadId} to manager ${managerId}`);
      
      return {
        success: true,
        data: {
          assignmentId: result[0].id,
          threadId,
          managerId,
          assignedAt: result[0].assigned_at
        }
      };
    } catch (error) {
      this.logger.error(`Failed to assign chat: ${error.message}`);
      throw error;
    }
  }

  /**
   * Получить админский токен для вызова CRM API
   */
  private async getAdminToken(): Promise<string> {
    try {
      const response = await axios.post(
        'http://identity-service:3002/api/v1/auth/login',
        {
          email: 'admin@test.com',
          password: 'test123'
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 5000
        }
      );
      
      return response.data.data.accessToken;
    } catch (error) {
      this.logger.error(`Failed to get admin token: ${error.message}`);
      throw new Error('Failed to authenticate admin user');
    }
  }
}