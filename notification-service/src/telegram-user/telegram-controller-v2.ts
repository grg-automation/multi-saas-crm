import { Controller, Post, Get, Delete, Body, Param, Logger, HttpException, HttpStatus, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TelegramServiceV2, TelegramSessionV2, TelegramMessageV2 } from './telegram-service-v2';
import { InitiateAuthDto, CompleteAuthDto, SendUserMessageDto } from './dto/telegram-user.dto';
import { SessionTestService } from './session-test.service';

/**
 * Controller V2 для управления Telegram User API на GramJS
 * Предоставляет упрощенные endpoints без сложностей MTProto
 */

@Controller('telegram-user-v2')
export class TelegramControllerV2 {
  private readonly logger = new Logger(TelegramControllerV2.name);

  constructor(
    private readonly telegramServiceV2: TelegramServiceV2,
    private readonly sessionTestService: SessionTestService
  ) {}

  /**
   * Инициировать аутентификацию Telegram пользователя V2
   * POST /api/v1/telegram-user-v2/auth/initiate
   */
  @Post('auth/initiate')
  async initiateAuth(@Body() dto: InitiateAuthDto) {
    try {
      this.logger.log(`🔐 V2: Initiating auth for phone: ${dto.phoneNumber}`);
      
      const result = await this.telegramServiceV2.initiateAuth(dto.phoneNumber);
      
      return {
        success: true,
        sessionId: result.sessionId,
        codeSent: result.codeSent,
        version: 'v2-gramjs',
        message: 'Authentication code sent to your phone. Use /auth/complete to finish.'
      };
    } catch (error) {
      this.logger.error(`V2: Failed to initiate auth: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message, version: 'v2-gramjs' },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Инициировать QR-код аутентификацию V2
   * POST /api/v1/telegram-user-v2/auth/qr
   */
  @Post('auth/qr')
  async initiateQRAuth() {
    try {
      this.logger.log(`🔐 V2: Initiating QR auth`);
      
      const result = await this.telegramServiceV2.initiateQRAuth();
      
      return {
        success: true,
        sessionId: result.sessionId,
        qrCode: result.qrCode,
        version: 'v2-gramjs',
        message: 'QR code generated. Scan it with Telegram app to login.'
      };
    } catch (error) {
      this.logger.error(`V2: Failed to initiate QR auth: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message, version: 'v2-gramjs' },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Завершить аутентификацию с кодом подтверждения V2
   * POST /api/v1/telegram-user-v2/auth/complete
   */
  @Post('auth/complete')
  async completeAuth(@Body() dto: CompleteAuthDto) {
    try {
      this.logger.log(`🔑 V2: Completing auth for session: ${dto.sessionId}`);
      
      const session = await this.telegramServiceV2.completeAuth(
        dto.sessionId,
        dto.code,
        dto.password
      );
      
      return {
        success: true,
        session: {
          id: session.id,
          phoneNumber: session.phoneNumber,
          userId: session.userId,
          isAuthenticated: session.isAuthenticated,
          isConnected: session.isConnected
        },
        version: 'v2-gramjs',
        message: 'Authentication completed successfully'
      };
    } catch (error) {
      this.logger.error(`V2: Failed to complete auth: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message, version: 'v2-gramjs' },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Отправить сообщение от имени пользователя V2
   * POST /api/v1/telegram-user-v2/send-message
   */
  @Post('send-message')
  async sendMessage(@Body() dto: SendUserMessageDto) {
    try {
      this.logger.log(`📤 V2: Sending message via session: ${dto.sessionId}`);
      
      const message: TelegramMessageV2 = {
        chatId: dto.chatId,
        message: dto.message,
        parseMode: dto.parseMode,
        replyToMessageId: dto.replyToMessageId
      };
      
      const result = await this.telegramServiceV2.sendMessage(dto.sessionId, message);
      
      return {
        success: true,
        messageId: result.messageId,
        sentAt: new Date().toISOString(),
        version: 'v2-gramjs',
        message: 'Message sent successfully'
      };
    } catch (error) {
      this.logger.error(`V2: Failed to send message: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message, version: 'v2-gramjs' },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Отправить файл от имени пользователя V2
   * POST /api/v1/telegram-user-v2/send-file
   */
  @Post('send-file')
  @UseInterceptors(FileInterceptor('file'))
  async sendFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('sessionId') sessionId: string,
    @Body('chatId') chatId: string,
    @Body('caption') caption?: string
  ) {
    try {
      this.logger.log(`📎 V2: Sending file via session: ${sessionId} to chat: ${chatId}`);
      
      if (!file) {
        throw new HttpException(
          { success: false, message: 'No file provided', version: 'v2-gramjs' },
          HttpStatus.BAD_REQUEST
        );
      }
      
      const result = await this.telegramServiceV2.sendFile(
        sessionId,
        chatId,
        file,
        caption
      );
      
      return {
        success: true,
        messageId: result.messageId,
        fileName: file.originalname,
        fileSize: file.size,
        sentAt: new Date().toISOString(),
        version: 'v2-gramjs',
        message: 'File sent successfully'
      };
    } catch (error) {
      this.logger.error(`V2: Failed to send file: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message, version: 'v2-gramjs' },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Получить список чатов пользователя V2
   * GET /api/v1/telegram-user-v2/:sessionId/chats
   */
  @Get(':sessionId/chats')
  async getUserChats(@Param('sessionId') sessionId: string) {
    try {
      this.logger.log(`📋 V2: Getting chats for session: ${sessionId}`);
      
      const chats = await this.telegramServiceV2.getUserChats(sessionId);
      
      return {
        success: true,
        chats,
        count: chats.length,
        version: 'v2-gramjs'
      };
    } catch (error) {
      this.logger.error(`V2: Failed to get user chats: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message, version: 'v2-gramjs' },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Получить историю сообщений для чата V2
   * GET /api/v1/telegram-user-v2/:sessionId/chats/:chatId/history
   */
  @Get(':sessionId/chats/:chatId/history')
  async getChatHistory(
    @Param('sessionId') sessionId: string,
    @Param('chatId') chatId: string
  ) {
    try {
      this.logger.log(`📜 V2: Getting chat history for session: ${sessionId}, chat: ${chatId}`);
      
      const messages = await this.telegramServiceV2.getChatHistory(sessionId, chatId);
      
      return {
        success: true,
        messages,
        count: messages.length,
        version: 'v2-gramjs'
      };
    } catch (error) {
      this.logger.error(`V2: Failed to get chat history: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message, version: 'v2-gramjs' },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Начать прослушивание сообщений для сессии V2
   * POST /api/v1/telegram-user-v2/:sessionId/start-listening
   */
  @Post(':sessionId/start-listening')
  async startListening(@Param('sessionId') sessionId: string) {
    try {
      this.logger.log(`👂 V2: Starting to listen for session: ${sessionId}`);
      
      await this.telegramServiceV2.startListening(sessionId);
      
      return {
        success: true,
        version: 'v2-gramjs',
        message: 'Started listening for incoming messages with GramJS events'
      };
    } catch (error) {
      this.logger.error(`V2: Failed to start listening: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message, version: 'v2-gramjs' },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Получить информацию о сессии V2
   * GET /api/v1/telegram-user-v2/session/:sessionId
   */
  @Get('session/:sessionId')
  async getSession(@Param('sessionId') sessionId: string) {
    try {
      const session = this.telegramServiceV2.getSession(sessionId);
      
      if (!session) {
        throw new HttpException(
          { success: false, message: 'Session not found', version: 'v2-gramjs' },
          HttpStatus.NOT_FOUND
        );
      }
      
      return {
        success: true,
        session: {
          id: session.id,
          phoneNumber: session.phoneNumber,
          userId: session.userId,
          isAuthenticated: session.isAuthenticated,
          isConnected: session.isConnected,
          lastActivity: session.lastActivity
        },
        version: 'v2-gramjs'
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      this.logger.error(`V2: Failed to get session: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message, version: 'v2-gramjs' },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Получить все активные сессии V2
   * GET /api/v1/telegram-user-v2/sessions
   */
  @Get('sessions')
  async getAllSessions() {
    try {
      const sessions = this.telegramServiceV2.getAllSessions();
      
      return {
        success: true,
        sessions: sessions.map(session => ({
          id: session.id,
          phoneNumber: session.phoneNumber,
          userId: session.userId,
          isAuthenticated: session.isAuthenticated,
          isConnected: session.isConnected,
          lastActivity: session.lastActivity
        })),
        count: sessions.length,
        version: 'v2-gramjs'
      };
    } catch (error) {
      this.logger.error(`V2: Failed to get all sessions: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message, version: 'v2-gramjs' },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Отключить сессию V2
   * DELETE /api/v1/telegram-user-v2/session/:sessionId
   */
  @Delete('session/:sessionId')
  async disconnectSession(@Param('sessionId') sessionId: string) {
    try {
      this.logger.log(`🔌 V2: Disconnecting session: ${sessionId}`);
      
      await this.telegramServiceV2.disconnectSession(sessionId);
      
      return {
        success: true,
        version: 'v2-gramjs',
        message: 'Session disconnected successfully'
      };
    } catch (error) {
      this.logger.error(`V2: Failed to disconnect session: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message, version: 'v2-gramjs' },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Скачать файл из Telegram сообщения V2
   * GET /api/v1/telegram-user-v2/:sessionId/download/:chatId/:messageId
   */
  @Get(':sessionId/download/:chatId/:messageId')
  async downloadFile(
    @Param('sessionId') sessionId: string,
    @Param('chatId') chatId: string,
    @Param('messageId') messageId: string
  ) {
    try {
      this.logger.log(`📥 V2: Downloading file from message ${messageId} in chat ${chatId} via session: ${sessionId}`);
      
      const fileBuffer = await this.telegramServiceV2.downloadFile(sessionId, chatId, messageId);
      
      return {
        success: true,
        data: fileBuffer.toString('base64'),
        contentType: fileBuffer.contentType || 'application/octet-stream',
        fileName: fileBuffer.fileName || `file_${messageId}`,
        fileSize: fileBuffer.length,
        version: 'v2-gramjs',
        message: 'File downloaded successfully'
      };
    } catch (error) {
      this.logger.error(`V2: Failed to download file: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message, version: 'v2-gramjs' },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Создать сессию из готовой строки сессии
   * POST /api/v1/telegram-user-v2/auth/import-session
   */
  @Post('auth/import-session')
  async importSession(@Body() dto: { sessionString: string, phoneNumber?: string }) {
    try {
      this.logger.log(`📥 Importing session from string`);
      
      if (!dto.sessionString) {
        throw new HttpException(
          { success: false, message: 'sessionString is required', version: 'v2-gramjs' },
          HttpStatus.BAD_REQUEST
        );
      }
      
      const session = await this.telegramServiceV2.importSessionFromString(
        dto.sessionString, 
        dto.phoneNumber || '+77476454491'
      );
      
      return {
        success: true,
        session: {
          id: session.id,
          phoneNumber: session.phoneNumber,
          userId: session.userId,
          isAuthenticated: session.isAuthenticated,
          isConnected: session.isConnected
        },
        version: 'v2-gramjs',
        message: 'Session imported successfully from string.'
      };
    } catch (error) {
      this.logger.error(`Failed to import session: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message, version: 'v2-gramjs' },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Health check для Telegram User API V2
   * GET /api/v1/telegram-user-v2/health
   */
  @Get('health')
  async healthCheck() {
    try {
      const sessions = this.telegramServiceV2.getAllSessions();
      const activeSessions = sessions.filter(s => s.isConnected).length;
      const authenticatedSessions = sessions.filter(s => s.isAuthenticated).length;
      
      return {
        success: true,
        service: 'Telegram User API V2',
        version: 'v2-gramjs',
        library: 'GramJS 2.15.7',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        stats: {
          totalSessions: sessions.length,
          activeSessions,
          authenticatedSessions
        }
      };
    } catch (error) {
      this.logger.error(`V2: Health check failed: ${error.message}`);
      throw new HttpException(
        { success: false, message: 'Service unhealthy', version: 'v2-gramjs' },
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
  }

  /**
   * Переподключить сессию V2
   * POST /api/v1/telegram-user-v2/:sessionId/reconnect
   */
  @Post(':sessionId/reconnect')
  async reconnectSession(@Param('sessionId') sessionId: string) {
    try {
      this.logger.log(`🔄 V2: Reconnecting session: ${sessionId}`);
      
      await this.telegramServiceV2.reconnectSession(sessionId);
      
      return {
        success: true,
        version: 'v2-gramjs', 
        message: 'Session reconnected successfully'
      };
    } catch (error) {
      this.logger.error(`V2: Failed to reconnect session: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message, version: 'v2-gramjs' },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Сравнение V1 vs V2 - информационный endpoint
   * GET /api/v1/telegram-user-v2/comparison
   */
  @Get('comparison')
  async getComparison() {
    return {
      success: true,
      comparison: {
        v1: {
          library: '@mtproto/core 6.3.0',
          description: 'Низкоуровневая реализация MTProto',
          problems: [
            'FLOOD_WAIT блокировки',
            'Сложные peer caches',
            'Проблемы с большими файлами', 
            '2600+ строк кода',
            'Множественные fallback методы'
          ]
        },
        v2: {
          library: 'GramJS (telegram) 2.15.7',
          description: 'Современная высокоуровневая реализация',
          benefits: [
            'Автоматическая обработка rate limits',
            'Простая работа с файлами любого размера',
            'Встроенные события для real-time',
            '~600 строк простого кода',
            'Активная поддержка сообщества'
          ]
        }
      },
      recommendation: 'Используйте V2 для новых проектов. V1 оставлен для совместимости.',
      version: 'v2-gramjs'
    };
  }

  // ===============================
  // TESTING AND DEBUG ENDPOINTS
  // ===============================

  /**
   * Показать пример формата сессии
   * GET /api/v1/telegram-user-v2/test/session-format
   */
  @Get('test/session-format')
  async getSessionFormat() {
    try {
      const testSession = this.sessionTestService.createTestSession();
      this.sessionTestService.explainSessionFormats();
      
      return {
        success: true,
        version: 'v2-gramjs',
        testSession: testSession,
        realSessionExample: {
          sessionId: 'tg_user_1753876775514_dp6exf06o',
          phoneNumber: '+77476454491',
          status: 'Fully authenticated and tested',
          features: ['✅ Auth', '✅ Chats', '✅ Messages', '✅ Files']
        },
        message: 'Пример формата сессии GramJS V2'
      };
    } catch (error) {
      this.logger.error(`Failed to get session format: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message, version: 'v2-gramjs' },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Показать план миграции на базу данных
   * GET /api/v1/telegram-user-v2/test/migration-plan
   */
  @Get('test/migration-plan')
  async getMigrationPlan() {
    try {
      this.sessionTestService.showMigrationPlan();
      
      return {
        success: true,
        version: 'v2-gramjs',
        migrationPlan: {
          problem: 'Сессии теряются при перезапуске Docker контейнеров',
          solution: 'Использовать PostgreSQL для постоянного хранения',
          steps: [
            '✅ TelegramSessionEntity - создана',
            '✅ TelegramSessionRepository - создан', 
            '✅ TelegramServiceV2 - обновлен для БД',
            '✅ TypeORM - настроен в app.module.ts',
            '🔄 Установить пакеты: @nestjs/typeorm typeorm pg',
            '🔄 Протестировать сохранение/восстановление',
            '🔄 Проверить веб-интерфейс на localhost:3000'
          ]
        },
        dockerVolumes: {
          current: './notification-service/sessions:/app/sessions',
          needed: 'PostgreSQL database persistence'
        },
        message: 'План миграции сессий в PostgreSQL'
      };
    } catch (error) {
      this.logger.error(`Failed to get migration plan: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message, version: 'v2-gramjs' },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Показать статус текущих сессий и проблем
   * GET /api/v1/telegram-user-v2/test/session-status
   */
  @Get('test/session-status')
  async getSessionStatus() {
    try {
      const sessions = this.telegramServiceV2.getAllSessions();
      this.sessionTestService.showRealSessionExample();
      
      return {
        success: true,
        version: 'v2-gramjs',
        currentSessions: sessions.map(s => ({
          id: s.id,
          phoneNumber: s.phoneNumber,
          isAuthenticated: s.isAuthenticated,
          isConnected: s.isConnected,
          lastActivity: s.lastActivity
        })),
        problems: [
          'Сессии теряются при docker-compose restart',
          'Нет постоянного хранилища для sessionString',
          'Требуется миграция в PostgreSQL'
        ],
        fromConversation27: {
          workingSession: 'tg_user_1753876775514_dp6exf06o',
          testedFeatures: ['Auth', 'Chats (100)', 'Messages', 'Files'],
          status: 'Полностью протестирован, но теряется при перезапуске'
        },
        message: 'Статус текущих сессий V2'
      };
    } catch (error) {
      this.logger.error(`Failed to get session status: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message, version: 'v2-gramjs' },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Telegram Webhook endpoint для получения real-time обновлений
   * POST /api/v1/telegram-user-v2/webhook/:sessionId
   */
  @Post('webhook/:sessionId')
  async handleTelegramWebhook(
    @Param('sessionId') sessionId: string,
    @Body() update: any
  ) {
    try {
      this.logger.log(`🔗 Webhook received for session ${sessionId}:`, JSON.stringify(update, null, 2).substring(0, 200));
      
      // Передаем обновление в сервис для обработки
      await this.telegramServiceV2.handleWebhookUpdate(sessionId, update);
      
      return {
        success: true,
        message: 'Webhook processed successfully'
      };
    } catch (error) {
      this.logger.error(`Webhook processing failed for session ${sessionId}:`, error.message);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Настроить webhook для сессии
   * POST /api/v1/telegram-user-v2/:sessionId/setup-webhook
   */
  @Post(':sessionId/setup-webhook')
  async setupWebhook(
    @Param('sessionId') sessionId: string,
    @Body() dto: { webhookUrl: string }
  ) {
    try {
      this.logger.log(`🔧 Setting up webhook for session ${sessionId}: ${dto.webhookUrl}`);
      
      await this.telegramServiceV2.setupWebhook(sessionId, dto.webhookUrl);
      
      return {
        success: true,
        version: 'v2-gramjs',
        message: 'Webhook configured successfully',
        webhookUrl: dto.webhookUrl
      };
    } catch (error) {
      this.logger.error(`Failed to setup webhook for session ${sessionId}:`, error.message);
      throw new HttpException(
        { success: false, message: error.message, version: 'v2-gramjs' },
        HttpStatus.BAD_REQUEST
      );
    }
  }
}