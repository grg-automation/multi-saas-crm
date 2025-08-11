import { Controller, Post, Get, Delete, Body, Param, Logger, HttpException, HttpStatus, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TelegramUserService, TelegramUserSession, TelegramUserMessage } from './telegram-user.service';
import { TelegramPollingService } from './telegram-polling.service';
import { InitiateAuthDto, CompleteAuthDto, SendUserMessageDto } from './dto/telegram-user.dto';

/**
 * Controller для управления Telegram User API
 * Предоставляет endpoints для:
 * - Аутентификации пользователей Telegram
 * - Отправки сообщений от имени пользователя
 * - Управления активными сессиями
 */

@Controller('telegram-user')
export class TelegramUserController {
  private readonly logger = new Logger(TelegramUserController.name);

  constructor(
    private readonly telegramUserService: TelegramUserService,
    private readonly telegramPollingService: TelegramPollingService
  ) {}

  /**
   * Инициировать аутентификацию Telegram пользователя
   * POST /api/v1/telegram-user/auth/initiate
   */
  @Post('auth/initiate')
  async initiateAuth(@Body() dto: InitiateAuthDto) {
    try {
      this.logger.log(`Initiating auth for phone: ${dto.phoneNumber}`);
      
      const result = await this.telegramUserService.initiateAuth(dto.phoneNumber);
      
      return {
        success: true,
        sessionId: result.sessionId,
        codeSent: result.codeSent,
        message: 'Authentication code sent to your phone. Use /auth/complete to finish.'
      };
    } catch (error) {
      this.logger.error(`Failed to initiate auth: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Завершить аутентификацию с кодом подтверждения
   * POST /api/v1/telegram-user/auth/complete
   */
  @Post('auth/complete')
  async completeAuth(@Body() dto: CompleteAuthDto) {
    try {
      this.logger.log(`Completing auth for session: ${dto.sessionId}`);
      
      const session = await this.telegramUserService.completeAuth(
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
        message: 'Authentication completed successfully'
      };
    } catch (error) {
      this.logger.error(`Failed to complete auth: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Отправить сообщение от имени пользователя
   * POST /api/v1/telegram-user/send-message
   */
  @Post('send-message')
  async sendUserMessage(@Body() dto: SendUserMessageDto) {
    try {
      this.logger.log(`Sending user message via session: ${dto.sessionId}`);
      
      const message: TelegramUserMessage = {
        chatId: dto.chatId,
        message: dto.message,
        parseMode: dto.parseMode,
        replyToMessageId: dto.replyToMessageId
      };
      
      const result = await this.telegramUserService.sendUserMessage(dto.sessionId, message);
      
      return {
        success: true,
        messageId: result.messageId || result.message_id,
        sentAt: new Date().toISOString(),
        message: 'Message sent successfully'
      };
    } catch (error) {
      this.logger.error(`Failed to send user message: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Отправить сообщение автоматически выбрав активную сессию
   * POST /api/v1/telegram-user/send-message-auto
   */
  @Post('send-message-auto')
  async sendUserMessageAuto(@Body() dto: { chatId: string; message: string; parseMode?: 'HTML' | 'Markdown' }) {
    try {
      this.logger.log(`Auto-sending message to chat: ${dto.chatId}`);
      
      // Get first active session
      const sessions = this.telegramUserService.getAllSessions();
      const activeSession = sessions.find(s => s.isAuthenticated && s.isConnected);
      
      if (!activeSession) {
        throw new HttpException(
          { success: false, message: 'No active Telegram sessions available' },
          HttpStatus.BAD_REQUEST
        );
      }

      this.logger.log(`Using auto-selected session: ${activeSession.id}`);
      
      const message: TelegramUserMessage = {
        chatId: dto.chatId,
        message: dto.message,
        parseMode: dto.parseMode
      };
      
      const result = await this.telegramUserService.sendUserMessage(activeSession.id, message);
      
      return {
        success: true,
        messageId: result.messageId || result.message_id,
        sessionId: activeSession.id,
        sentAt: new Date().toISOString(),
        message: 'Message sent successfully via auto-selected session'
      };
    } catch (error) {
      this.logger.error(`Failed to send auto message: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Отправить файл от имени пользователя
   * POST /api/v1/telegram-user/send-file
   */
  @Post('send-file')
  @UseInterceptors(FileInterceptor('file'))
  async sendUserFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('sessionId') sessionId: string,
    @Body('chatId') chatId: string,
    @Body('caption') caption?: string
  ) {
    try {
      this.logger.log(`Sending file via session: ${sessionId} to chat: ${chatId}`);
      
      if (!file) {
        throw new HttpException(
          { success: false, message: 'No file provided' },
          HttpStatus.BAD_REQUEST
        );
      }
      
      const result = await this.telegramUserService.sendUserFile(
        sessionId,
        chatId,
        file,
        caption
      );
      
      return {
        success: true,
        messageId: result.messageId || result.message_id,
        fileName: file.originalname,
        fileSize: file.size,
        sentAt: new Date().toISOString(),
        message: 'File sent successfully'
      };
    } catch (error) {
      this.logger.error(`Failed to send file: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Получить список чатов пользователя
   * GET /api/v1/telegram-user/:sessionId/chats
   */
  @Get(':sessionId/chats')
  async getUserChats(@Param('sessionId') sessionId: string) {
    try {
      this.logger.log(`Getting chats for session: ${sessionId}`);
      
      const chats = await this.telegramUserService.getUserChats(sessionId);
      
      // Автоматически запускаем polling для получения входящих сообщений
      try {
        await this.telegramPollingService.startPolling(sessionId);
        this.logger.log(`Auto-started polling for session: ${sessionId}`);
      } catch (pollingError) {
        this.logger.warn(`Failed to start polling for session ${sessionId}: ${pollingError.message}`);
      }
      
      return {
        success: true,
        chats,
        count: chats.length
      };
    } catch (error) {
      this.logger.error(`Failed to get user chats: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Получить историю сообщений для чата
   * GET /api/v1/telegram-user/:sessionId/chats/:chatId/history
   */
  @Get(':sessionId/chats/:chatId/history')
  async getChatHistory(
    @Param('sessionId') sessionId: string,
    @Param('chatId') chatId: string
  ) {
    try {
      this.logger.log(`Getting chat history for session: ${sessionId}, chat: ${chatId}`);
      
      const messages = await this.telegramUserService.getChatHistory(sessionId, chatId);
      
      return {
        success: true,
        messages,
        count: messages.length
      };
    } catch (error) {
      this.logger.error(`Failed to get chat history: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Начать прослушивание сообщений для сессии
   * POST /api/v1/telegram-user/:sessionId/start-listening
   */
  @Post(':sessionId/start-listening')
  async startListening(@Param('sessionId') sessionId: string) {
    try {
      this.logger.log(`Starting to listen for session: ${sessionId}`);
      
      // Запускаем MTProto listener (старый метод)
      await this.telegramUserService.startListening(sessionId);
      
      // Запускаем новый поллинг механизм для real-time
      await this.telegramPollingService.startPolling(sessionId);
      
      return {
        success: true,
        message: 'Started listening for incoming messages with polling'
      };
    } catch (error) {
      this.logger.error(`Failed to start listening: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Получить информацию о сессии
   * GET /api/v1/telegram-user/session/:sessionId
   */
  @Get('session/:sessionId')
  async getSession(@Param('sessionId') sessionId: string) {
    try {
      const session = this.telegramUserService.getSession(sessionId);
      
      if (!session) {
        throw new HttpException(
          { success: false, message: 'Session not found' },
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
        }
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      this.logger.error(`Failed to get session: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Получить все активные сессии
   * GET /api/v1/telegram-user/sessions
   */
  @Get('sessions')
  async getAllSessions() {
    try {
      const sessions = this.telegramUserService.getAllSessions();
      
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
        count: sessions.length
      };
    } catch (error) {
      this.logger.error(`Failed to get all sessions: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Отключить сессию
   * DELETE /api/v1/telegram-user/session/:sessionId
   */
  @Delete('session/:sessionId')
  async disconnectSession(@Param('sessionId') sessionId: string) {
    try {
      this.logger.log(`Disconnecting session: ${sessionId}`);
      
      await this.telegramUserService.disconnectSession(sessionId);
      
      return {
        success: true,
        message: 'Session disconnected successfully'
      };
    } catch (error) {
      this.logger.error(`Failed to disconnect session: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Health check для Telegram User API
   * GET /api/v1/telegram-user/health
   */
  @Get('health')
  async healthCheck() {
    try {
      const sessions = this.telegramUserService.getAllSessions();
      const activeSessions = sessions.filter(s => s.isConnected).length;
      const authenticatedSessions = sessions.filter(s => s.isAuthenticated).length;
      
      return {
        success: true,
        service: 'Telegram User API',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        stats: {
          totalSessions: sessions.length,
          activeSessions,
          authenticatedSessions
        }
      };
    } catch (error) {
      this.logger.error(`Health check failed: ${error.message}`);
      throw new HttpException(
        { success: false, message: 'Service unhealthy' },
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
  }

  /**
   * Тест endpoint для DEV режима
   * POST /api/v1/telegram-user/test/mock-message
   */
  @Post('test/mock-message')
  async testMockMessage(@Body() dto: { phoneNumber: string; message: string; chatId: string }) {
    try {
      if (process.env.NODE_ENV !== 'development') {
        throw new HttpException(
          { success: false, message: 'Test endpoints only available in development' },
          HttpStatus.FORBIDDEN
        );
      }

      this.logger.log(`DEV TEST: Mock message from ${dto.phoneNumber} to chat ${dto.chatId}`);
      
      return {
        success: true,
        message: 'Mock message processed',
        data: {
          from: dto.phoneNumber,
          to: dto.chatId,
          content: dto.message,
          timestamp: new Date().toISOString(),
          mode: 'development_test'
        }
      };
    } catch (error) {
      this.logger.error(`Test mock message failed: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Тест казахстанского номера
   * POST /api/v1/telegram-user/test/kazakhstan-number
   */
  @Post('test/kazakhstan-number')
  async testKazakhstanNumber(@Body() dto: { phoneNumber: string }) {
    try {
      if (process.env.NODE_ENV !== 'development') {
        throw new HttpException(
          { success: false, message: 'Test endpoints only available in development' },
          HttpStatus.FORBIDDEN
        );
      }

      this.logger.log(`Testing Kazakhstan number: ${dto.phoneNumber}`);
      
      const result = await this.telegramUserService.testKazakhstanNumber(dto.phoneNumber);
      
      return result;
    } catch (error) {
      this.logger.error(`Kazakhstan number test failed: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Получить debug информацию MTProto
   * GET /api/v1/telegram-user/debug/mtproto
   */
  @Get('debug/mtproto')
  async getMTProtoDebugInfo() {
    try {
      if (process.env.NODE_ENV !== 'development') {
        throw new HttpException(
          { success: false, message: 'Debug endpoints only available in development' },
          HttpStatus.FORBIDDEN
        );
      }

      const debugInfo = await this.telegramUserService.getMTProtoDebugInfo();
      
      return {
        success: true,
        debugInfo,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error(`Failed to get MTProto debug info: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Остановить поллинг для сессии
   * POST /api/v1/telegram-user/:sessionId/stop-polling
   */
  @Post(':sessionId/stop-polling')
  async stopPolling(@Param('sessionId') sessionId: string) {
    try {
      this.logger.log(`Stopping polling for session: ${sessionId}`);
      
      this.telegramPollingService.stopPolling(sessionId);
      
      return {
        success: true,
        message: 'Polling stopped'
      };
    } catch (error) {
      this.logger.error(`Failed to stop polling: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Получить статус поллинга
   * GET /api/v1/telegram-user/polling-status
   */
  @Get('polling-status')
  async getPollingStatus() {
    try {
      const status = this.telegramPollingService.getPollingStatus();
      
      return {
        success: true,
        status
      };
    } catch (error) {
      this.logger.error(`Failed to get polling status: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Скачать файл из Telegram сообщения
   * GET /api/v1/telegram-user/:sessionId/download/:chatId/:messageId
   */
  @Get(':sessionId/download/:chatId/:messageId')
  async downloadFile(
    @Param('sessionId') sessionId: string,
    @Param('chatId') chatId: string,
    @Param('messageId') messageId: string
  ) {
    try {
      this.logger.log(`Downloading file from message ${messageId} in chat ${chatId} via session: ${sessionId}`);
      
      const fileBuffer = await this.telegramUserService.downloadFile(sessionId, chatId, messageId);
      
      return {
        success: true,
        data: fileBuffer.toString('base64'),
        contentType: fileBuffer.contentType || 'application/octet-stream',
        fileName: fileBuffer.fileName || `file_${messageId}`,
        fileSize: fileBuffer.length,
        message: 'File downloaded successfully'
      };
    } catch (error) {
      this.logger.error(`Failed to download file: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Очистить кеш peer'ов для устранения проблем PEER_ID_INVALID
   * POST /api/v1/telegram-user/:sessionId/clear-peer-cache
   */
  @Post(':sessionId/clear-peer-cache')
  async clearPeerCache(@Param('sessionId') sessionId: string) {
    try {
      this.logger.log(`Clearing peer cache for session: ${sessionId}`);
      
      await this.telegramUserService.clearPeerCache(sessionId);
      
      return {
        success: true,
        message: 'Peer cache cleared successfully'
      };
    } catch (error) {
      this.logger.error(`Failed to clear peer cache: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST
      );
    }
  }
}