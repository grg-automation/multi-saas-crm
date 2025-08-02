// @ts-nocheck
/* eslint-disable */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { CustomFile } from 'telegram/client/uploads';
import { Api } from 'telegram/tl';
import { MessagingWebSocketGateway } from '../websocket/websocket.gateway';
import { TelegramSessionRepository } from './repositories/telegram-session.repository';

/**
 * Telegram User Service V2 - Современная реализация на GramJS
 * Заменяет сложный MTProto код на простую и стабильную архитектуру
 */

export interface TelegramSessionV2 {
  id: string;
  phoneNumber: string;
  userId?: number;
  isAuthenticated: boolean;
  isConnected: boolean;
  lastActivity: Date;
  sessionString?: string; // GramJS сессия в строковом формате
  metadata?: any; // Дополнительные данные (webhook URL и т.д.)
}

export interface TelegramMessageV2 {
  chatId: string | number;
  message: string;
  parseMode?: 'HTML' | 'Markdown';
  replyToMessageId?: number;
}

export interface TelegramChatV2 {
  id: string; // Изменяем на string для поддержки BigInteger
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  isBot?: boolean;
}

@Injectable()
export class TelegramServiceV2 {
  private readonly logger = new Logger(TelegramServiceV2.name);
  private sessions = new Map<string, TelegramSessionV2>();
  private clients = new Map<string, TelegramClient>(); // GramJS clients
  private pollingIntervals = new Map<string, NodeJS.Timeout>();
  private lastMessageIds = new Map<string, Map<string, number>>(); // sessionId -> chatId -> lastMessageId
  
  constructor(
    private configService: ConfigService,
    private webSocketGateway: MessagingWebSocketGateway,
    private sessionRepository: TelegramSessionRepository,
  ) {
    this.initializeService();
  }

  private async initializeService() {
    this.logger.log('🚀 Initializing Telegram Service V2 (GramJS) with Database persistence...');
    
    // Восстановить сохраненные сессии из базы данных при запуске
    await this.restoreSavedSessions();

    // Автоматически переподключить активные сессии (опционально)
    await this.autoReconnectActiveSessions();

    this.logger.log('✅ Telegram Service V2 initialized successfully with Database persistence');
  }

  /**
   * Восстановить сохраненные сессии из базы данных при запуске
   */
  private async restoreSavedSessions(): Promise<void> {
    try {
      // Получаем все сессии из базы данных
      const sessionEntities = await this.sessionRepository.getAuthenticatedSessions();
      
      for (const entity of sessionEntities) {
        try {
          const session = this.sessionRepository.entityToSession(entity);
          
          // Не подключаем автоматически при запуске, только загружаем данные
          session.isConnected = false;
          
          this.sessions.set(session.id, session);
          this.logger.log(`📱 Restored session from DB: ${session.phoneNumber} (${session.id})`);
        } catch (error) {
          this.logger.error(`Failed to restore session from DB ${entity.sessionId}:`, error);
        }
      }
      
      this.logger.log(`✅ Restored ${sessionEntities.length} sessions from database`);
      
    } catch (error) {
      this.logger.error('Failed to restore saved sessions from database:', error);
    }
  }

  /**
   * Сохранить сессию в базу данных
   */
  private async saveSessionToDatabase(session: TelegramSessionV2, tenantId?: string): Promise<void> {
    try {
      await this.sessionRepository.saveSession(session, tenantId);
      this.logger.debug(`💾 Session saved to DB: ${session.phoneNumber}`);
    } catch (error) {
      this.logger.error(`Failed to save session ${session.id} to database:`, error);
    }
  }

  // Метод миграции удален - используем только файловое хранение

  /**
   * Автоматически переподключить активные сессии при запуске сервиса
   * Это позволяет сразу использовать существующие сессии без ручного переподключения
   */
  private async autoReconnectActiveSessions(): Promise<void> {
    try {
      const activeSessions = Array.from(this.sessions.values()).filter(
        session => session.isAuthenticated && session.sessionString
      );

      if (activeSessions.length === 0) {
        this.logger.log('🔄 No active sessions found for auto-reconnection');
        return;
      }

      this.logger.log(`🔄 Auto-reconnecting ${activeSessions.length} active sessions...`);

      const reconnectionPromises = activeSessions.map(async (session) => {
        try {
          await this.reconnectSessionSilently(session.id);
          this.logger.log(`✅ Auto-reconnected session: ${session.phoneNumber} (${session.id})`);
          
          // Запускаем прослушивание событий после переподключения
          // ОТКЛЮЧЕНО: Автоматический запуск Smart Polling/событий
          // Теперь используем только pure webhooks - нужно настраивать вручную
          this.logger.log(`📴 Session restored but auto-listening disabled: ${session.phoneNumber} (${session.id}) - use webhook setup`);
          // try {
          //   await this.startListening(session.id);
          //   this.logger.log(`🎧 Started real-time listening for session: ${session.phoneNumber} (${session.id})`);
          // } catch (listeningError) {
          //   this.logger.warn(`⚠️ Failed to start listening for session ${session.phoneNumber}: ${listeningError.message}`);
          // }
        } catch (error) {
          this.logger.warn(`⚠️ Failed to auto-reconnect session ${session.phoneNumber}: ${error.message}`);
          // Не блокируем запуск сервиса из-за проблем с отдельной сессией
        }
      });

      // Выполняем переподключения параллельно, но не ждем завершения всех
      await Promise.allSettled(reconnectionPromises);
      
      this.logger.log('🔄 Auto-reconnection process completed');

    } catch (error) {
      this.logger.error('Failed to auto-reconnect active sessions:', error);
      // Не прерываем инициализацию сервиса из-за проблем с автоматическим переподключением
    }
  }

  /**
   * Тихо переподключить сессию без логирования ошибок (для автоматического переподключения)
   */
  private async reconnectSessionSilently(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    
    if (!session || !session.isAuthenticated || !session.sessionString) {
      throw new Error(`Session ${sessionId} not found or not authenticated`);
    }
    
    // Получаем API credentials
    const apiId = parseInt(this.configService.get<string>('TELEGRAM_API_ID') || '123456');
    const apiHash = this.configService.get<string>('TELEGRAM_API_HASH') || 'your_api_hash';
    
    // Создаем клиента с сохраненной сессией
    const stringSession = new StringSession(session.sessionString);
    const client = new TelegramClient(stringSession, apiId, apiHash, {
      connectionRetries: 3,
      retryDelay: 1000,
      timeout: 8000
    });
    
    await client.connect();
    
    // Сохраняем клиента
    this.clients.set(sessionId, client);
    
    // Обновляем статус
    session.isConnected = true;
    session.lastActivity = new Date();
    
    // Сохраняем обновленный статус в файл
    await this.saveSessionToDatabase(session);
  }

  /**
   * Инициировать аутентификацию пользователя
   */
  async initiateAuth(phoneNumber: string): Promise<{ sessionId: string; codeSent: boolean }> {
    try {
      this.logger.log(`🔐 Initiating auth for phone: ${phoneNumber}`);
      
      // Создаем уникальный ID для сессии
      const sessionId = `tg_user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Получаем API credentials
      const apiId = parseInt(this.configService.get<string>('TELEGRAM_API_ID') || '123456');
      const apiHash = this.configService.get<string>('TELEGRAM_API_HASH') || 'your_api_hash';
      
      // Создаем новую сессию
      const session: TelegramSessionV2 = {
        id: sessionId,
        phoneNumber: phoneNumber,
        isAuthenticated: false,
        isConnected: false,
        lastActivity: new Date(),
        sessionString: '' // Пустая строка для новой сессии
      };
      
      // Создаем GramJS клиента
      const stringSession = new StringSession(session.sessionString);
      const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
        retryDelay: 1000,
        timeout: 10000,
        requestRetries: 3
      });
      
      // Сохраняем сессию и клиента
      this.sessions.set(sessionId, session);
      this.clients.set(sessionId, client);
      
      // Используем правильный способ отправки кода через client.start()
      await client.connect();
      
      let codeSent = false;
      let sendCodeResult: any = null;
      
      // Используем низкоуровневый API для отправки кода
      const { Api } = require('telegram');
      
      const result = await client.invoke(new Api.auth.SendCode({
        phoneNumber: phoneNumber,
        apiId: apiId,
        apiHash: apiHash,
        settings: new Api.CodeSettings({
          allowFlashcall: false,
          currentNumber: false,
          allowAppHash: false
        })
      }));
      
      this.logger.log(`📱 Auth code sent to ${phoneNumber}, session: ${sessionId}`);
      this.logger.log(`🔍 SendCode result:`, {
        type: result.type?.className,
        nextType: result.nextType?.className,
        timeout: result.timeout,
        phoneCodeHash: result.phoneCodeHash ? 'present' : 'missing'
      });
      
      // Сохраняем phoneCodeHash для завершения авторизации
      session.metadata = { phoneCodeHash: result.phoneCodeHash };
      
      return {
        sessionId: sessionId,
        codeSent: true
      };
      
    } catch (error) {
      this.logger.error(`Failed to initiate auth for ${phoneNumber}:`, error);
      throw new Error(`Authentication initiation failed: ${error.message}`);
    }
  }

  /**
   * Инициировать QR-код аутентификацию
   */
  async initiateQRAuth(): Promise<{ sessionId: string; qrCode: string }> {
    try {
      const sessionId = `tg_user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      this.logger.log(`🔐 Initiating QR auth, session: ${sessionId}`);
      
      // Получаем API credentials
      const apiId = parseInt(this.configService.get<string>('TELEGRAM_API_ID') || '123456');
      const apiHash = this.configService.get<string>('TELEGRAM_API_HASH') || 'your_api_hash';
      
      // Создаем новую сессию
      const session: TelegramSessionV2 = {
        id: sessionId,
        phoneNumber: '', // Будет заполнен после QR авторизации
        isAuthenticated: false,
        isConnected: false,
        lastActivity: new Date(),
        sessionString: '',
        metadata: { authMethod: 'qr' }
      };
      
      this.sessions.set(sessionId, session);
      
      // Создаем GramJS клиента
      const stringSession = new StringSession('');
      const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
        retryDelay: 1000,
        timeout: 10000
      });
      
      this.clients.set(sessionId, client);
      
      // Подключаемся к Telegram
      await client.connect();
      
      // Возвращаемся к простому подходу - генерируем QR и вручную проверяем авторизацию
      const { Api } = require('telegram');
      
      try {
        // Экспортируем login token для QR авторизации  
        const result = await client.invoke(new Api.auth.ExportLoginToken({
          apiId: apiId,
          apiHash: apiHash,
          exceptIds: []
        }));
        
        if (result.className === 'auth.LoginToken') {
          this.logger.log(`📱 QR Code generated for session ${sessionId}`);
          
          // Сохраняем QR код в метаданных сессии
          session.metadata = { ...session.metadata, qrToken: result.token };
          
          // Запускаем улучшенную проверку статуса в фоне
          this.improvedQRPolling(client, sessionId, result.token, session);
          
          // Возвращаем QR код немедленно  
          return {
            sessionId: sessionId,
            qrCode: `tg://login?token=${Buffer.from(result.token).toString('base64url')}`
          };
        } else {
          throw new Error('Failed to generate login token');
        }
      } catch (error) {
        this.logger.error(`QR Auth error for session ${sessionId}:`, error);
        throw new Error(`QR Authentication failed: ${error.message}`);
      }
      
    } catch (error) {
      this.logger.error(`Failed to initiate QR auth:`, error);
      throw new Error(`QR Authentication initiation failed: ${error.message}`);
    }
  }

  /**
   * Улучшенная проверка статуса QR авторизации
   */
  private async improvedQRPolling(client: TelegramClient, sessionId: string, token: any, session: TelegramSessionV2) {
    const { Api } = require('telegram');
    
    let pollCount = 0;
    const maxPolls = 30; // 1 минута при интервале в 2 секунды
    
    this.logger.log(`🔄 Starting improved QR polling for session ${sessionId}`);
    
    const pollInterval = setInterval(async () => {
      try {
        pollCount++;
        this.logger.log(`🔄 QR poll attempt ${pollCount}/${maxPolls} for session ${sessionId}`);
        
        // Пробуем импортировать login token
        const result = await client.invoke(new Api.auth.ImportLoginToken({
          token: token
        }));
        
        this.logger.log(`📋 QR poll result: ${result.className}`);
        
        if (result.className === 'auth.Authorization') {
          this.logger.log(`✅ QR Auth SUCCESS for session ${sessionId}!`);
          clearInterval(pollInterval);
          
          // Обновляем сессию с полными данными
          session.isAuthenticated = true;
          session.isConnected = true;
          session.sessionString = client.session.save() as any;
          session.lastActivity = new Date();
          
          // Получаем информацию о пользователе
          try {
            const me = await client.getMe();
            session.phoneNumber = me.phone || '';
            session.userId = Number(me.id);
            this.logger.log(`👤 User authenticated: ${me.firstName} ${me.lastName} (${me.phone})`);
          } catch (error) {
            this.logger.warn(`Could not get user info: ${error.message}`);
          }
          
          // Сохраняем в память и БД
          this.sessions.set(sessionId, session);
          await this.saveTelegramSession(session);
          
          // Настраиваем обработчики
          this.setupEventHandlers(client, sessionId);
          
          this.logger.log(`💾 REAL SESSION SAVED: ${sessionId}`);
          return;
        }
        
        // Проверяем лимит попыток
        if (pollCount >= maxPolls) {
          clearInterval(pollInterval);
          this.logger.log(`⏰ QR polling timeout for session ${sessionId}`);
        }
        
      } catch (error) {
        if (error.message.includes('AUTH_TOKEN_EXPIRED')) {
          this.logger.log(`⏰ QR token expired for session ${sessionId}`);
          clearInterval(pollInterval);
        } else if (error.message.includes('SESSION_PASSWORD_NEEDED')) {
          this.logger.log(`🔐 2FA required for session ${sessionId}`);
          clearInterval(pollInterval);
        } else {
          this.logger.error(`QR polling error for session ${sessionId}: ${error.message}`);
        }
        
        // Останавливаем при критических ошибках
        if (pollCount >= maxPolls) {
          clearInterval(pollInterval);
        }
      }
    }, 2000); // Проверяем каждые 2 секунды
  }

  /**
   * Старый метод проверки статуса QR авторизации (оставлен для совместимости)
   */
  private async pollQRLoginStatus(client: TelegramClient, sessionId: string, token: any, session: TelegramSessionV2, expires?: Date) {
    const { Api } = require('telegram');
    
    let pollCount = 0;
    const maxPolls = 150; // 5 минут при интервале в 2 секунды
    
    const pollInterval = setInterval(async () => {
      try {
        pollCount++;
        this.logger.log(`🔄 Polling QR status for session ${sessionId} (${pollCount}/${maxPolls})`);
        
        const result = await client.invoke(new Api.auth.ImportLoginToken({
          token: token
        }));
        
        this.logger.log(`📋 Poll result for ${sessionId}:`, result.className);
        
        if (result.className === 'auth.Authorization') {
          this.logger.log(`✅ QR Auth successful for session ${sessionId}`);
          
          // Останавливаем опрос
          clearInterval(pollInterval);
          
          // Обновляем сессию с данными пользователя
          session.isAuthenticated = true;
          session.isConnected = true;
          session.phoneNumber = result.user?.phone || '';
          session.userId = result.user?.id ? Number(result.user.id) : undefined;
          session.sessionString = client.session.save() as any;
          session.lastActivity = new Date();
          
          // Обновляем в памяти
          this.sessions.set(sessionId, session);
          
          // Сохраняем в базу данных
          await this.saveTelegramSession(session);
          
          // Настраиваем обработчики событий
          this.setupEventHandlers(client, sessionId);
          
          this.logger.log(`💾 Session saved to database: ${sessionId}`);
        } else if (result.className === 'auth.LoginToken') {
          // QR код еще ждет сканирования
          this.logger.log(`⏳ QR code waiting to be scanned for session ${sessionId}`);
        }
      } catch (error) {
        if (error.message.includes('SESSION_PASSWORD_NEEDED')) {
          this.logger.log(`🔐 2FA password required for session ${sessionId}`);
          clearInterval(pollInterval);
        } else if (error.message.includes('AUTH_TOKEN_EXPIRED')) {
          this.logger.log(`⏰ QR token expired for session ${sessionId}`);
          clearInterval(pollInterval);
        } else {
          this.logger.error(`QR polling error for session ${sessionId}:`, error.message);
          // Логируем полную ошибку для отладки
          this.logger.debug(`Full polling error:`, error);
        }
        
        // Проверяем лимит попыток
        if (pollCount >= maxPolls) {
          clearInterval(pollInterval);
          this.logger.log(`⏰ Max polling attempts reached for session ${sessionId}`);
        }
      }
    }, 2000); // Проверяем каждые 2 секунды
    
    // Останавливаем опрос через 5 минут
    setTimeout(() => {
      clearInterval(pollInterval);
      this.logger.log(`⏰ QR polling timeout for session ${sessionId}`);
    }, 5 * 60 * 1000);
  }

  /**
   * Импортировать сессию из готовой строки сессии
   */
  async importSessionFromString(sessionString: string, phoneNumber: string = '+77476454491'): Promise<TelegramSessionV2> {
    const sessionId = `tg_imported_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger.log(`📥 Importing session from string: ${sessionId}`);
    
    try {
      const apiId = parseInt(this.configService.get<string>('TELEGRAM_API_ID') || '123456');
      const apiHash = this.configService.get<string>('TELEGRAM_API_HASH') || 'your_api_hash';
      
      // Создаем клиент с импортированной сессией
      const stringSession = new StringSession(sessionString);
      const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
      });
      
      // Подключаемся к Telegram
      await client.connect();
      
      // Проверяем что сессия действительна
      const me = await client.getMe();
      
      this.logger.log(`✅ Session imported successfully: ${me.firstName} ${me.lastName} (${me.phone})`);
      
      // Создаем объект сессии
      const session: TelegramSessionV2 = {
        id: sessionId,
        phoneNumber: me.phone || phoneNumber,
        isAuthenticated: true,
        isConnected: true,
        lastActivity: new Date(),
        sessionString: client.session.save() as any,
        userId: Number(me.id),
        metadata: { authMethod: 'imported' }
      };
      
      // Сохраняем в память и базу данных
      this.sessions.set(sessionId, session);
      this.clients.set(sessionId, client);
      await this.saveTelegramSession(session);
      
      // Настраиваем обработчики событий
      this.setupEventHandlers(client, sessionId);
      
      this.logger.log(`💾 Imported session saved: ${sessionId}`);
      
      return session;
    } catch (error) {
      this.logger.error(`Failed to import session: ${error.message}`);
      throw new Error(`Session import failed: ${error.message}`);
    }
  }

  /**
   * Создать тестовую сессию для разработки (обходит rate limiting)
   */
  async createTestSession(phoneNumber: string = '+77476454491'): Promise<TelegramSessionV2> {
    const sessionId = `tg_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger.log(`🧪 Creating test session: ${sessionId}`);
    
    // Создаем тестовую сессию
    const session: TelegramSessionV2 = {
      id: sessionId,
      phoneNumber: phoneNumber,
      isAuthenticated: true,
      isConnected: true,
      lastActivity: new Date(),
      sessionString: 'test_session_string_for_development',
      userId: 123456789,
      metadata: { authMethod: 'test' }
    };
    
    // Сохраняем в память и базу данных
    this.sessions.set(sessionId, session);
    await this.saveTelegramSession(session);
    
    this.logger.log(`✅ Test session created: ${sessionId}`);
    
    return session;
  }

  /**
   * Завершить аутентификацию с кодом подтверждения
   */
  async completeAuth(sessionId: string, code: string, password?: string): Promise<TelegramSessionV2> {
    try {
      this.logger.log(`🔑 Completing auth for session: ${sessionId}`);
      
      const session = this.sessions.get(sessionId);
      const client = this.clients.get(sessionId);
      
      if (!session || !client) {
        throw new Error(`Session ${sessionId} not found`);
      }
      
      // Завершаем авторизацию используя низкоуровневый API
      const { Api } = require('telegram');
      
      try {
        const result = await client.invoke(new Api.auth.SignIn({
          phoneNumber: session.phoneNumber,
          phoneCodeHash: session.metadata?.phoneCodeHash || '',
          phoneCode: code
        }));
        
        this.logger.log(`✅ SignIn successful for ${sessionId}:`, result.className);
        
        if (result.className === 'auth.Authorization') {
          // Обновляем сессию после успешной аутентификации
          session.isAuthenticated = true;
          session.isConnected = true;
          session.lastActivity = new Date();
          
          // Правильно сохраняем session string используя GramJS API
          const sessionString = client.session.save();
          session.sessionString = String(sessionString || '');
          
          // Получаем user ID из result.user
          if (result.user && result.user.id) {
            session.userId = Number(result.user.id);
          } else {
            this.logger.warn(`No user ID in auth result for ${sessionId}`);
            session.userId = 0;
          }
          
          // Обновляем сессию в памяти
          this.sessions.set(sessionId, session);
          
          // Сохраняем в БД
          try {
            await this.saveSessionToDatabase(session);
            this.logger.log(`💾 Session successfully saved to database: ${sessionId}`);
          } catch (dbError) {
            this.logger.error(`Failed to save session to database: ${dbError.message}`);
          }
          
          return session;
        } else {
          throw new Error(`Unexpected auth result: ${result.className}`);
        }
      } catch (signInError) {
        this.logger.error(`SignIn failed, trying with sendCode approach:`, signInError.message);
        
        // Fallback: используем sendCode + signIn
        const sendCodeResult = await client.invoke(new Api.auth.SendCode({
          phoneNumber: session.phoneNumber,
          apiId: parseInt(this.configService.get<string>('TELEGRAM_API_ID') || '123456'),
          apiHash: this.configService.get<string>('TELEGRAM_API_HASH') || 'your_api_hash',
          settings: new Api.CodeSettings({
            allowFlashcall: false,
            currentNumber: false,
            allowAppHash: false
          })
        }));
        
        const result = await client.invoke(new Api.auth.SignIn({
          phoneNumber: session.phoneNumber,
          phoneCodeHash: sendCodeResult.phoneCodeHash,
          phoneCode: code
        }));
        
        if (result.className === 'auth.Authorization') {
          // Обновляем сессию после успешной аутентификации (fallback)
          session.isAuthenticated = true;
          session.isConnected = true;
          session.lastActivity = new Date();
          
          // Правильно сохраняем session string используя GramJS API
          const sessionString = client.session.save();
          session.sessionString = String(sessionString || '');
          
          // Получаем user ID из result.user
          if (result.user && result.user.id) {
            session.userId = Number(result.user.id);
          } else {
            this.logger.warn(`No user ID in fallback auth result for ${sessionId}`);
            session.userId = 0;
          }
          
          // Обновляем сессию в памяти
          this.sessions.set(sessionId, session);
          
          // Сохраняем в БД
          try {
            await this.saveSessionToDatabase(session);
            this.logger.log(`💾 Fallback session successfully saved to database: ${sessionId}`);
          } catch (dbError) {
            this.logger.error(`Failed to save fallback session to database: ${dbError.message}`);
          }
          
          return session;
        }
        
        return result;
      }
      
    } catch (error) {
      this.logger.error(`Failed to complete auth for session ${sessionId}:`, error);
      throw new Error(`Authentication completion failed: ${error.message}`);
    }
  }

  /**
   * Получить информацию о сессии
   */
  getSession(sessionId: string): TelegramSessionV2 | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Получить все активные сессии
   */
  getAllSessions(): TelegramSessionV2[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Отключить сессию
   */
  async disconnectSession(sessionId: string): Promise<void> {
    try {
      this.logger.log(`🔌 Disconnecting session: ${sessionId}`);
      
      const client = this.clients.get(sessionId);
      const session = this.sessions.get(sessionId);
      
      if (client) {
        await client.disconnect();
        this.clients.delete(sessionId);
      }
      
      if (session) {
        session.isConnected = false;
        session.lastActivity = new Date();
        await this.saveSessionToDatabase(session);
      }
      
      this.logger.log(`✅ Session ${sessionId} disconnected`);
    } catch (error) {
      this.logger.error(`Failed to disconnect session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Переподключить существующую сессию
   */
  async reconnectSession(sessionId: string): Promise<void> {
    try {
      const session = this.sessions.get(sessionId);
      
      if (!session || !session.isAuthenticated) {
        throw new Error(`Session ${sessionId} not found or not authenticated`);
      }
      
      this.logger.log(`🔄 Reconnecting session: ${sessionId}`);
      
      // Получаем API credentials
      const apiId = parseInt(this.configService.get<string>('TELEGRAM_API_ID') || '123456');
      const apiHash = this.configService.get<string>('TELEGRAM_API_HASH') || 'your_api_hash';
      
      // Создаем клиента с сохраненной сессией
      const stringSession = new StringSession(session.sessionString || '');
      const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
        retryDelay: 1000,
        timeout: 10000
      });
      
      await client.connect();
      
      // Сохраняем клиента
      this.clients.set(sessionId, client);
      
      // Обновляем статус
      session.isConnected = true;
      session.lastActivity = new Date();
      
      this.logger.log(`✅ Session ${sessionId} reconnected successfully`);
    } catch (error) {
      this.logger.error(`Failed to reconnect session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Получить или переподключить клиента
   */
  private async getClient(sessionId: string): Promise<TelegramClient> {
    let client = this.clients.get(sessionId);
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    if (!client || !client.connected) {
      await this.reconnectSession(sessionId);
      client = this.clients.get(sessionId);
    }
    
    if (!client) {
      throw new Error(`Failed to get client for session ${sessionId}`);
    }
    
    return client;
  }

  // ===============================
  // MESSAGING METHODS
  // ===============================

  /**
   * Отправить сообщение пользователю - ПРОСТАЯ ВЕРСИЯ БЕЗ СЛОЖНОСТЕЙ
   */
  async sendMessage(sessionId: string, message: TelegramMessageV2): Promise<any> {
    try {
      this.logger.log(`📤 Sending message via session ${sessionId} to chat ${message.chatId}`);
      
      const client = await this.getClient(sessionId);
      const session = this.sessions.get(sessionId);
      
      if (!session?.isAuthenticated) {
        throw new Error(`Session ${sessionId} is not authenticated`);
      }
      
      // GramJS делает все за нас - никаких сложных peer resolution!
      const result = await client.sendMessage(message.chatId, {
        message: message.message,
        parseMode: message.parseMode,
        replyTo: message.replyToMessageId
      });
      
      // Обновляем активность сессии
      session.lastActivity = new Date();
      
      this.logger.log(`✅ Message sent successfully: ${result.id}`);
      
      return {
        messageId: result.id,
        date: result.date,
        chatId: message.chatId
      };
      
    } catch (error) {
      this.logger.error(`Failed to send message via session ${sessionId}:`, error);
      throw new Error(`Message sending failed: ${error.message}`);
    }
  }

  /**
   * Получить список чатов пользователя - ПРОСТАЯ ВЕРСИЯ
   */
  async getUserChats(sessionId: string, limit = 100): Promise<TelegramChatV2[]> {
    try {
      this.logger.log(`📋 Getting chats for session ${sessionId}`);
      
      const client = await this.getClient(sessionId);
      const session = this.sessions.get(sessionId);
      
      if (!session?.isAuthenticated) {
        throw new Error(`Session ${sessionId} is not authenticated`);
      }
      
      // GramJS автоматически получает диалоги без сложных кешей
      const dialogs = await client.getDialogs({ limit });
      
      const chats: TelegramChatV2[] = [];
      
      for (const dialog of dialogs) {
        const entity = dialog.entity;
        
        if (!entity) continue;
        
        let chat: TelegramChatV2;
        
        if ('firstName' in entity) {
          // Приватный чат с пользователем
          chat = {
            id: String(entity.id || ''), // Безопасное приведение
            type: 'private',
            firstName: entity.firstName,
            lastName: entity.lastName,
            username: (entity as any).username,
            isBot: (entity as any).bot || false
          };
        } else if ('title' in entity) {
          // Группа или канал
          chat = {
            id: String((entity as any).id || ''), // Безопасное приведение
            type: (entity as any).broadcast ? 'channel' : 
                  (entity as any).megagroup ? 'supergroup' : 'group',
            title: (entity as any).title || '',
            username: (entity as any).username || undefined
          };
        } else {
          continue; // Пропускаем неизвестные типы
        }
        
        chats.push(chat);
      }
      
      // Обновляем активность сессии
      session.lastActivity = new Date();
      
      this.logger.log(`✅ Retrieved ${chats.length} chats for session ${sessionId}`);
      
      return chats;
      
    } catch (error) {
      this.logger.error(`Failed to get chats for session ${sessionId}:`, error);
      throw new Error(`Failed to get user chats: ${error.message}`);
    }
  }

  /**
   * Получить историю сообщений чата - ПРОСТАЯ ВЕРСИЯ
   */
  async getChatHistory(sessionId: string, chatId: string, limit = 100): Promise<any[]> {
    try {
      this.logger.log(`📜 Getting chat history for session ${sessionId}, chat ${chatId}`);
      
      const client = await this.getClient(sessionId);
      const session = this.sessions.get(sessionId);
      
      if (!session?.isAuthenticated) {
        throw new Error(`Session ${sessionId} is not authenticated`);
      }
      
      // GramJS автоматически получает сообщения без FLOOD_WAIT проблем
      const messages = await client.getMessages(chatId, { limit });
      
      const formattedMessages: any[] = [];
      
      for (const message of messages) {
        if (!message) continue;
        
        const formattedMessage = {
          id: message.id,
          message: message.message || '',
          date: message.date,
          out: message.out, // Исходящее сообщение или нет
          fromId: (message.fromId as any)?.userId || (message.fromId as any)?.chatId,
          peerId: (message.peerId as any)?.userId || (message.peerId as any)?.chatId,
          // Медиа файлы (если есть)
          media: message.media ? {
            type: (message.media as any)?.className || 'unknown',
            document: (message.media as any).document,
            photo: (message.media as any).photo
          } : undefined
        };
        
        formattedMessages.push(formattedMessage);
      }
      
      // Обновляем активность сессии
      session.lastActivity = new Date();
      
      this.logger.log(`✅ Retrieved ${formattedMessages.length} messages for chat ${chatId}`);
      
      return formattedMessages;
      
    } catch (error) {
      this.logger.error(`Failed to get chat history for session ${sessionId}, chat ${chatId}:`, error);
      throw new Error(`Failed to get chat history: ${error.message}`);
    }
  }

  // ===============================
  // FILE METHODS  
  // ===============================

  /**
   * Отправить файл пользователю - ПРОСТАЯ ВЕРСИЯ
   */
  async sendFile(sessionId: string, chatId: string, file: Express.Multer.File, caption?: string): Promise<any> {
    try {
      this.logger.log(`📎 Sending file via session ${sessionId} to chat ${chatId}: ${file.originalname} (${file.size} bytes)`);
      
      const client = await this.getClient(sessionId);
      const session = this.sessions.get(sessionId);
      
      if (!session?.isAuthenticated) {
        throw new Error(`Session ${sessionId} is not authenticated`);
      }
      
      // GramJS отправка файла через временный файл (для сохранения имени)
      this.logger.log(`📎 Preparing file: ${file.originalname}, MIME: ${file.mimetype}, Size: ${file.size}`);
      
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');
      
      // Создаем временный файл с правильным именем
      const tempDir = os.tmpdir();
      const tempFilePath = path.join(tempDir, file.originalname);
      
      try {
        // Записываем файл во временную папку
        fs.writeFileSync(tempFilePath, file.buffer);
        this.logger.log(`📁 Temporary file created: ${tempFilePath}`);
        
        // ПРАВИЛЬНЫЙ подход: CustomFile + Api.DocumentAttributeFilename 
        this.logger.log(`🔧 Using CustomFile + DocumentAttributeFilename approach: ${file.originalname}`);
        
        const customFile = new CustomFile(
          file.originalname,  // fileName
          file.size,          // fileSize  
          tempFilePath,       // path (используем путь к временному файлу)
          file.buffer         // buffer
        );
        
        const result = await client.sendFile(chatId, {
          file: customFile,
          caption: caption,
          forceDocument: true,
          attributes: [new Api.DocumentAttributeFilename({ fileName: file.originalname })]
        });
        
        // Удаляем временный файл (с проверкой существования)
        try {
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
            this.logger.log(`🗑️ Temporary file deleted: ${tempFilePath}`);
          }
        } catch (cleanupError) {
          this.logger.warn(`Failed to cleanup temp file after success: ${cleanupError.message}`);
        }
        
        // Обновляем активность сессии
        session.lastActivity = new Date();
        
        this.logger.log(`✅ File sent successfully via DocumentAttributeFilename: ${result.id}`);
        
        return {
          messageId: result.id,
          fileName: file.originalname,
          fileSize: file.size,
          date: result.date
        };
        
      } catch (fileError) {
        // Если что-то пошло не так с временным файлом, убираем его
        try {
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
        } catch (cleanupError) {
          this.logger.warn(`Failed to cleanup temp file: ${cleanupError.message}`);
        }
        throw fileError;
      }
      
    } catch (error) {
      this.logger.error(`Failed to send file via session ${sessionId}:`, error);
      throw new Error(`File sending failed: ${error.message}`);
    }
  }

  /**
   * Скачать файл из сообщения - ПРОСТАЯ ВЕРСИЯ
   */
  async downloadFile(sessionId: string, chatId: string, messageId: string): Promise<Buffer & { contentType?: string; fileName?: string }> {
    try {
      this.logger.log(`📥 Downloading file from message ${messageId} in chat ${chatId} via session ${sessionId}`);
      
      const client = await this.getClient(sessionId);
      const session = this.sessions.get(sessionId);
      
      if (!session?.isAuthenticated) {
        throw new Error(`Session ${sessionId} is not authenticated`);
      }
      
      // Получаем сообщение
      const messages = await client.getMessages(chatId, { ids: [parseInt(messageId)] });
      const message = messages[0];
      
      if (!message || !message.media) {
        throw new Error(`Message ${messageId} not found or has no media`);
      }
      
      // GramJS автоматически скачивает файл
      const buffer = await client.downloadMedia(message.media, {
        outputFile: undefined // Возвращает Buffer вместо сохранения в файл
      });
      
      // Обновляем активность сессии
      session.lastActivity = new Date();
      
      let fileName = 'file';
      let contentType = 'application/octet-stream';
      
      // Определяем имя файла и тип контента
      const mediaAny = message.media as any;
      if (mediaAny.document) {
        const doc = mediaAny.document;
        contentType = doc.mimeType || contentType;
        
        // Правильный способ получения имени файла в GramJS
        if (doc.attributes) {
          this.logger.log(`🔍 Document has ${doc.attributes.length} attributes`);
          
          for (let i = 0; i < doc.attributes.length; i++) {
            const attr = doc.attributes[i];
            
            // Логируем структуру атрибута для отладки
            this.logger.log(`🔍 Attribute ${i}:`, {
              className: attr.className,
              constructorName: attr.constructor?.name,
              _name: (attr as any)._name,
              hasFileName: !!(attr as any).fileName,
              keys: Object.keys(attr)
            });
            
            // В GramJS это может быть DocumentAttributeFilename без className
            if (attr.fileName || (attr.className && attr.className.includes('DocumentAttributeFilename'))) {
              fileName = attr.fileName || (attr as any).fileName;
              this.logger.log(`📄 Found filename: ${fileName}`);
              break;
            }
            // Также проверяем через _name и constructor.name
            if (attr._name === 'DocumentAttributeFilename' || attr.constructor?.name === 'DocumentAttributeFilename') {
              fileName = attr.fileName || (attr as any).fileName;
              this.logger.log(`📄 Found filename via _name: ${fileName}`);
              break;
            }
            // Проверяем прямое свойство fileName в атрибуте
            if ((attr as any).fileName) {
              fileName = (attr as any).fileName;
              this.logger.log(`📄 Found filename via direct property: ${fileName}`);
              break;
            }
          }
        }
        
        // Если имя файла не найдено, используем MIME тип для расширения
        if (fileName === 'file' && contentType) {
          const extension = this.getExtensionFromMimeType(contentType);
          fileName = `document_${messageId}${extension}`;
        }
      } else if (mediaAny.photo) {
        fileName = `photo_${messageId}.jpg`;
        contentType = 'image/jpeg';
      }
      
      // Проверяем что buffer существует
      if (!buffer) {
        throw new Error('Failed to download file: buffer is empty');
      }
      
      // Добавляем метаданные к буферу
      const resultBuffer = buffer as Buffer & { contentType?: string; fileName?: string };
      resultBuffer.contentType = contentType;
      resultBuffer.fileName = fileName;
      
      this.logger.log(`✅ File downloaded successfully: ${fileName} (${buffer.length} bytes)`);
      
      return resultBuffer;
      
    } catch (error) {
      this.logger.error(`Failed to download file from session ${sessionId}:`, error);
      throw new Error(`File download failed: ${error.message}`);
    }
  }

  /**
   * Получить расширение файла по MIME типу
   */
  private getExtensionFromMimeType(mimeType: string): string {
    const mimeMap: Record<string, string> = {
      'application/pdf': '.pdf',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/vnd.ms-excel': '.xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
      'application/vnd.ms-powerpoint': '.ppt',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
      'text/plain': '.txt',
      'text/csv': '.csv',
      'application/json': '.json',
      'application/xml': '.xml',
      'application/zip': '.zip',
      'application/x-rar-compressed': '.rar',
      'application/x-7z-compressed': '.7z',
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'video/mp4': '.mp4',
      'video/avi': '.avi',
      'video/quicktime': '.mov',
      'audio/mpeg': '.mp3',
      'audio/wav': '.wav',
      'audio/ogg': '.ogg'
    };
    
    return mimeMap[mimeType] || '.bin';
  }

  // ===============================
  // REAL-TIME METHODS
  // ===============================

  /**
   * Запускаем Smart Polling для получения новых сообщений
   * Это надежная альтернатива GramJS событиям
   */
  private async startSmartPolling(sessionId: string): Promise<void> {
    try {
      this.logger.log(`🔄 Starting Smart Polling for session ${sessionId}`);
      
      // Очищаем предыдущий интервал если есть
      if (this.pollingIntervals.has(sessionId)) {
        clearInterval(this.pollingIntervals.get(sessionId));
      }
      
      // Инициализируем карту последних сообщений для сессии
      if (!this.lastMessageIds.has(sessionId)) {
        this.lastMessageIds.set(sessionId, new Map<string, number>());
      }
      
      // Запускаем проверку каждые 3 секунды
      const interval = setInterval(async () => {
        try {
          await this.pollForNewMessages(sessionId);
        } catch (error) {
          this.logger.warn(`⚠️ Smart polling error for session ${sessionId}:`, error.message);
        }
      }, 3000);
      
      this.pollingIntervals.set(sessionId, interval);
      this.logger.log(`✅ Smart Polling started for session ${sessionId}`);
      
    } catch (error) {
      this.logger.error(`Failed to start Smart Polling for session ${sessionId}:`, error);
    }
  }

  /**
   * Проверяем новые сообщения для сессии (Smart Polling)
   */
  private async pollForNewMessages(sessionId: string): Promise<void> {
    try {
      const client = this.clients.get(sessionId);
      if (!client) return;
      
      // Получаем список диалогов (первые 10 самых активных)
      const dialogs = await client.getDialogs({ limit: 10 });
      
      const sessionLastMessages = this.lastMessageIds.get(sessionId) || new Map();
      let hasNewMessages = false;
      
      for (const dialog of dialogs) {
        if (!dialog.entity) continue; // Пропускаем диалоги без entity
        
        const chatId = dialog.entity.id.toString();
        const lastMessageId = dialog.message?.id || 0;
        const storedLastId = sessionLastMessages.get(chatId) || 0;
        
        if (lastMessageId > storedLastId) {
          // Есть новые сообщения в этом чате
          const messages = await client.getMessages(dialog.entity, { 
            limit: 5,
            minId: storedLastId 
          });
          
          // Обрабатываем новые сообщения
          for (const message of messages.reverse()) { // reverse для хронологического порядка
            if (message.id > storedLastId) {
              await this.handleNewMessage(sessionId, { message });
              hasNewMessages = true;
            }
          }
          
          // Обновляем последний ID сообщения
          sessionLastMessages.set(chatId, lastMessageId);
        }
      }
      
      if (hasNewMessages) {
        this.logger.log(`📨 Processed new messages via Smart Polling for session ${sessionId}`);
      }
      
    } catch (error) {
      this.logger.warn(`Smart polling check failed for session ${sessionId}:`, error.message);
    }
  }

  /**
   * Начать прослушивание сообщений для сессии - Smart Polling
   */
  async startListening(sessionId: string): Promise<void> {
    try {
      this.logger.log(`👂 Starting real-time message listening for session: ${sessionId}`);
      
      const client = await this.getClient(sessionId);
      const session = this.sessions.get(sessionId);
      
      if (!session?.isAuthenticated) {
        throw new Error(`Session ${sessionId} is not authenticated`);
      }
      
      // Запускаем Smart Polling для надежного получения сообщений
      this.logger.log(`🔧 CALLING startSmartPolling for session ${sessionId}`);
      await this.startSmartPolling(sessionId);
      
      this.logger.log(`✅ Smart Polling started for session ${sessionId}`);
      
    } catch (error) {
      this.logger.error(`Failed to start listening for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Сериализация медиа объектов для WebSocket (конвертация BigInt в строки)
   */
  private serializeMediaForWebSocket(media: any): any {
    if (!media) return undefined;

    try {
      // Рекурсивно конвертируем BigInt в строки
      const serialize = (obj: any): any => {
        if (obj === null || obj === undefined) return obj;
        if (typeof obj === 'bigint') return obj.toString();
        if (typeof obj === 'object') {
          if (Array.isArray(obj)) {
            return obj.map(serialize);
          }
          const result: any = {};
          for (const [key, value] of Object.entries(obj)) {
            result[key] = serialize(value);
          }
          return result;
        }
        return obj;
      };

      return {
        type: media.className || media.constructor?.name,
        className: media.className,
        photo: media.photo ? serialize(media.photo) : undefined,
        document: media.document ? serialize(media.document) : undefined
      };
    } catch (error) {
      this.logger.warn(`Failed to serialize media for WebSocket: ${error.message}`);
      return {
        type: media.className || media.constructor?.name,
        className: media.className
      };
    }
  }

  /**
   * Обработать новое сообщение - ПРОСТАЯ ВЕРСИЯ
   */
  private async handleNewMessage(sessionId: string, update: any): Promise<void> {
    try {
      // Добавляем диагностическое логирование без JSON сериализации
      const eventType = update.className || update.constructor?.name || update._name || 'unknown';
      this.logger.log(`🔍 Event received in session ${sessionId}: ${eventType}`);
      
      // Безопасное логирование только основных свойств
      const safeLogData = {
        messageId: update.message?.id,
        messageText: update.message?.message?.substring(0, 50),
        hasMessage: !!update.message
      };
      this.logger.log(`🔍 Event safe data:`, JSON.stringify(safeLogData));
      
      // Упрощаем проверку - принимаем любой update с message
      if (!update.message) {
        this.logger.log(`⚠️ Skipping event ${eventType} - no message property`);
        return;
      }
      
      const message = update.message;
      if (!message) {
        return;
      }
      
      this.logger.log(`📨 New message received in session ${sessionId}: ${message.id}`);
      
      // Определяем ID чата
      const peerId = message.peerId as any;
      const chatId = (peerId?.userId || peerId?.chatId)?.toString();
      if (!chatId) {
        return;
      }
      
      // Создаем WebSocket уведомление - совместимо с существующей системой!
      const telegramUpdate = {
        type: 'new_message' as const,
        sessionId: sessionId,
        chatId: chatId,
        data: {
          messageId: message.id,
          text: message.message || '',
          message: message.message || '',
          date: message.date,
          isIncoming: !message.out,
          isOutgoing: message.out,
          fromId: (message.fromId as any)?.userId || (message.fromId as any)?.chatId,
          peerId: (message.peerId as any)?.userId || (message.peerId as any)?.chatId,
          // Добавляем медиа информацию для правильной обработки в frontend
          media: message.media ? this.serializeMediaForWebSocket(message.media) : undefined
        }
      };
      
      // Отправляем через существующий WebSocket Gateway
      this.webSocketGateway.sendTelegramUpdate(telegramUpdate);
      
      this.logger.log(`✅ WebSocket notification sent for message ${message.id}`);
      
    } catch (error) {
      this.logger.error(`Error handling new message in session ${sessionId}:`, error);
    }
  }

  // ===============================
  // WEBHOOK МЕТОДЫ
  // ===============================

  /**
   * Запустить оптимизированный Smart Polling для сессии
   */
  async setupWebhook(sessionId: string, webhookUrl: string): Promise<void> {
    try {
      this.logger.log(`🎧 Setting up direct GramJS events for session ${sessionId}`);
      
      const client = await this.getClient(sessionId);
      const session = this.sessions.get(sessionId);
      if (!session?.isAuthenticated) {
        throw new Error(`Session ${sessionId} is not authenticated`);
      }

      // Отключаем Smart Polling если есть
      if (this.pollingIntervals.has(sessionId)) {
        clearInterval(this.pollingIntervals.get(sessionId));
        this.pollingIntervals.delete(sessionId);
        this.logger.log(`🛑 Smart Polling disabled for session ${sessionId}`);
      }

      // Импортируем события GramJS
      const { NewMessage } = await import('telegram/events');
      
      // Настраиваем прямой обработчик событий
      const directEventHandler = async (update: any) => {
        try {
          this.logger.log(`📨 Direct GramJS event received for session ${sessionId}`);
          
          // Обрабатываем событие напрямую, минуя JSON сериализацию
          await this.handleNewMessage(sessionId, update);
          
        } catch (error) {
          this.logger.error(`Direct event handling failed for session ${sessionId}:`, error.message);
        }
      };

      // Добавляем обработчик только для входящих сообщений
      client.addEventHandler(directEventHandler, new NewMessage({
        incoming: true,   // Только входящие сообщения
        outgoing: false   // Исключаем исходящие сообщения
      }));

      // Сохраняем метаданные в сессии
      session.metadata = {
        ...session.metadata,
        eventsEnabled: true,
        webhookUrl: webhookUrl
      };

      this.logger.log(`✅ Direct GramJS events configured for session ${sessionId}`);
      
    } catch (error) {
      this.logger.error(`Failed to setup direct events for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Обработать внешний webhook вызов (для совместимости)
   * Теперь используются прямые GramJS события, но этот метод оставлен для API совместимости
   */
  async handleWebhookUpdate(sessionId: string, update: any): Promise<void> {
    try {
      this.logger.log(`🔗 External webhook call received for session ${sessionId} (now using direct events)`);
      
      // Прямые GramJS события работают автоматически
      // Этот метод оставлен для совместимости API
      this.logger.log(`ℹ️ Direct GramJS events handle messages automatically, external webhook not needed`);
      
    } catch (error) {
      this.logger.error(`Webhook compatibility handler failed for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Оптимизированная проверка новых сообщений (только последние диалоги)
   */
  private async optimizedPollForNewMessages(sessionId: string): Promise<void> {
    try {
      const client = this.clients.get(sessionId);
      if (!client) return;
      
      // Получаем только последние 5 активных диалогов (не 100!)
      const dialogs = await client.getDialogs({ limit: 5 });
      
      const sessionLastMessages = this.lastMessageIds.get(sessionId) || new Map();
      let hasNewMessages = false;
      
      for (const dialog of dialogs) {
        if (!(dialog as any).entity) continue;
        
        const chatId = String((dialog as any).entity.id || '');
        const lastMessageId = (dialog as any).message?.id || 0;
        const storedLastId = sessionLastMessages.get(chatId) || 0;
        
        if (lastMessageId > storedLastId) {
          // Получаем только новые сообщения (максимум 3)
          const messages = await client.getMessages((dialog as any).entity, { 
            limit: 3,
            minId: storedLastId 
          });
          
          // Обрабатываем новые сообщения
          for (const message of messages.reverse()) {
            if (message.id > storedLastId) {
              await this.handleNewMessage(sessionId, { message });
              hasNewMessages = true;
            }
          }
          
          // Обновляем последний ID
          sessionLastMessages.set(chatId, lastMessageId);
        }
      }
      
      if (hasNewMessages) {
        this.logger.log(`📨 Found new messages via optimized polling for session ${sessionId}`);
      }
      
    } catch (error) {
      throw error; // Пробрасываем ошибку для обработки FLOOD_WAIT
    }
  }
}