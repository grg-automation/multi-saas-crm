import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { MessagingWebSocketGateway } from '../websocket/websocket.gateway';
const MTProto = require('@mtproto/core');

/**
 * Telegram User API Service для работы с MTProto
 * Позволяет подключаться как пользователь Telegram (не бот)
 * и отправлять сообщения от имени пользователя
 */

export interface TelegramUserSession {
  id: string;
  phoneNumber: string;
  userId?: number;
  isAuthenticated: boolean;
  isConnected: boolean;
  lastActivity: Date;
  phoneCodeHash?: string; // Для MTProto аутентификации
}

export interface TelegramUserMessage {
  chatId: string | number;
  message: string;
  parseMode?: 'HTML' | 'Markdown';
  replyToMessageId?: number;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  isBot?: boolean; // Для определения ботов
}

@Injectable()
export class TelegramUserService {
  private readonly logger = new Logger(TelegramUserService.name);
  private sessions = new Map<string, TelegramUserSession>();
  private clients = new Map<string, any>(); // MTProto clients
  private peerCache = new Map<string, { peer: any; timestamp: number }>(); // Кеш peer'ов
  private dialogsCache = new Map<string, { dialogs: any; timestamp: number }>(); // Кеш диалогов по сессии
  
  constructor(
    private configService: ConfigService,
    private webSocketGateway: MessagingWebSocketGateway,
  ) {
    this.initializeService();
  }

  private async initializeService() {
    this.logger.log('Initializing Telegram User API Service...');
    
    // Создать папку для сессий если не существует
    const sessionsDir = path.join(process.cwd(), 'telegram-sessions');
    if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true });
      this.logger.log(`Created sessions directory: ${sessionsDir}`);
    }
    
    // Восстановить сохраненные сессии при запуске
    await this.restoreSavedSessions();

    // Запускаем периодическую очистку кеша
    this.startCacheCleanup();

    this.logger.log('Telegram User API Service initialized');
  }

  /**
   * Запускает периодическую очистку кеша peer'ов
   */
  private startCacheCleanup(): void {
    // Очищаем кеш каждые 5 минут
    setInterval(() => {
      const now = Date.now();
      const cacheTimeout = 10 * 60 * 1000; // 10 минут
      let cleanedCount = 0;
      
      for (const [key, value] of this.peerCache.entries()) {
        if (now - value.timestamp > cacheTimeout) {
          this.peerCache.delete(key);
          cleanedCount++;
        }
      }
      
      if (cleanedCount > 0) {
        this.logger.debug(`Cleaned ${cleanedCount} expired peer cache entries`);
      }
    }, 5 * 60 * 1000); // 5 минут
    
    this.logger.log('Peer cache cleanup scheduled every 5 minutes');
  }
  
  /**
   * Восстановить MTProto клиента из файла сессии
   */
  private async recreateClientFromFile(session: TelegramUserSession): Promise<void> {
    try {
      const formattedPhone = this.formatPhoneNumber(session.phoneNumber);
      const sessionFilePath = path.join(process.cwd(), 'telegram-sessions', `${formattedPhone}.session`);
      
      // Проверяем существует ли файл сессии
      if (!fs.existsSync(sessionFilePath)) {
        throw new Error(`Session file not found: ${sessionFilePath}`);
      }
      
      // Создаем MTProto клиента - он автоматически загрузит сессию из файла
      const mtprotoConfig = this.getMTProtoConfig(session.phoneNumber);
      const client = new MTProto(mtprotoConfig);
      
      // Сохраняем клиента
      this.clients.set(session.id, client);
      
      this.logger.log(`MTProto client recreated for session ${session.id} from file ${sessionFilePath}`);
    } catch (error) {
      this.logger.error(`Failed to recreate MTProto client: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Сохранить сессию в файл для постоянного хранения
   */
  private async saveSessionToFile(session: TelegramUserSession): Promise<void> {
    try {
      const sessionsDir = path.join(process.cwd(), 'telegram-sessions'); 
      const sessionFile = path.join(sessionsDir, `${session.phoneNumber}.json`);
      
      const sessionData = {
        ...session,
        lastSaved: new Date().toISOString()
      };
      
      await fs.promises.writeFile(sessionFile, JSON.stringify(sessionData, null, 2));
      this.logger.log(`Session saved to file: ${sessionFile}`);
    } catch (error) {
      this.logger.error(`Failed to save session to file:`, error);
    }
  }
  
  /**
   * Восстановить все сохраненные сессии при запуске сервиса
   */
  private async restoreSavedSessions(): Promise<void> {
    try {
      const sessionsDir = path.join(process.cwd(), 'telegram-sessions');
      
      if (!fs.existsSync(sessionsDir)) {
        return;
      }
      
      const sessionFiles = await fs.promises.readdir(sessionsDir);
      let restoredCount = 0;
      
      for (const file of sessionFiles) {
        if (file.endsWith('.json')) {
          try {
            const sessionFile = path.join(sessionsDir, file);
            const sessionData = JSON.parse(await fs.promises.readFile(sessionFile, 'utf8'));
            
            // Восстанавливаем только аутентифицированные сессии
            if (sessionData.isAuthenticated) {
              const session: TelegramUserSession = {
                ...sessionData,
                lastActivity: new Date(sessionData.lastActivity)
              };
              
              this.sessions.set(session.id, session);
              
              // Попытаемся восстановить MTProto клиента из файла сессии
              try {
                await this.recreateClientFromFile(session);
                this.logger.log(`Restored MTProto client for ${session.phoneNumber} (${session.id})`);
              } catch (error) {
                this.logger.warn(`Failed to restore MTProto client for ${session.phoneNumber}: ${error.message}`);
              }
              
              restoredCount++;
            }
          } catch (error) {
            this.logger.warn(`Failed to restore session from ${file}: ${error.message}`);
          }
        }
      }
      
      this.logger.log(`Restored ${restoredCount} Telegram sessions from files`);
    } catch (error) {
      this.logger.warn(`Failed to restore sessions: ${error.message}`);
    }
  }

  /**
   * Форматировать номер телефона для MTProto
   * Удаляет все символы кроме цифр и добавляет валидацию
   */
  private formatPhoneNumber(phoneNumber: string): string {
    // Удаляем все символы кроме цифр
    let formatted = phoneNumber.replace(/\D/g, '');
    
    // Если номер начинается с 8, заменяем на 7 (для российских и казахстанских номеров)
    if (formatted.startsWith('8')) {
      formatted = '7' + formatted.slice(1);
    }
    
    // Валидация казахстанских номеров (+77)
    if (formatted.startsWith('77')) {
      if (formatted.length !== 11) {
        throw new Error(`Invalid Kazakhstan phone number format. Expected 11 digits, got ${formatted.length}`);
      }
      this.logger.debug(`Formatted Kazakhstan number: ${formatted}`);
      return formatted;
    }
    
    // Валидация российских номеров (+7)
    if (formatted.startsWith('7')) {
      if (formatted.length !== 11) {
        throw new Error(`Invalid Russian phone number format. Expected 11 digits, got ${formatted.length}`);
      }
      this.logger.debug(`Formatted Russian number: ${formatted}`);
      return formatted;
    }
    
    // Для других стран
    this.logger.debug(`Formatted international number: ${formatted}`);
    return formatted;
  }

  /**
   * Получить конфигурацию MTProto для региона
   */
  private getMTProtoConfig(phoneNumber: string) {
    const formatted = this.formatPhoneNumber(phoneNumber);
    
    const baseConfig = {
      api_id: parseInt(this.configService.get('TELEGRAM_API_ID') || '0'),
      api_hash: this.configService.get('TELEGRAM_API_HASH') || '',
      server: {
        dev: false, // Использовать production сервера
        api: {
          api_layer: 177, // Последняя версия API layer
          use_ipv6: false
        }
      }
    };
    
    // Специальная конфигурация для казахстанских номеров
    if (formatted.startsWith('77')) {
      this.logger.log('Using Kazakhstan-specific MTProto configuration with optimized connection pooling');
      return {
        ...baseConfig,
        server: {
          ...baseConfig.server,
          dc: {
            id: 2, // DC2 лучше подходит для Казахстана
            ip: '149.154.167.50',
            port: 443
          }
        },
        // Оптимизация соединений для быстрой загрузки
        connection: {
          retries: 5,
          timeout: 30000, // 30 секунд timeout
          keepAlive: true,
          useIPv6: false,
          // Оптимизация для параллельной загрузки файлов
          maxConcurrency: 12, // Максимум 12 одновременных запросов
          requestRetries: 3,
          floodSleep: false // Отключаем автоматическое ожидание при flood_wait
        },
        storageOptions: {
          path: path.join(process.cwd(), 'telegram-sessions', `${formatted}.session`)
        }
      };
    }
    
    // Стандартная конфигурация с оптимизацией соединений
    return {
      ...baseConfig,
      // Оптимизация соединений для всех регионов
      connection: {
        retries: 3,
        timeout: 20000, // 20 секунд timeout
        keepAlive: true,
        useIPv6: false,
        maxConcurrency: 8, // 8 одновременных запросов для стандартных регионов
        requestRetries: 2,
        floodSleep: false
      },
      storageOptions: {
        path: path.join(process.cwd(), 'telegram-sessions', `${formatted}.session`)
      }
    };
  }

  /**
   * Инициировать аутентификацию пользователя
   * 1. Отправляет код на телефон
   * 2. Возвращает session ID для продолжения процесса
   */
  async initiateAuth(phoneNumber: string): Promise<{ sessionId: string; codeSent: boolean }> {
    try {
      this.logger.log(`Initiating auth for phone: ${phoneNumber}`);
      
      // Форматируем номер телефона
      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      this.logger.log(`Formatted phone number: ${formattedPhone}`);
      
      const sessionId = this.generateSessionId();
      const session: TelegramUserSession = {
        id: sessionId,
        phoneNumber: formattedPhone,
        isAuthenticated: false,
        isConnected: false,
        lastActivity: new Date()
      };

      // Проверяем наличие API credentials и флаги принудительного режима
      const apiId = this.configService.get('TELEGRAM_API_ID');
      const apiHash = this.configService.get('TELEGRAM_API_HASH');
      const mtprotoEnabled = this.configService.get('TELEGRAM_MTPROTO_ENABLED') === 'true';
      const forceRealMode = this.configService.get('TELEGRAM_FORCE_REAL_MODE') === 'true';
      
      this.logger.log(`MTProto configuration: enabled=${mtprotoEnabled}, forceReal=${forceRealMode}, apiId=${apiId}`);
      
      if (!apiId || !apiHash || apiId === 'YOUR_API_ID_HERE') {
        throw new Error('Telegram API credentials not configured. Please set TELEGRAM_API_ID and TELEGRAM_API_HASH.');
      }
      
      if (!mtprotoEnabled) {
        throw new Error('MTProto is disabled. Set TELEGRAM_MTPROTO_ENABLED=true to enable.');
      }

      // Проверяем что credentials настроены правильно
      if (apiId !== '25350118' || !apiHash.startsWith('47911da0')) {
        this.logger.warn(`Invalid API credentials detected. Expected api_id: 25350118, got: ${apiId}`);
      }

      // Реальная MTProto инициализация
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          this.logger.log(`MTProto attempt ${retryCount + 1}/${maxRetries} for ${formattedPhone}`);
          
          const mtprotoConfig = this.getMTProtoConfig(formattedPhone);
          this.logger.debug(`MTProto config:`, JSON.stringify(mtprotoConfig, null, 2));
          
          const client = new MTProto(mtprotoConfig);
          
          // Настройки для отправки кода
          const codeSettings = {
            _: 'codeSettings',
            allow_flashcall: false,
            current_number: true,
            allow_app_hash: false, // Изменено на false для Kazakhstan
            allow_missed_call: false,
            allow_firebase: false,
            logout_tokens: []
          };
          
          this.logger.log(`Sending auth code to ${formattedPhone} with settings:`, codeSettings);
          
          const result = await client.call('auth.sendCode', {
            phone_number: formattedPhone,
            api_id: parseInt(apiId),
            api_hash: apiHash,
            settings: codeSettings
          });

          // Проверяем результат
          if (!result || !result.phone_code_hash) {
            throw new Error('Invalid response from auth.sendCode - missing phone_code_hash');
          }

          // Сохраняем phone_code_hash для завершения аутентификации
          session.phoneCodeHash = result.phone_code_hash;

          // Сохраняем клиент для дальнейшего использования
          this.clients.set(sessionId, client);
          this.sessions.set(sessionId, session);
          
          this.logger.log(`SUCCESS: Auth code sent to ${formattedPhone}. Session: ${sessionId}, Code hash: ${result.phone_code_hash.substring(0, 10)}...`);
          this.logger.log(`Code type: ${result.type?._}, timeout: ${result.timeout}s, next_type: ${result.next_type?._}`);
          
          return { sessionId, codeSent: true };
          
        } catch (mtprotoError) {
          retryCount++;
          this.logger.error(`MTProto attempt ${retryCount}/${maxRetries} failed:`, {
            error: mtprotoError.message,
            error_code: mtprotoError.error_code,
            error_message: mtprotoError.error_message,
            phone: formattedPhone,
            retry: retryCount < maxRetries
          });
          
          // Если это ошибка PHONE_NUMBER_INVALID, не пытаемся повторно
          if (mtprotoError.error_message?.includes('PHONE_NUMBER_INVALID')) {
            throw new Error(`Invalid phone number format: ${formattedPhone}. Please check the number and try again.`);
          }
          
          // Если это ошибка FLOOD_WAIT, ждем указанное время
          if (mtprotoError.error_message?.includes('FLOOD_WAIT')) {
            const waitTime = parseInt(mtprotoError.error_message.match(/\d+/)?.[0] || '60');
            throw new Error(`Rate limit exceeded. Please wait ${waitTime} seconds before trying again.`);
          }
          
          if (retryCount >= maxRetries) {
            this.logger.error(`All MTProto attempts failed. Falling back to DEV mode for debugging.`);
            // Fallback to mock if all attempts fail
            this.sessions.set(sessionId, session);
            return { sessionId, codeSent: true };
          }
          
          // Ждем перед повторной попыткой
          await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
        }
      }
      
      // Если дошли сюда, все попытки исчерпаны
      throw new Error('All authentication attempts failed');
    } catch (error) {
      this.logger.error(`Failed to initiate auth for ${phoneNumber}:`, {
        error: error.message,
        stack: error.stack,
        originalPhone: phoneNumber
      });
      throw new Error(`Authentication initiation failed: ${error.message}`);
    }
  }

  /**
   * Завершить аутентификацию с кодом подтверждения
   */
  async completeAuth(sessionId: string, code: string, password?: string): Promise<TelegramUserSession> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      if (!session.phoneCodeHash) {
        throw new Error('Invalid session state - missing phone code hash');
      }

      this.logger.log(`Completing auth for session: ${sessionId}, phone: ${session.phoneNumber}`);

      // Проверяем есть ли реальный MTProto клиент
      const client = this.clients.get(sessionId);
      
      if (!client) {
        throw new Error('MTProto client not found. Please re-initiate authentication.');
      }

      // Реальная MTProto аутентификация
      try {
        this.logger.log(`Attempting to sign in with code: ${code}, phone: ${session.phoneNumber}`);
        
        const result = await client.call('auth.signIn', {
          phone_number: session.phoneNumber,
          phone_code: code,
          phone_code_hash: session.phoneCodeHash
        });

        if (!result || !result.user) {
          throw new Error('Invalid auth.signIn response - missing user data');
        }

        session.isAuthenticated = true;
        session.isConnected = true;
        session.userId = result.user.id;
        session.lastActivity = new Date();
        
        // @mtproto/core автоматически сохраняет сессию в файл указанный в storageOptions.path
        this.logger.log(`MTProto session automatically saved to file for ${session.phoneNumber}`);
        
        this.sessions.set(sessionId, session);
        
        // Сохраняем сессию в файл для постоянного хранения
        await this.saveSessionToFile(session);
        
        this.logger.log(`SUCCESS: Authenticated session ${sessionId} for user ${session.userId} (${result.user.first_name} ${result.user.last_name || ''})`);
        return session;
        
      } catch (mtprotoError) {
        this.logger.error(`MTProto auth completion failed:`, {
          error: mtprotoError.message,
          error_code: mtprotoError.error_code,
          error_message: mtprotoError.error_message,
          session: sessionId,
          phone: session.phoneNumber,
          code_provided: code
        });
        
        // Обработка специфичных ошибок
        if (mtprotoError.error_message?.includes('PHONE_CODE_INVALID')) {
          throw new Error('Invalid verification code. Please check the code and try again.');
        }
        
        if (mtprotoError.error_message?.includes('PHONE_CODE_EXPIRED')) {
          throw new Error('Verification code has expired. Please request a new code.');
        }
        
        if (mtprotoError.error_message?.includes('SESSION_PASSWORD_NEEDED')) {
          throw new Error('Two-step verification is enabled. Please provide your password.');
        }
        
        throw mtprotoError;
      }
    } catch (error) {
      this.logger.error(`Failed to complete auth for session ${sessionId}:`, {
        error: error.message,
        stack: error.stack,
        session: sessionId
      });
      throw new Error(`Authentication completion failed: ${error.message}`);
    }
  }

  /**
   * Отправить сообщение от имени пользователя
   */
  async sendUserMessage(sessionId: string, message: TelegramUserMessage): Promise<any> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session || !session.isAuthenticated) {
        throw new Error('Session not authenticated');
      }

      this.logger.log(`Sending user message via session ${sessionId} to chat ${message.chatId}`);

      // Пытаемся отправить реальное сообщение через MTProto
      let client = this.clients.get(sessionId);
      if (!client) {
        this.logger.warn(`Client not found for session ${sessionId}, attempting to recreate`);
        try {
          client = await this.recreateClient(sessionId);
        } catch (error) {
          throw new Error(`Cannot recreate MTProto client: ${error.message}`);
        }
      }
      
      if (client) {
        try {
          this.logger.log(`Sending REAL message via MTProto to chat ${message.chatId}`);
          
          // Используем универсальный метод получения peer
          const peer = await this.getUniversalPeer(client, message.chatId, session.userId);
          if (!peer) {
            throw new Error(`Cannot send message to ${message.chatId} - peer not found`);
          }
          
          const result = await client.call('messages.sendMessage', {
            peer: peer,
            message: message.message,
            random_id: this.generateRandomId()
          });

          this.logger.log(`REAL MESSAGE SENT! Result:`, result);
          
          session.lastActivity = new Date();
          this.sessions.set(sessionId, session);

          return {
            message_id: result.id || result.updates?.[0]?.id,
            chat_id: message.chatId,
            text: message.message,
            date: Math.floor(Date.now() / 1000),
            from_user: true,
            real: true
          };
          
        } catch (mtprotoError) {
          this.logger.error(`Failed to send real message:`, mtprotoError);
          
          // Если ошибка PEER_ID_INVALID, инвалидируем кеш и пробуем еще раз
          if (mtprotoError.error_message === 'PEER_ID_INVALID') {
            this.logger.warn(`PEER_ID_INVALID for chat ${message.chatId}, invalidating cache and retrying`);
            
            // Удаляем неправильный peer из кеша
            this.peerCache.delete(`${message.chatId}`);
            
            // Также инвалидируем кеш диалогов для принудительного обновления
            const sessionKey = `session_${session.userId}`;
            this.dialogsCache.delete(sessionKey);
            this.logger.log(`Invalidated dialogs cache for fresh peer resolution`);
            
            // Пробуем получить peer заново без кеша
            const newPeer = await this.getUniversalPeer(client, message.chatId, session.userId);
            if (newPeer) {
              this.logger.log(`Retrying with new peer for chat ${message.chatId}:`, JSON.stringify(newPeer));
              
              try {
                const retryResult = await client.call('messages.sendMessage', {
                  peer: newPeer,
                  message: message.message,
                  random_id: this.generateRandomId()
                });

                this.logger.log(`RETRY MESSAGE SENT! Result:`, retryResult);
                
                session.lastActivity = new Date();
                this.sessions.set(sessionId, session);

                return {
                  message_id: retryResult.id || retryResult.updates?.[0]?.id,
                  chat_id: message.chatId,
                  text: message.message,
                  date: Math.floor(Date.now() / 1000),
                  from_user: true,
                  real: true
                };
              } catch (retryError) {
                this.logger.error(`Retry also failed:`, retryError);
                throw new Error(`Failed to send message even after retry: ${retryError.message}`);
              }
            } else {
              this.logger.error(`Could not resolve new peer for chat ${message.chatId}`);
              throw new Error(`Cannot find valid peer for chat ${message.chatId} - this chat may not be accessible`);
            }
          }
          
          throw new Error(`Failed to send message via MTProto: ${mtprotoError.message}`);
        }
      } else {
        throw new Error('MTProto client not available. Please re-authenticate.');
      }
    } catch (error) {
      this.logger.error(`Failed to send message via session ${sessionId}:`, error);
      throw new Error(`Message sending failed: ${error.message}`);
    }
  }

  /**
   * Проверить состояние MTProto клиента
   */
  private async validateClientConnection(sessionId: string): Promise<any> {
    const client = this.clients.get(sessionId);
    if (!client) {
      throw new Error('MTProto client not found');
    }

    try {
      // Проверяем соединение с простым запросом
      await Promise.race([
        client.call('help.getConfig'),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), 30000) // Увеличен timeout до 30 секунд
        )
      ]);
      return client;
    } catch (error) {
      this.logger.error(`Client connection validation failed for session ${sessionId}:`, error.message);
      throw new Error(`Client connection is not stable: ${error.message}`);
    }
  }

  /**
   * Восстановить MTProto клиент при ошибках
   */
  private async recreateClient(sessionId: string): Promise<any> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    this.logger.log(`Recreating MTProto client for session ${sessionId}`);
    
    // Удаляем старый клиент
    this.clients.delete(sessionId);
    
    // Создаем новый клиент
    const apiId = this.configService.get<string>('TELEGRAM_API_ID');
    const apiHash = this.configService.get<string>('TELEGRAM_API_HASH');
    
    if (!apiId || !apiHash) {
      throw new Error('API credentials not available');
    }
    
    const mtprotoConfig = this.getMTProtoConfig(session.phoneNumber);
    const newClient = new MTProto(mtprotoConfig);
    this.clients.set(sessionId, newClient);
    
    return newClient;
  }

  /**
   * Получить историю сообщений для чата с улучшенным алгоритмом
   */
  async getChatHistory(sessionId: string, chatId: string, limit = 20): Promise<any[]> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session || !session.isAuthenticated) {
        throw new Error('Session not authenticated');
      }

      this.logger.log(`Getting chat history for session ${sessionId}, chat ${chatId}`);

      const client = this.clients.get(sessionId);
      if (client) {
        try {
          // Сначала используем универсальный метод (более надежный для истории)
          let peer = await this.getUniversalPeer(client, chatId, session.userId);
          
          // Если не найден, пытаемся получить из кешированных диалогов
          if (!peer) {
            peer = await this.getPeerFromDialogsCache(client, chatId, session.userId);
          }
          
          if (!peer) {
            this.logger.warn(`Cannot get chat history for identifier ${chatId} - peer not found`);
            return [];
          }

          const result = await client.call('messages.getHistory', {
            peer: peer,
            limit: limit,
            offset_id: 0,
            offset_date: 0,
            add_offset: 0,
            max_id: 0,
            min_id: 0,
            hash: 0
          });

          this.logger.log(`Retrieved ${result.messages?.length || 0} messages for chat ${chatId}`);
          return result.messages || [];

        } catch (mtprotoError) {
          // Более детальная обработка ошибок
          if (mtprotoError.error_message === 'PEER_ID_INVALID') {
            // this.logger.warn(`Chat ${chatId} not accessible - no valid peer found`); // Убираем спам логов
            return []; // Отключаем альтернативные методы для избежания FLOOD_WAIT
          } else {
            this.logger.error(`Failed to get chat history:`, mtprotoError);
          }
          return [];
        }
      }

      return [];
    } catch (error) {
      this.logger.error(`Failed to get chat history for session ${sessionId}:`, error);
      return [];
    }
  }

  /**
   * Получить peer из кешированных диалогов (более надежно для истории)
   */
  private async getPeerFromDialogsCache(client: any, chatId: string | number, sessionUserId?: number): Promise<any> {
    try {
      const userId = typeof chatId === 'string' ? parseInt(chatId) : chatId;
      
      // Если это сам пользователь
      if (userId === sessionUserId) {
        return { _: 'inputPeerSelf' };
      }

      // Генерируем ключ кеша по сессии пользователя
      const sessionKey = `session_${sessionUserId}`;
      const now = Date.now();
      const CACHE_TTL = 5 * 60 * 1000; // 5 минут кеш

      // Проверяем кеш диалогов
      let dialogs;
      const cached = this.dialogsCache.get(sessionKey);
      if (cached && (now - cached.timestamp) < CACHE_TTL) {
        dialogs = cached.dialogs;
        this.logger.log(`Using cached dialogs for session ${sessionKey}`);
      } else {
        // Получаем диалоги если кеш устарел
        try {
          dialogs = await client.call('messages.getDialogs', {
            offset_date: 0,
            offset_id: 0,
            offset_peer: { _: 'inputPeerEmpty' },
            limit: 100, // Увеличиваем для лучшего поиска peer'ов
            hash: 0
          });
          
          // Сохраняем в кеш
          this.dialogsCache.set(sessionKey, { dialogs, timestamp: now });
          this.logger.log(`Cached dialogs for session ${sessionKey}`);
        } catch (error) {
          this.logger.error(`Failed to get dialogs for caching:`, error.message);
          return null;
        }
      }

      if (dialogs.dialogs && dialogs.users && dialogs.chats) {
        // Ищем пользователя в диалогах
        for (const dialog of dialogs.dialogs) {
          const peer = dialog.peer;
          
          if (peer._ === 'peerUser' && peer.user_id === userId) {
            const user = dialogs.users.find(u => u.id === peer.user_id);
            if (user && user.access_hash) {
              this.logger.log(`Found peer in dialogs cache for user ${userId} with access_hash`);
              return {
                _: 'inputPeerUser',
                user_id: userId,
                access_hash: user.access_hash
              };
            }
          } else if (peer._ === 'peerChat' && peer.chat_id === userId) {
            this.logger.log(`Found group chat in dialogs cache: ${userId}`);
            return {
              _: 'inputPeerChat',
              chat_id: userId
            };
          } else if (peer._ === 'peerChannel' && peer.channel_id === userId) {
            const channel = dialogs.chats.find(c => c.id === peer.channel_id);
            if (channel && channel.access_hash) {
              this.logger.log(`Found channel in dialogs cache: ${userId}`);
              return {
                _: 'inputPeerChannel',
                channel_id: userId,
                access_hash: channel.access_hash
              };
            }
          }
        }
      }

      return null;
    } catch (error) {
      this.logger.error(`Error getting peer from dialogs cache for ${chatId}:`, error.message);
      return null;
    }
  }

  /**
   * Альтернативный метод получения истории через username
   */
  private async getChatHistoryAlternative(client: any, chatId: string | number, limit: number, sessionUserId?: number): Promise<any[]> {
    try {
      const userId = typeof chatId === 'string' ? parseInt(chatId) : chatId;
      
      // Метод 1: Попытка через username если это строка
      if (typeof chatId === 'string' && /[a-zA-Z]/.test(chatId)) {
        const username = chatId.startsWith('@') ? chatId.slice(1) : chatId;
        
        this.logger.log(`Trying alternative method 1: resolving username ${username}`);
        
        try {
          const resolved = await client.call('contacts.resolveUsername', {
            username: username
          });
          
          if (resolved.users && resolved.users.length > 0) {
            const user = resolved.users[0];
            const peer = {
              _: 'inputPeerUser',
              user_id: user.id,
              access_hash: user.access_hash
            };
            
            const result = await client.call('messages.getHistory', {
              peer: peer,
              limit: limit,
              offset_id: 0,
              offset_date: 0,
              add_offset: 0,
              max_id: 0,
              min_id: 0,
              hash: 0
            });
            
            this.logger.log(`Alternative method 1 retrieved ${result.messages?.length || 0} messages`);
            return result.messages || [];
          }
        } catch (usernameError) {
          this.logger.warn(`Username resolution failed: ${usernameError.message}`);
        }
      }
      
      // Метод 2: Отключен для избежания FLOOD_WAIT
      // this.logger.log(`Alternative method 2 disabled to prevent FLOOD_WAIT`);
      
      return [];
    } catch (error) {
      this.logger.error(`All alternative history methods failed:`, error.message);
      return [];
    }
  }

  /**
   * Получить список чатов пользователя с улучшенной стабильностью
   */
  async getUserChats(sessionId: string): Promise<TelegramChat[]> {
    const maxRetries = 2;
    const timeout = 15000; // 15 секунд
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const session = this.sessions.get(sessionId);
        if (!session || !session.isAuthenticated) {
          throw new Error('Session not authenticated');
        }

        this.logger.log(`Getting chats attempt ${attempt}/${maxRetries} for session ${sessionId}`);

        // Получаем клиента без валидации (временно для стабильности)
        let client = this.clients.get(sessionId);
        if (!client) {
          this.logger.warn(`Client not found for session ${sessionId}, creating new one`);
          client = await this.recreateClient(sessionId);
        }
        
        if (!client) {
          throw new Error('MTProto client not available');
        }

        // 🚀 Используем принудительную синхронизацию для получения ВСЕХ реальных диалогов
        this.logger.log(`🔄 Using force sync to get ALL real dialogs for session ${sessionId}`);
        
        const dialogs = await this.forceSyncDialogs(client, session.userId);
        
        if (!dialogs) {
          throw new Error('Force sync failed - cannot get dialogs');
        }
        
        this.logger.log(`✅ Force sync successful: ${dialogs.dialogs.length} dialogs, ${dialogs.users.length} users, ${dialogs.chats.length} chats`);

        const chats: TelegramChat[] = [];
        
        // Обрабатываем dialogs
        if (dialogs.dialogs && dialogs.chats && dialogs.users) {
          for (const dialog of dialogs.dialogs) {
            const peer = dialog.peer;
            
            if (peer._ === 'peerUser') {
              // Находим пользователя (включая ботов для большего количества чатов)
              const user = dialogs.users.find(u => u.id === peer.user_id);
              // ✅ ПОКАЗЫВАЕМ всех реальных пользователей, но помечаем проблемных
              if (user) {
                if (user.access_hash) {
                  // ✅ Пользователь с access_hash - полностью рабочий
                  chats.push({
                    id: user.id,
                    type: 'private',
                    firstName: user.first_name || '',
                    lastName: user.last_name || '',
                    username: user.username || undefined, // ✅ Сохраняем username!
                    isBot: user.bot || false
                  });
                } else {
                  // ⚠️ Пользователь без access_hash - показываем но предупреждаем
                  this.logger.warn(`⚠️ Adding user ${user.id} WITHOUT access_hash (${user.first_name}) - may have limited functionality`);
                  chats.push({
                    id: user.id,
                    type: 'private',
                    firstName: (user.first_name || 'Unknown') + ' ⚠️',
                    lastName: user.last_name || '',
                    username: user.username || undefined,
                    isBot: user.bot || false
                  });
                }
              }
            } else if (peer._ === 'peerChat') {
              // Групповой чат
              const chat = dialogs.chats.find(c => c.id === peer.chat_id);
              if (chat) {
                chats.push({
                  id: chat.id,
                  type: 'group',
                  title: chat.title || 'Group Chat'
                });
              }
            } else if (peer._ === 'peerChannel') {
              // Каналы и супергруппы
              const channel = dialogs.chats.find(c => c.id === peer.channel_id);
              if (channel) {
                chats.push({
                  id: channel.id,
                  type: channel.megagroup ? 'supergroup' : 'channel',
                  title: channel.title || 'Channel',
                  username: channel.username || undefined
                });
              }
            }
          }
        }

        this.logger.log(`SUCCESS: Retrieved ${chats.length} REAL chats from ${dialogs.dialogs.length} force-synced dialogs on attempt ${attempt}`);
        session.lastActivity = new Date();
        this.sessions.set(sessionId, session);
        
        // Возвращаем ВСЕ найденные чаты (не ограничиваем до 15)
        // Это позволит увидеть всех пользователей из Telegram
        return chats;
        
      } catch (error) {
        const errorMsg = error?.message || error?.toString() || 'Unknown error';
        
        // Обработка FLOOD_WAIT
        if (error?.error_message?.includes('FLOOD_WAIT')) {
          const waitTime = parseInt(error.error_message.match(/\d+/)?.[0] || '60');
          this.logger.warn(`FLOOD_WAIT detected: waiting ${waitTime} seconds before retry`);
          
          if (attempt === maxRetries) {
            throw new Error(`Getting chats failed: Rate limited. Please wait ${waitTime} seconds.`);
          }
          
          // Ждем указанное время + небольшой буфер
          await new Promise(resolve => setTimeout(resolve, (waitTime + 2) * 1000));
          continue;
        }
        
        this.logger.error(`Get chats attempt ${attempt}/${maxRetries} failed:`, {
          error: errorMsg,
          sessionId,
          errorType: typeof error,
          errorObj: error
        });
        
        if (attempt === maxRetries) {
          // НЕ удаляем клиент при обычных ошибках - только пересоздаем при необходимости
          throw new Error(`Getting chats failed after ${maxRetries} attempts: ${errorMsg}`);
        }
        
        // Ждем перед следующей попыткой
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    return [];
  }

  /**
   * Слушать входящие сообщения (в реальной реализации)
   */
  async startListening(sessionId: string): Promise<void> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session || !session.isAuthenticated) {
        throw new Error('Session not authenticated');
      }

      this.logger.log(`Starting to listen for messages on session ${sessionId}`);

      // Активируем реальное прослушивание обновлений для WebSocket
      const client = this.clients.get(sessionId);
      if (!client) {
        throw new Error('MTProto client not found for session');
      }

      // Настраиваем слушатель обновлений MTProto
      this.setupUpdateListener(client, sessionId);

      session.lastActivity = new Date();
      this.sessions.set(sessionId, session);
    } catch (error) {
      this.logger.error(`Failed to start listening for session ${sessionId}:`, error);
      throw new Error(`Starting listener failed: ${error.message}`);
    }
  }

  /**
   * Получить информацию о сессии
   */
  getSession(sessionId: string): TelegramUserSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Получить все активные сессии
   */
  getAllSessions(): TelegramUserSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Отключить сессию
   */
  async disconnectSession(sessionId: string): Promise<void> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      this.logger.log(`Disconnecting session ${sessionId}`);

      // Закрыть MTProto клиент если существует
      const client = this.clients.get(sessionId);
      if (client) {
        // TODO: client.close();
        this.clients.delete(sessionId);
      }

      // Удалить сессию
      this.sessions.delete(sessionId);

      this.logger.log(`Session ${sessionId} disconnected`);
    } catch (error) {
      this.logger.error(`Failed to disconnect session ${sessionId}:`, error);
      throw new Error(`Disconnection failed: ${error.message}`);
    }
  }

  /**
   * Универсальный метод получения peer для любого чата (пользователи, группы, каналы)
   * Поддерживает user_id, chat_id, channel_id, username, и автоматический поиск с кешированием
   */
  private async getUniversalPeer(client: any, identifier: string | number, sessionUserId?: number): Promise<any> {
    try {
      // Если это сам пользователь
      if (identifier === sessionUserId?.toString() || identifier === sessionUserId) {
        return { _: 'inputPeerSelf' };
      }

      // Проверяем кеш (действителен 10 минут)
      const cacheKey = `${identifier}`;
      const cached = this.peerCache.get(cacheKey);
      const cacheTimeout = 10 * 60 * 1000; // 10 минут
      
      if (cached && (Date.now() - cached.timestamp) < cacheTimeout) {
        this.logger.debug(`Using cached peer for ${identifier}`);
        return cached.peer;
      }

      // Если это username (начинается с @ или содержит буквы)
      if (typeof identifier === 'string' && (identifier.startsWith('@') || /[a-zA-Z]/.test(identifier))) {
        const username = identifier.startsWith('@') ? identifier.slice(1) : identifier;
        
        this.logger.log(`Resolving username: ${username}`);
        
        try {
          const resolved = await client.call('contacts.resolveUsername', {
            username: username
          });
          
          // Проверяем пользователей
          if (resolved.users && resolved.users.length > 0) {
            const user = resolved.users[0];
            this.logger.log(`Username ${username} resolved to user ${user.id}`);
            
            const peer = {
              _: 'inputPeerUser',
              user_id: user.id,
              access_hash: user.access_hash
            };
            
            // Кешируем результат
            this.peerCache.set(cacheKey, { peer, timestamp: Date.now() });
            return peer;
          }
          
          // Проверяем каналы/группы
          if (resolved.chats && resolved.chats.length > 0) {
            const chat = resolved.chats[0];
            this.logger.log(`Username ${username} resolved to chat ${chat.id}, type: ${chat._ || 'unknown'}`);
            
            let peer;
            if (chat._ === 'channel' || chat._ === 'channelForbidden') {
              // Каналы и супергруппы
              peer = {
                _: 'inputPeerChannel',
                channel_id: chat.id,
                access_hash: chat.access_hash || 0
              };
            } else if (chat._ === 'chat' || chat._ === 'chatForbidden') {
              // Обычные группы
              peer = {
                _: 'inputPeerChat',
                chat_id: chat.id
              };
            } else {
              // Fallback для неизвестных типов
              peer = {
                _: 'inputPeerChannel',
                channel_id: chat.id,
                access_hash: chat.access_hash || 0
              };
            }
            
            // Кешируем результат
            this.peerCache.set(cacheKey, { peer, timestamp: Date.now() });
            return peer;
          }
        } catch (error) {
          this.logger.warn(`Failed to resolve username ${username}:`, error.message);
        }
      }

      // Если это ID (число) - пробуем найти username в диалогах
      const chatId = typeof identifier === 'string' ? parseInt(identifier) : identifier;
      if (!isNaN(chatId)) {
        
        // ✨ НОВЫЙ ПОДХОД: Ищем username для этого пользователя в диалогах
        const userWithUsername = await this.findUsernameForUser(client, chatId, sessionUserId);
        if (userWithUsername) {
          this.logger.log(`🎯 Found username @${userWithUsername} for user ${chatId}, using username resolution`);
          
          // Используем username вместо ID - это НАМНОГО надежнее!
          try {
            const resolved = await client.call('contacts.resolveUsername', {
              username: userWithUsername
            });
            
            if (resolved.users && resolved.users.length > 0) {
              const user = resolved.users[0];
              const peer = {
                _: 'inputPeerUser',
                user_id: user.id,
                access_hash: user.access_hash
              };
              
              this.logger.log(`✅ Successfully resolved @${userWithUsername} to peer with access_hash: ${user.access_hash}`);
              this.peerCache.set(cacheKey, { peer, timestamp: Date.now() });
              return peer;
            }
          } catch (usernameError) {
            this.logger.warn(`Username resolution failed for @${userWithUsername}:`, usernameError.message);
          }
        }

        // Fallback: старые методы если username не найден
        const dialogPeer = await this.getPeerFromDialogs(client, chatId, sessionUserId);
        if (dialogPeer) {
          this.peerCache.set(cacheKey, { peer: dialogPeer, timestamp: Date.now() });
          return dialogPeer;
        }

        const contactPeer = await this.getValidPeerForUser(client, chatId);
        if (contactPeer) {
          this.peerCache.set(cacheKey, { peer: contactPeer, timestamp: Date.now() });
          return contactPeer;
        }

        // Последний шанс: расширенные методы поиска
        const foundPeer = await this.findUserPeerWithAccessHash(client, chatId);
        if (foundPeer) {
          this.peerCache.set(cacheKey, { peer: foundPeer, timestamp: Date.now() });
          return foundPeer;
        }

        // В крайнем случае - НЕ используем fallback
        this.logger.error(`❌ All methods failed for chat ${chatId}, cannot create valid peer`);
        return null;
      }

      throw new Error(`Invalid identifier format: ${identifier}`);
      
    } catch (error) {
      this.logger.error(`Failed to get universal peer for ${identifier}:`, error.message);
      return null;
    }
  }

  /**
   * Получить peer из диалогов с определением типа чата
   */
  private async getPeerFromDialogs(client: any, chatId: number, sessionUserId?: number): Promise<any> {
    try {
      // Генерируем ключ кеша по сессии пользователя
      const sessionKey = `session_${sessionUserId}`;
      const now = Date.now();
      const CACHE_TTL = 5 * 60 * 1000; // 5 минут кеш

      // 🚨 ВРЕМЕННО: Принудительно очищаем кеш для тестирования
      this.dialogsCache.delete(sessionKey);
      this.logger.log(`🧹 Cleared cache, forcing fresh dialog sync for chat ${chatId}`);
      
      // Проверяем кеш диалогов  
      let dialogs;
      const cached = this.dialogsCache.get(sessionKey);
      if (cached && (now - cached.timestamp) < CACHE_TTL) {
        dialogs = cached.dialogs;
        this.logger.log(`Using cached dialogs for peer resolution`);
      } else {
        // 🚀 ПРИНУДИТЕЛЬНАЯ СИНХРОНИЗАЦИЯ ВСЕХ ДИАЛОГОВ
        this.logger.log(`🔄 Cache expired or missing, force syncing ALL dialogs for chat ${chatId}`);
        const syncedDialogs = await this.forceSyncDialogs(client, sessionUserId);
        if (syncedDialogs) {
          dialogs = syncedDialogs;
          this.logger.log(`✅ Using force-synced dialogs: ${dialogs.dialogs.length} total, ${dialogs.users.length} users`);
        } else {
          // Fallback к обычному запросу если принудительная синхронизация не удалась
          this.logger.warn(`Force sync failed, using fallback method`);
          try {
            dialogs = await client.call('messages.getDialogs', {
              offset_date: 0,
              offset_id: 0,
              offset_peer: { _: 'inputPeerEmpty' },
              limit: 100,
              hash: 0
            });
            
            // Сохраняем в кеш
            this.dialogsCache.set(sessionKey, { dialogs, timestamp: now });
            this.logger.log(`Cached fallback dialogs for peer resolution`);
          } catch (error) {
            this.logger.error(`Failed to get dialogs for peer resolution:`, error.message);
            return null;
          }
        }
      }

      if (!dialogs || !dialogs.dialogs) {
        return null;
      }

      // 🎯 СНАЧАЛА ищем пользователя НАПРЯМУЮ в массиве users (быстрее и надежнее)
      if (dialogs.users) {
        this.logger.log(`🔍 Searching for user ${chatId} in ${dialogs.users.length} users...`);
        
        // Логируем первых 5 пользователей для отладки
        const sampleUsers = dialogs.users.slice(0, 5).map(u => ({ id: u?.id, has_access_hash: !!u?.access_hash }));
        this.logger.log(`📋 Sample users: ${JSON.stringify(sampleUsers)}`);
        
        const user = dialogs.users.find(u => u && u.id === chatId);
        if (user && user.access_hash) {
          this.logger.log(`🎯 Found user ${chatId} DIRECTLY in users array with access_hash: ${user.access_hash}`);
          return {
            _: 'inputPeerUser',
            user_id: chatId,
            access_hash: user.access_hash
          };
        } else if (user) {
          this.logger.warn(`⚠️ User ${chatId} found in users but no access_hash: ${user.access_hash}`);
          this.logger.warn(`User data: id=${user.id}, username=${user.username}, first_name=${user.first_name}`);
        } else {
          this.logger.warn(`❌ User ${chatId} NOT found in users array at all`);
        }
      } else {
        this.logger.warn(`❌ No users array in dialogs`);
      }

      // Ищем нужный чат в диалогах (fallback)
      for (const dialog of dialogs.dialogs) {
        const peer = dialog.peer;
        
        if (peer._ === 'peerUser' && peer.user_id === chatId) {
          // Находим пользователя
          const user = dialogs.users?.find(u => u.id === chatId);
          if (user) {
            this.logger.log(`Found user ${chatId} in dialogs with access_hash: ${user.access_hash}`);
            return {
              _: 'inputPeerUser',
              user_id: chatId,
              access_hash: user.access_hash || 0
            };
          }
        } else if (peer._ === 'peerChat' && peer.chat_id === chatId) {
          // Обычная группа
          const chat = dialogs.chats?.find(c => c.id === chatId);
          if (chat) {
            this.logger.log(`Found group chat ${chatId} in dialogs`);
            return {
              _: 'inputPeerChat',
              chat_id: chatId
            };
          }
        } else if (peer._ === 'peerChannel' && peer.channel_id === chatId) {
          // Канал или супергруппа
          const channel = dialogs.chats?.find(c => c.id === chatId);
          if (channel) {
            this.logger.log(`Found channel/supergroup ${chatId} in dialogs with access_hash: ${channel.access_hash}`);
            return {
              _: 'inputPeerChannel',
              channel_id: chatId,
              access_hash: channel.access_hash || 0
            };
          }
        }
      }

      this.logger.warn(`Chat ${chatId} not found in dialogs`);
      return null;
      
    } catch (error) {
      this.logger.error(`Error searching peer in dialogs for chat ${chatId}:`, error.message);
      return null;
    }
  }

  /**
   * Принудительная синхронизация диалогов - получает максимально полный список
   */
  private async forceSyncDialogs(client: any, sessionUserId?: number): Promise<any> {
    try {
      this.logger.log(`🔄 Force syncing ALL dialogs for better coverage...`);
      
      // Очищаем кеш диалогов для пересинхронизации
      if (sessionUserId) {
        const sessionKey = `session_${sessionUserId}`;
        this.dialogsCache.delete(sessionKey);
      }
      
      const allDialogs: any = { dialogs: [], users: [], chats: [] };
      let offset_date = 0;
      let offset_id = 0;
      let offset_peer = { _: 'inputPeerEmpty' };
      
      // Получаем ВСЕ диалоги пачками с задержками для избежания FLOOD_WAIT
      while (true) {
        try {
          const dialogsBatch: any = await client.call('messages.getDialogs', {
            offset_date,
            offset_id,
            offset_peer,
            limit: 100, // Уменьшаем пачки чтобы избежать блокировки
            hash: 0
          });
          
          if (!dialogsBatch.dialogs || dialogsBatch.dialogs.length === 0) {
            break;
          }
          
          allDialogs.dialogs.push(...dialogsBatch.dialogs);
          allDialogs.users.push(...(dialogsBatch.users || []));
          allDialogs.chats.push(...(dialogsBatch.chats || []));
          
          // Обновляем offset
          const lastDialog = dialogsBatch.dialogs[dialogsBatch.dialogs.length - 1];
          offset_date = lastDialog.top_message;
          offset_id = lastDialog.top_message;
          offset_peer = lastDialog.peer;
          
          this.logger.log(`📥 Synced ${dialogsBatch.dialogs.length} dialogs, total: ${allDialogs.dialogs.length}`);
          
          if (allDialogs.dialogs.length > 1000) {
            this.logger.warn(`Reached 1000 dialogs limit, stopping sync to avoid rate limits`);
            break;
          }
          
          // 🛡️ Добавляем задержку между запросами для избежания FLOOD_WAIT
          if (allDialogs.dialogs.length % 100 === 0) {
            this.logger.log(`💤 Sleeping 2 seconds to avoid rate limits...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          
        } catch (error) {
          if (error.error_message && error.error_message.includes('FLOOD_WAIT')) {
            const waitTime = parseInt(error.error_message.match(/\d+/)?.[0] || '15');
            this.logger.warn(`FLOOD_WAIT in sync: waiting ${waitTime} seconds`);
            await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
            continue; // Повторяем запрос
          } else {
            this.logger.error(`Dialog sync error: ${error.message}`);
            break; // Другие ошибки - прерываем синхронизацию
          }
        }
      }
      
      // Кешируем результат
      if (sessionUserId) {
        const sessionKey = `session_${sessionUserId}`;
        this.dialogsCache.set(sessionKey, { 
          dialogs: allDialogs, 
          timestamp: Date.now() 
        });
      }
      
      this.logger.log(`✅ Force sync completed: ${allDialogs.dialogs.length} dialogs, ${allDialogs.users.length} users`);
      return allDialogs;
      
    } catch (error) {
      this.logger.error(`Force sync failed:`, error.message);
      return null;
    }
  }

  /**
   * Найти username для пользователя по его ID в диалогах
   */
  private async findUsernameForUser(client: any, userId: number, sessionUserId?: number): Promise<string | null> {
    try {
      // 🚨 ВРЕМЕННО: Принудительно очищаем кеш для тестирования
      const sessionKey = `session_${sessionUserId}`;
      this.dialogsCache.delete(sessionKey);
      this.logger.log(`🧹 Cleared username cache for user ${userId}`);
      
      // Проверяем кеш диалогов
      const now = Date.now();
      const CACHE_TTL = 5 * 60 * 1000; // 5 минут кеш

      let dialogs;
      const cached = this.dialogsCache.get(sessionKey);
      if (cached && (now - cached.timestamp) < CACHE_TTL) {
        dialogs = cached.dialogs;
      } else {
        // Получаем свежие диалоги
        dialogs = await client.call('messages.getDialogs', {
          offset_date: 0,
          offset_id: 0,
          offset_peer: { _: 'inputPeerEmpty' },
          limit: 200, // Больше диалогов для поиска username
          hash: 0
        });
        
        this.dialogsCache.set(sessionKey, { dialogs, timestamp: now });
      }

      if (dialogs && dialogs.users) {
        const user = dialogs.users.find(u => u && u.id === userId);
        if (user && user.username) {
          this.logger.log(`Found username: ${user.username} for user ${userId}`);
          return user.username;
        }
      }

      // Если не найден в кешированных диалогах, пробуем получить больше диалогов
      if (!cached) { // Только если еще не пробовали
        try {
          const moreDialogs = await client.call('messages.getDialogs', {
            offset_date: 0,
            offset_id: 0,
            offset_peer: { _: 'inputPeerEmpty' },
            limit: 500, // Еще больше диалогов
            hash: 0
          });
          
          if (moreDialogs && moreDialogs.users) {
            const user = moreDialogs.users.find(u => u && u.id === userId);
            if (user && user.username) {
              this.logger.log(`Found username: ${user.username} for user ${userId} in extended dialogs`);
              return user.username;
            }
          }
        } catch (error) {
          this.logger.warn(`Failed to get extended dialogs for username search:`, error.message);
        }
      }

      this.logger.debug(`No username found for user ${userId}`);
      return null;
      
    } catch (error) {
      this.logger.error(`Error finding username for user ${userId}:`, error.message);
      return null;
    }
  }

  /**
   * Фильтровать чаты, оставляя только доступные для отправки сообщений
   */
  private async filterAccessibleChats(client: any, chats: TelegramChat[], sessionUserId: number): Promise<TelegramChat[]> {
    const accessibleChats: TelegramChat[] = [];
    
    // Проверяем каждый чат на доступность
    for (const chat of chats) {
      try {
        // Пробуем получить peer для этого чата
        const peer = await this.getUniversalPeer(client, chat.id, sessionUserId);
        
        // Если peer найден и это не fallback с access_hash: 0, чат доступен
        if (peer && !(peer._ === 'inputPeerUser' && peer.access_hash === 0)) {
          accessibleChats.push(chat);
          this.logger.debug(`✅ Chat ${chat.id} (${chat.type}) is accessible`);
        } else {
          this.logger.debug(`❌ Chat ${chat.id} (${chat.type}) is not accessible - no valid peer`);
        }
      } catch (error) {
        this.logger.debug(`❌ Chat ${chat.id} (${chat.type}) is not accessible - error: ${error.message}`);
      }
    }
    
    return accessibleChats;
  }

  /**
   * Найти пользователя с правильным access_hash через продвинутые методы (как в обычном Telegram)
   */
  private async findUserPeerWithAccessHash(client: any, userId: number): Promise<any> {
    this.logger.log(`Trying advanced API methods to find access_hash for user ${userId} (like normal Telegram client)`);

    // Метод 1: Поиск в ВСЕХ диалогах (включая архивные)
    try {
      this.logger.log(`Method 1: Deep dialogs search for user ${userId}`);
      
      // Получаем ВСЕ диалоги, включая архивные и папки
      const allDialogs = await client.call('messages.getDialogs', {
        offset_date: 0,
        offset_id: 0,
        offset_peer: { _: 'inputPeerEmpty' },
        limit: 200, // Увеличиваем лимит
        hash: 0,
        folder_id: undefined // Получаем из всех папок
      });
      
      if (allDialogs && allDialogs.users) {
        const targetUser = allDialogs.users.find(u => u && u.id === userId);
        if (targetUser && targetUser.access_hash) {
          this.logger.log(`✅ Found user ${userId} in all dialogs with access_hash: ${targetUser.access_hash}`);
          
          return {
            _: 'inputPeerUser',
            user_id: userId,
            access_hash: targetUser.access_hash
          };
        }
      }
    } catch (error) {
      this.logger.warn(`Deep dialogs search failed for user ${userId}:`, error.message);
    }

    // Метод 2: Поиск через историю сообщений недавних чатов
    try {
      this.logger.log(`Method 2: Recent chat history search for user ${userId}`);
      
      // Получаем диалоги и ищем в истории каждого чата
      const recentDialogs = await client.call('messages.getDialogs', {
        offset_date: 0,
        offset_id: 0,
        offset_peer: { _: 'inputPeerEmpty' },
        limit: 50,
        hash: 0
      });
      
      if (recentDialogs && recentDialogs.dialogs) {
        for (const dialog of recentDialogs.dialogs.slice(0, 10)) { // Проверяем первые 10 чатов
          try {
            const peer = dialog.peer;
            let inputPeer;
            
            if (peer._ === 'peerUser') {
              const user = recentDialogs.users?.find(u => u.id === peer.user_id);
              if (!user) continue;
              inputPeer = { _: 'inputPeerUser', user_id: peer.user_id, access_hash: user.access_hash || 0 };
            } else if (peer._ === 'peerChat') {
              inputPeer = { _: 'inputPeerChat', chat_id: peer.chat_id };
            } else if (peer._ === 'peerChannel') {
              const channel = recentDialogs.chats?.find(c => c.id === peer.channel_id);
              if (!channel) continue;
              inputPeer = { _: 'inputPeerChannel', channel_id: peer.channel_id, access_hash: channel.access_hash || 0 };
            }
            
            if (!inputPeer) continue;
            
            // Получаем историю этого чата
            const history = await client.call('messages.getHistory', {
              peer: inputPeer,
              limit: 20,
              offset_id: 0,
              offset_date: 0,
              add_offset: 0,
              max_id: 0,
              min_id: 0,
              hash: 0
            });
            
            if (history && history.users) {
              const targetUser = history.users.find(u => u && u.id === userId);
              if (targetUser && targetUser.access_hash) {
                this.logger.log(`✅ Found user ${userId} in chat history with access_hash: ${targetUser.access_hash}`);
                
                return {
                  _: 'inputPeerUser',
                  user_id: userId,
                  access_hash: targetUser.access_hash
                };
              }
            }
          } catch (historyError) {
            // Продолжаем поиск в других чатах
            continue;
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Recent chat history search failed for user ${userId}:`, error.message);
    }

    // Метод 3: contacts.search - поиск в контактах  
    try {
      this.logger.log(`Method 3: contacts.search for user ${userId}`);
      const searchResult = await client.call('contacts.search', {
        q: userId.toString(),
        limit: 10
      });
      
      if (searchResult && searchResult.users && Array.isArray(searchResult.users)) {
        const targetUser = searchResult.users.find(u => u && u.id === userId);
        if (targetUser && targetUser.access_hash) {
          this.logger.log(`✅ Found user ${userId} via contacts.search with access_hash: ${targetUser.access_hash}`);
          
          return {
            _: 'inputPeerUser',
            user_id: userId,
            access_hash: targetUser.access_hash
          };
        }
      }
    } catch (error) {
      this.logger.warn(`contacts.search failed for user ${userId}:`, error.message);
    }

    // Метод 2: messages.searchGlobal - глобальный поиск
    try {
      this.logger.log(`Method 2: messages.searchGlobal for user ${userId}`);
      const globalResult = await client.call('messages.searchGlobal', {
        q: userId.toString(),
        offset_rate: 0,
        offset_peer: { _: 'inputPeerEmpty' },
        offset_id: 0,
        limit: 10
      });
      
      if (globalResult && globalResult.users && Array.isArray(globalResult.users)) {
        const targetUser = globalResult.users.find(u => u && u.id === userId);
        if (targetUser && targetUser.access_hash) {
          this.logger.log(`✅ Found user ${userId} via messages.searchGlobal with access_hash: ${targetUser.access_hash}`);
          
          return {
            _: 'inputPeerUser',
            user_id: userId,
            access_hash: targetUser.access_hash
          };
        }
      } else {
        this.logger.warn(`messages.searchGlobal returned no valid data for user ${userId}`);
      }
    } catch (error) {
      this.logger.warn(`messages.searchGlobal failed for user ${userId}:`, error.message);
    }

    // Метод 3: users.getFullUser - получает полную информацию о пользователе
    try {
      this.logger.log(`Method 3: users.getFullUser for user ${userId}`);
      const fullUserResult = await client.call('users.getFullUser', {
        id: { _: 'inputUser', user_id: userId, access_hash: 0 }
      });
      
      if (fullUserResult && fullUserResult.users && fullUserResult.users.length > 0) {
        const user = fullUserResult.users[0];
        if (user && user.access_hash) {
          this.logger.log(`✅ Found user ${userId} via users.getFullUser with access_hash: ${user.access_hash}`);
          
          return {
            _: 'inputPeerUser',
            user_id: userId,
            access_hash: user.access_hash
          };
        }
      }
    } catch (error) {
      this.logger.warn(`users.getFullUser failed for user ${userId}:`, error.message);
    }

    // Метод 4: users.getUsers с базовым access_hash
    try {
      this.logger.log(`Method 4: users.getUsers for user ${userId}`);
      const users = await client.call('users.getUsers', {
        id: [{
          _: 'inputUser',
          user_id: userId,
          access_hash: 0  // Пробуем с 0, иногда работает
        }]
      });
      
      if (users && users.length > 0) {
        const user = users[0];
        if (user.access_hash) {
          this.logger.log(`✅ Found user ${userId} via users.getUsers with access_hash: ${user.access_hash}`);
          
          return {
            _: 'inputPeerUser',
            user_id: userId,
            access_hash: user.access_hash
          };
        }
      }
    } catch (error) {
      this.logger.warn(`users.getUsers failed for user ${userId}:`, error.message);
    }

    // Метод 5: messages.getCommonChats - через общие чаты
    try {
      this.logger.log(`Method 5: messages.getCommonChats for user ${userId}`);
      const commonChats = await client.call('messages.getCommonChats', {
        user_id: {
          _: 'inputUser',
          user_id: userId,
          access_hash: 0
        },
        max_id: 0,
        limit: 10
      });
      
      // Если запрос прошел успешно, значит пользователь существует
      // Попробуем еще раз получить его данные через диалоги общих чатов
      if (commonChats.chats && commonChats.chats.length > 0) {
        this.logger.log(`Found ${commonChats.chats.length} common chats with user ${userId}`);
        
        // Пробуем получить информацию о пользователе через диалоги общих чатов
        for (const chat of commonChats.chats) {
          try {
            const chatHistory = await client.call('messages.getHistory', {
              peer: {
                _: chat._ === 'channel' ? 'inputPeerChannel' : 'inputPeerChat',
                [chat._ === 'channel' ? 'channel_id' : 'chat_id']: chat.id,
                ...(chat.access_hash && { access_hash: chat.access_hash })
              },
              limit: 20,
              offset_id: 0,
              offset_date: 0,
              add_offset: 0,
              max_id: 0,
              min_id: 0,
              hash: 0
            });
            
            if (chatHistory.users) {
              const targetUser = chatHistory.users.find(u => u.id === userId);
              if (targetUser && targetUser.access_hash) {
                this.logger.log(`✅ Found user ${userId} via common chat history with access_hash: ${targetUser.access_hash}`);
                
                return {
                  _: 'inputPeerUser',
                  user_id: userId,
                  access_hash: targetUser.access_hash
                };
              }
            }
          } catch (historyError) {
            // Продолжаем поиск в других чатах
            continue;
          }
        }
      }
    } catch (error) {
      this.logger.warn(`messages.getCommonChats failed for user ${userId}:`, error.message);
    }

    // 🚨 ПОСЛЕДНИЙ ШАНС: Попробуем fallback с проверкой валидности
    this.logger.warn(`All advanced methods failed for user ${userId}, trying fallback with validation`);
    
    const fallbackPeer = {
      _: 'inputPeerUser',
      user_id: userId,
      access_hash: 0
    };
    
    // Проверяем валидность fallback peer через простой запрос
    try {
      this.logger.log(`Testing fallback peer validity for user ${userId}`);
      
      // Пробуем получить историю с fallback peer - если работает, значит можно использовать
      await client.call('messages.getHistory', {
        peer: fallbackPeer,
        limit: 1,
        offset_id: 0,
        offset_date: 0,
        add_offset: 0,
        max_id: 0,
        min_id: 0,
        hash: 0
      });
      
      this.logger.log(`✅ Fallback peer with access_hash: 0 is valid for user ${userId}!`);
      return fallbackPeer;
      
    } catch (fallbackError) {
      this.logger.error(`❌ Fallback peer validation failed for user ${userId}: ${fallbackError.message}`);
    }

    this.logger.error(`❌ All methods including fallback failed for user ${userId}`);
    return null;
  }

  /**
   * Очистить кеш peer'ов для сессии
   */
  async clearPeerCache(sessionId: string): Promise<void> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      // Очищаем кеш peer'ов
      this.peerCache.clear();
      
      // Очищаем кеш диалогов для данной сессии
      const sessionKey = `session_${session.userId}`;
      this.dialogsCache.delete(sessionKey);
      
      this.logger.log(`Cleared peer cache and dialogs cache for session ${sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to clear peer cache for session ${sessionId}:`, error);
      throw new Error(`Clear peer cache failed: ${error.message}`);
    }
  }

  /**
   * Получить корректный peer для пользователя с access_hash (legacy метод)
   */
  private async getValidPeerForUser(client: any, userId: number): Promise<any> {
    try {
      // Сначала пытаемся найти пользователя в контактах
      this.logger.log(`Looking for user ${userId} in contacts...`);
      const contacts = await client.call('contacts.getContacts', {
        hash: 0
      });
      
      if (contacts.users) {
        const targetUser = contacts.users.find(u => u.id === userId);
        if (targetUser && targetUser.access_hash) {
          this.logger.log(`Found user ${userId} in contacts with access_hash`);
          return {
            _: 'inputPeerUser',
            user_id: userId,
            access_hash: targetUser.access_hash
          };
        }
      }
      
      // Если не найден в контактах, ищем в диалогах
      this.logger.log(`User ${userId} not in contacts, searching in dialogs...`);
      const dialogs = await client.call('messages.getDialogs', {
        offset_date: 0,
        offset_id: 0,
        offset_peer: { _: 'inputPeerEmpty' },
        limit: 100,  // Увеличиваем лимит для поиска
        hash: 0
      });
      
      if (dialogs.users) {
        const targetUser = dialogs.users.find(u => u.id === userId);
        if (targetUser && targetUser.access_hash) {
          this.logger.log(`Found user ${userId} in dialogs with access_hash`);
          return {
            _: 'inputPeerUser',
            user_id: userId,
            access_hash: targetUser.access_hash
          };
        }
      }
      
      // Если все еще не найден, пытаемся получить через username (если есть)
      this.logger.warn(`User ${userId} not found in contacts or dialogs. Cannot send file.`);
      return null;
      
    } catch (error) {
      this.logger.error(`Error getting peer for user ${userId}:`, error.message);
      return null;
    }
  }

  // Приватные методы

  private generateSessionId(): string {
    return `tg_user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateRandomId(): number {
    return Math.floor(Math.random() * 1000000000);
  }

  /**
   * Настройка слушателя обновлений MTProto
   */
  private setupUpdateListener(client: any, sessionId: string): void {
    try {
      // Слушаем обновления от MTProto
      client.updates.on('updates', (updates: any) => {
        this.handleIncomingMessages(sessionId, updates);
      });

      // Слушаем новые сообщения (все типы)
      client.updates.on('updateNewMessage', (update: any) => {
        this.handleNewMessage(sessionId, update);
      });
      
      client.updates.on('updateNewChannelMessage', (update: any) => {
        this.handleNewMessage(sessionId, update);
      });

      this.logger.log(`MTProto update listener setup for session ${sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to setup update listener for session ${sessionId}:`, error);
    }
  }

  /**
   * Обработка нового сообщения
   */
  private async handleNewMessage(sessionId: string, update: any): Promise<void> {
    try {
      const message = update.message;
      if (!message) return;

      // Создаем обновление для WebSocket
      const telegramUpdate = {
        type: 'new_message' as const,
        sessionId,
        chatId: message.peer_id?.user_id?.toString() || message.peer_id?.chat_id?.toString() || 'unknown',
        data: {
          messageId: message.id,
          text: message.message,
          date: message.date,
          fromId: message.from_id?.user_id,
          media: message.media ? {
            type: message.media._,
            hasFile: !!message.media.document || !!message.media.photo
          } : null
        }
      };

      // Отправляем через WebSocket
      this.webSocketGateway.sendTelegramUpdate(telegramUpdate);
      
      this.logger.log(`New message processed for session ${sessionId}: ${message.message?.substring(0, 50)}...`);
    } catch (error) {
      this.logger.error(`Failed to handle new message for session ${sessionId}:`, error);
    }
  }

  /**
   * Обработка редактирования сообщения
   */
  private async handleEditMessage(sessionId: string, update: any): Promise<void> {
    try {
      const message = update.message;
      if (!message) return;

      const telegramUpdate = {
        type: 'message_updated' as const,
        sessionId,
        chatId: message.peer_id?.user_id?.toString() || message.peer_id?.chat_id?.toString() || 'unknown',
        data: {
          messageId: message.id,
          text: message.message,
          date: message.date,
          editDate: message.edit_date
        }
      };

      this.webSocketGateway.sendTelegramUpdate(telegramUpdate);
      
      this.logger.log(`Message edit processed for session ${sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to handle message edit for session ${sessionId}:`, error);
    }
  }

  private async handleIncomingMessages(sessionId: string, updates: any): Promise<void> {
    try {
      this.logger.debug(`Processing incoming updates for session ${sessionId}`, updates);
      
      // Обрабатываем разные типы обновлений
      if (updates.updates) {
        for (const update of updates.updates) {
          switch (update._) {
            case 'updateNewMessage':
            case 'updateNewChannelMessage':
              await this.handleNewMessage(sessionId, update);
              break;
            case 'updateEditMessage':
            case 'updateEditChannelMessage':
              await this.handleEditMessage(sessionId, update);
              break;
            default:
              this.logger.debug(`Unhandled update type: ${update._}`);
          }
        }
      }
    } catch (error) {
      this.logger.error(`Failed to handle incoming messages for session ${sessionId}:`, error);
    }
  }

  /**
   * Тестовый метод для проверки работы с казахстанскими номерами
   * Используется только в DEV режиме
   */
  async testKazakhstanNumber(phoneNumber: string): Promise<any> {
    if (this.configService.get('NODE_ENV') !== 'development') {
      throw new Error('Test methods only available in development mode');
    }

    try {
      this.logger.log(`=== TESTING KAZAKHSTAN NUMBER: ${phoneNumber} ===`);
      
      // Тест форматирования номера
      const formatted = this.formatPhoneNumber(phoneNumber);
      this.logger.log(`✓ Phone formatting test passed: ${phoneNumber} -> ${formatted}`);
      
      // Тест конфигурации MTProto
      const config = this.getMTProtoConfig(phoneNumber);
      this.logger.log(`✓ MTProto config test passed:`, JSON.stringify(config, null, 2));
      
      // Тест инициализации аутентификации
      this.logger.log(`🚀 Attempting real authentication for ${formatted}...`);
      const authResult = await this.initiateAuth(phoneNumber);
      
      return {
        success: true,
        tests: {
          phoneFormatting: {
            original: phoneNumber,
            formatted: formatted,
            valid: formatted.startsWith('77') && formatted.length === 11
          },
          mtprotoConfig: {
            apiLayer: config.server?.api?.api_layer,
            dataCenter: (config.server as any)?.dc?.id || 'auto',
            useKazakhstanDC: formatted.startsWith('77')
          },
          authentication: {
            sessionId: authResult.sessionId,
            codeSent: authResult.codeSent,
            mode: this.clients.has(authResult.sessionId) ? 'REAL_MTPROTO' : 'DEV_MOCK'
          }
        },
        message: 'Kazakhstan number test completed. Check logs for details.',
        nextSteps: authResult.codeSent ? 
          'Code sent! Use completeAuth endpoint with the verification code.' :
          'Code sending failed. Check MTProto configuration.'
      };
    } catch (error) {
      this.logger.error(`Kazakhstan number test failed:`, {
        phone: phoneNumber,
        error: error.message,
        stack: error.stack
      });
      
      return {
        success: false,
        error: error.message,
        phone: phoneNumber,
        suggestion: 'Check if API credentials are correct and phone number format is valid (+77XXXXXXXXX)'
      };
    }
  }

  /**
   * Получить детальную информацию о статусе MTProto для отладки
   */
  async getMTProtoDebugInfo(): Promise<any> {
    const apiId = this.configService.get('TELEGRAM_API_ID');
    const apiHash = this.configService.get('TELEGRAM_API_HASH');
    const nodeEnv = this.configService.get('NODE_ENV');
    
    return {
      environment: nodeEnv,
      credentials: {
        apiId: apiId,
        apiHashPresent: !!apiHash,
        apiHashPrefix: apiHash ? apiHash.substring(0, 8) + '...' : 'NOT_SET',
        credentialsValid: apiId === '25350118' && apiHash?.startsWith('47911da0')
      },
      sessions: {
        total: this.sessions.size,
        authenticated: Array.from(this.sessions.values()).filter(s => s.isAuthenticated).length,
        connected: Array.from(this.sessions.values()).filter(s => s.isConnected).length,
        mtprotoClients: this.clients.size
      },
      activeSessions: Array.from(this.sessions.values()).map(session => ({
        id: session.id,
        phone: session.phoneNumber,
        authenticated: session.isAuthenticated,
        connected: session.isConnected,
        hasMTProtoClient: this.clients.has(session.id),
        lastActivity: session.lastActivity
      }))
    };
  }

  /**
   * Скачать файл из Telegram сообщения
   * @param sessionId - ID сессии
   * @param chatId - ID чата
   * @param messageId - ID сообщения содержащего файл
   * @returns Buffer с данными файла
   */
  async downloadFile(sessionId: string, chatId: string, messageId: string): Promise<Buffer & { contentType?: string; fileName?: string }> {
    this.logger.log(`Downloading file from message ${messageId} in chat ${chatId} via session: ${sessionId}`);
    
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (!session.isAuthenticated || !session.isConnected) {
      throw new Error(`Session ${sessionId} is not authenticated or connected`);
    }

    const client = this.clients.get(sessionId);
    if (!client) {
      throw new Error(`MTProto client not found for session ${sessionId}`);
    }

    try {
      // Получаем сообщение из конкретного чата
      this.logger.log(`Getting message ${messageId} from chat ${chatId}`);
      
      // Создаем peer для чата
      const peer = {
        _: 'inputPeerUser',
        user_id: parseInt(chatId),
        access_hash: 0 // Для получения истории сообщений access_hash часто не требуется
      };

      // Получаем историю сообщений из чата
      const messages = await client.call('messages.getHistory', {
        peer: peer,
        limit: 50, // Уменьшаем лимит для стабильности
        offset_id: 0,
        offset_date: 0,
        add_offset: 0,
        max_id: 0,
        min_id: 0,
        hash: 0
      });

      // Ищем нужное сообщение
      const targetMessage = messages.messages.find((m: any) => m.id.toString() === messageId);
      
      if (!targetMessage) {
        throw new Error(`Message ${messageId} not found in chat ${chatId}`);
      }

      if (!targetMessage.media && !targetMessage.document && !targetMessage.photo) {
        throw new Error(`Message ${messageId} does not contain media`);
      }

      this.logger.log(`Found message with media: type=${targetMessage.media?._}, document=${!!targetMessage.document}, photo=${!!targetMessage.photo}`);

      // Определяем тип медиа и получаем документ/фото
      let fileInfo: any = null;
      let fileName = `file_${messageId}`;
      let contentType = 'application/octet-stream';

      const message = targetMessage as any; // Type assertion для работы с MTProto объектами

      if (message.media?.document) {
        fileInfo = message.media.document;
        fileName = fileInfo.attributes?.find((attr: any) => attr._ === 'documentAttributeFilename')?.file_name || fileName;
        contentType = fileInfo.mime_type || contentType;
      } else if (message.media?.photo) {
        fileInfo = message.media.photo;
        fileName = `photo_${messageId}.jpg`;
        contentType = 'image/jpeg';
        // Для фото берем наибольший размер
        if (fileInfo.sizes && fileInfo.sizes.length > 0) {
          fileInfo = fileInfo.sizes[fileInfo.sizes.length - 1];
        }
      } else if (message.document) {
        fileInfo = message.document;
        fileName = fileInfo.attributes?.find((attr: any) => attr._ === 'documentAttributeFilename')?.file_name || fileName;
        contentType = fileInfo.mime_type || contentType;
      } else if (message.photo) {
        fileInfo = message.photo;
        fileName = `photo_${messageId}.jpg`;
        contentType = 'image/jpeg';
        // Для фото берем наибольший размер
        if (fileInfo.sizes && fileInfo.sizes.length > 0) {
          fileInfo = fileInfo.sizes[fileInfo.sizes.length - 1];
        }
      } else {
        throw new Error(`Message ${messageId} does not contain downloadable media`);
      }

      this.logger.log(`Downloading file: ${fileName}, type: ${contentType}, size: ${fileInfo.size || 'unknown'}`);
      this.logger.log(`FileInfo type: ${fileInfo._}, has photo: ${!!message.media?.photo}, has document: ${!!message.media?.document}`);

      // Скачиваем файл через MTProto
      let inputLocation;
      
      if (message.media?.photo && message.media.photo.id) {
        // Для фотографий используем inputPhotoFileLocation
        inputLocation = {
          _: 'inputPhotoFileLocation',
          id: message.media.photo.id,
          access_hash: message.media.photo.access_hash,
          file_reference: message.media.photo.file_reference,
          thumb_size: fileInfo.type || ''
        };
      } else if (fileInfo.id) {
        // Для документов используем inputDocumentFileLocation
        inputLocation = {
          _: 'inputDocumentFileLocation',
          id: fileInfo.id,
          access_hash: fileInfo.access_hash,
          file_reference: fileInfo.file_reference,
          thumb_size: ''
        };
      } else {
        // Для фотографий без ID - возможно поврежденные или устаревшие
        if (message.media?.photo) {
          throw new Error(`Photo download not supported: missing photo ID or metadata. This may be an old or corrupted photo.`);
        } else {
          throw new Error(`Cannot create inputLocation: missing required fields for document`);
        }
      }
      
      this.logger.log(`InputLocation: ${JSON.stringify(inputLocation, null, 2)}`);

      const fileSize = fileInfo.size || fileInfo.w * fileInfo.h || 0; // For photos, estimate size
      const chunks: Buffer[] = [];
      const chunkSize = 512 * 1024; // 512KB chunks
      let offset = 0;

      // For photos with unknown size, try to get at least some data
      const isPhotoWithUnknownSize = fileSize === 0 && (fileName.includes('photo_') || contentType.startsWith('image/'));
      if (isPhotoWithUnknownSize) {
        // Try to download in chunks until we get empty data
        this.logger.log(`Photo with unknown size, attempting incremental download`);
      }

      while (offset < fileSize || (isPhotoWithUnknownSize && chunks.length === 0)) {
        // Telegram API requirements:
        // - offset must be divisible by 1024
        // - limit must be divisible by 1024  
        // - requested part must be within 1MB chunk
        const remainingBytes = isPhotoWithUnknownSize ? 64 * 1024 : fileSize - offset; // Try 64KB for unknown photos
        const maxChunkSize = 1024 * 1024; // 1MB max chunk
        
        // Ensure limit is aligned to 1024 and within 1MB boundary
        let limit = Math.min(maxChunkSize, Math.ceil(remainingBytes / 1024) * 1024);
        
        // For very small files or unknown size photos, use reasonable limit
        if (limit < 1024 || isPhotoWithUnknownSize) {
          limit = isPhotoWithUnknownSize ? 64 * 1024 : 1024;
        }
        
        // Ensure we don't cross 1MB boundary from current offset
        const chunkStart = Math.floor(offset / maxChunkSize) * maxChunkSize;
        const chunkEnd = chunkStart + maxChunkSize;
        const maxAllowedLimit = chunkEnd - offset;
        
        if (limit > maxAllowedLimit) {
          limit = Math.floor(maxAllowedLimit / 1024) * 1024;
          if (limit < 1024) limit = 1024;
        }
        
        this.logger.log(`Downloading chunk: offset=${offset}, limit=${limit}, remaining=${remainingBytes}, fileSize=${fileSize}`);
        
        const chunk: any = await client.call('upload.getFile', {
          location: inputLocation,
          offset: offset,
          limit: limit,
          precise: true // Disable some checks on limit and offset
        });

        // Check if chunk has valid bytes data
        if (!chunk || !chunk.bytes || chunk.bytes.length === 0) {
          this.logger.log(`No more data received at offset ${offset}, ending download`);
          break;
        }

        chunks.push(chunk.bytes);
        offset += chunk.bytes.length;

        // Если получили меньше данных чем ожидали, файл закончился
        if (chunk.bytes.length < limit) {
          break;
        }
      }

      const fileBuffer = Buffer.concat(chunks) as Buffer & { contentType?: string; fileName?: string };
      fileBuffer.contentType = contentType;
      fileBuffer.fileName = fileName;

      this.logger.log(`File downloaded successfully: ${fileName}, size: ${fileBuffer.length} bytes`);

      // Обновляем активность сессии
      session.lastActivity = new Date();
      this.sessions.set(session.id, session);

      return fileBuffer;

    } catch (error) {
      this.logger.error(`Failed to download file from message ${messageId}:`, error);
      throw new Error(`File download failed: ${error.message}`);
    }
  }

  /**
   * Отправить файл пользователю через Telegram
   */
  async sendUserFile(sessionId: string, chatId: string, file: Express.Multer.File, caption?: string): Promise<any> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (!session.isAuthenticated || !session.isConnected) {
      throw new Error(`Session ${sessionId} is not authenticated or connected`);
    }

    const client = this.clients.get(sessionId);
    if (!client) {
      throw new Error(`MTProto client not found for session ${sessionId}`);
    }

    const fileSizeMB = file.size / (1024 * 1024);
    const isLargeFile = fileSizeMB > 5; // Files > 5MB use streaming upload (lowered threshold)

    if (isLargeFile) {
      this.logger.log(`Large file detected (${fileSizeMB.toFixed(2)}MB), using streaming upload`);
      return await this.sendLargeFileWithStreaming(client, chatId, file, caption, session.userId);
    } else {
      this.logger.log(`Small file (${fileSizeMB.toFixed(2)}MB), using direct upload`);
      return await this.sendSmallFile(client, chatId, file, caption, session.userId);
    }
  }

  /**
   * Отправка больших файлов через потоковую загрузку
   */
  private async sendLargeFileWithStreaming(client: any, chatId: string, file: Express.Multer.File, caption?: string, sessionUserId?: number): Promise<any> {
    const maxRetries = 3;
    const fileSizeMB = file.size / (1024 * 1024);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.log(`Streaming upload attempt ${attempt}/${maxRetries} for ${fileSizeMB.toFixed(2)}MB file: ${file.originalname}`);
        
        // Получаем peer для чата
        const peer = await this.getUniversalPeer(client, chatId, sessionUserId);
        if (!peer) {
          throw new Error(`Cannot find peer for chat ${chatId}`);
        }

        this.logger.log(`Streaming upload: ${fileSizeMB.toFixed(2)}MB file to peer:`);
        this.logger.log(JSON.stringify(peer));

        // Динамические параметры в зависимости от размера файла
        const fileBuffer = file.buffer;
        const partSize = 512 * 1024; // Уменьшаем размер части до 512KB для больших файлов
        const totalParts = Math.ceil(fileBuffer.length / partSize);
        
        // Адаптивная стратегия concurrency и timeout в зависимости от размера
        let concurrentUploads: number;
        let partTimeout: number;
        
        if (fileSizeMB > 200) {
          // Очень большие файлы: меньше concurrency, больше timeout
          concurrentUploads = 2;
          partTimeout = 600000; // 10 минут
        } else if (fileSizeMB > 100) {
          // Большие файлы: умеренная concurrency
          concurrentUploads = 3;
          partTimeout = 480000; // 8 минут
        } else {
          // Средние файлы: стандартная concurrency
          concurrentUploads = 4;
          partTimeout = 360000; // 6 минут
        }

        this.logger.log(`Streaming: ${totalParts} parts (${(partSize / 1024).toFixed(0)}KB each) with ${concurrentUploads} concurrent uploads, ${(partTimeout / 60000).toFixed(1)}min timeout`);

        // Генерируем file_id для загрузки
        const fileId = Math.floor(Math.random() * 1000000000);
        const uploadResults: boolean[] = new Array(totalParts).fill(false);
        const partRetries: number[] = new Array(totalParts).fill(0);
        const maxPartRetries = 3;

        // Функция загрузки одной части с повторными попытками
        const uploadPart = async (partIndex: number): Promise<boolean> => {
          const startByte = partIndex * partSize;
          const endByte = Math.min(startByte + partSize, fileBuffer.length);
          const partData = fileBuffer.slice(startByte, endByte);

          for (let partAttempt = 1; partAttempt <= maxPartRetries; partAttempt++) {
            try {
              const uploadPromise = client.call('upload.saveBigFilePart', {
                file_id: fileId,
                file_part: partIndex,
                file_total_parts: totalParts,
                bytes: partData
              });

              const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error(`Upload part ${partIndex} timeout (${partTimeout}ms)`)), partTimeout);
              });

              await Promise.race([uploadPromise, timeoutPromise]);
              this.logger.log(`✓ Part ${partIndex + 1}/${totalParts} uploaded successfully`);
              return true;
            } catch (error) {
              this.logger.warn(`✗ Part ${partIndex + 1}/${totalParts} failed (attempt ${partAttempt}/${maxPartRetries}): ${error.message}`);
              
              if (partAttempt < maxPartRetries) {
                // Exponential backoff для повторных попыток части
                const delay = Math.min(1000 * Math.pow(2, partAttempt - 1), 10000);
                await new Promise(resolve => setTimeout(resolve, delay));
              }
            }
          }
          return false;
        };

        // Последовательная загрузка для больших файлов вместо параллельной
        if (fileSizeMB > 200) {
          // Для очень больших файлов используем полностью последовательную загрузку
          for (let partIndex = 0; partIndex < totalParts; partIndex++) {
            const success = await uploadPart(partIndex);
            uploadResults[partIndex] = success;
            
            if (!success) {
              throw new Error(`Failed to upload part ${partIndex + 1}/${totalParts}`);
            }
            
            // Прогресс каждые 10 частей
            if ((partIndex + 1) % 10 === 0 || partIndex === totalParts - 1) {
              const progress = ((partIndex + 1) / totalParts * 100).toFixed(1);
              this.logger.log(`Upload progress: ${partIndex + 1}/${totalParts} parts (${progress}%)`);
            }
          }
        } else {
          // Для средних файлов используем ограниченную параллельность
          const chunks: number[][] = [];
          for (let i = 0; i < totalParts; i += concurrentUploads) {
            chunks.push(Array.from({ length: Math.min(concurrentUploads, totalParts - i) }, (_, j) => i + j));
          }

          for (const chunk of chunks) {
            const chunkPromises = chunk.map(partIndex => uploadPart(partIndex).then(success => ({ partIndex, success })));
            const chunkResults = await Promise.all(chunkPromises);
            
            for (const { partIndex, success } of chunkResults) {
              uploadResults[partIndex] = success;
            }
            
            const progress = ((chunks.indexOf(chunk) + 1) / chunks.length * 100).toFixed(1);
            this.logger.log(`Chunk progress: ${chunks.indexOf(chunk) + 1}/${chunks.length} chunks (${progress}%)`);
          }
        }

        // Проверяем результаты
        const failedParts = uploadResults.map((success, index) => success ? -1 : index).filter(i => i >= 0);
        
        if (failedParts.length > 0) {
          throw new Error(`Failed to upload ${failedParts.length} parts: ${failedParts.slice(0, 10).join(', ')}${failedParts.length > 10 ? '...' : ''}`);
        }

        // Отправляем файл через Telegram
        const inputFile = {
          _: 'inputFileBig',
          id: fileId,
          parts: totalParts,
          name: file.originalname
        };

        const result = await client.call('messages.sendMedia', {
          peer: peer,
          media: {
            _: 'inputMediaUploadedDocument',
            file: inputFile,
            mime_type: file.mimetype || 'application/octet-stream',
            attributes: [
              {
                _: 'documentAttributeFilename',
                file_name: file.originalname
              }
            ]
          },
          message: caption || '',
          random_id: Math.floor(Math.random() * 1000000000000000)
        });

        this.logger.log(`✅ Large file uploaded successfully: ${file.originalname} (${fileSizeMB.toFixed(2)}MB)`);
        return result;

      } catch (error) {
        this.logger.error(`Streaming upload attempt ${attempt} failed:`, error.message);
        if (attempt === maxRetries) {
          throw error;
        }
        // Ждем перед повторной попыткой
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  /**
   * Отправка малых файлов напрямую
   */
  private async sendSmallFile(client: any, chatId: string, file: Express.Multer.File, caption?: string, sessionUserId?: number): Promise<any> {
    // Получаем peer для чата
    const peer = await this.getUniversalPeer(client, chatId, sessionUserId);
    if (!peer) {
      throw new Error(`Cannot find peer for chat ${chatId}`);
    }

    // Загружаем файл целиком
    const result = await client.call('messages.sendMedia', {
      peer: peer,
      media: {
        _: 'inputMediaUploadedDocument',
        file: {
          _: 'inputFile',
          id: Math.floor(Math.random() * 1000000000),
          parts: 1,
          name: file.originalname,
          bytes: file.buffer
        },
        mime_type: file.mimetype || 'application/octet-stream',
        attributes: [
          {
            _: 'documentAttributeFilename',
            file_name: file.originalname
          }
        ]
      },
      message: caption || '',
      random_id: Math.floor(Math.random() * 1000000000000000)
    });

    this.logger.log(`✅ Small file uploaded successfully: ${file.originalname}`);
    return result;
  }
}