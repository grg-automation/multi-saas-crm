import { Controller, Get, Post, Body, Param, Logger, HttpException, HttpStatus, Query, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ManagerService } from './manager.service';

/**
 * Controller для менеджерских функций
 * Предоставляет анонимизированные API для менеджеров
 */
@Controller('manager')
export class ManagerController {
  private readonly logger = new Logger(ManagerController.name);

  constructor(private readonly managerService: ManagerService) {}

  /**
   * Получить ID назначенных чатов менеджера
   * GET /api/v1/manager/assigned-thread-ids?managerId=...
   */
  @Get('assigned-thread-ids')
  async getAssignedThreadIds(@Query('managerId') managerId: string) {
    try {
      this.logger.log(`Getting assigned thread IDs for manager: ${managerId}`);
      
      if (!managerId) {
        return { success: false, error: 'managerId is required' };
      }
      
      const threadIds = await this.managerService.getAssignedThreadIds(managerId);
      
      return {
        success: true,
        data: threadIds
      };
    } catch (error) {
      this.logger.error(`Failed to get assigned thread IDs: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Получить список назначенных чатов для менеджера
   * GET /api/v1/manager/chats
   */
  @Get('chats')
  async getAssignedChats(@Query('managerId') managerId?: string) {
    try {
      this.logger.log(`Getting assigned chats for manager: ${managerId}`);
      
      if (!managerId) {
        throw new Error('Manager ID is required');
      }
      
      const result = await this.managerService.getAssignedChats(managerId);
      
      return {
        success: true,
        data: result
      };
    } catch (error) {
      this.logger.error(`Failed to get assigned chats: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Получить анонимизированную информацию о чате для менеджера
   * GET /api/v1/manager/chat/:threadId
   */
  @Get('chat/:threadId')
  async getChatInfo(@Param('threadId') threadId: string) {
    try {
      this.logger.log(`Getting chat info for thread: ${threadId}`);
      
      // Извлекаем реальный chat ID из thread ID (убираем префикс)
      const chatId = threadId.replace('telegram_thread_', '');
      
      const result = await this.managerService.getAnonymizedChatInfo(chatId);
      
      return {
        success: true,
        data: result
      };
    } catch (error) {
      this.logger.error(`Failed to get chat info: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Получить анонимизированную историю сообщений для менеджера
   * GET /api/v1/manager/chat/:threadId/messages
   */
  @Get('chat/:threadId/messages')
  async getChatMessages(
    @Param('threadId') threadId: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number
  ) {
    try {
      this.logger.log(`Getting messages for thread: ${threadId}`);
      
      // Извлекаем реальный chat ID из thread ID
      const chatId = threadId.replace('telegram_thread_', '');
      
      const result = await this.managerService.getAnonymizedChatMessages(
        chatId, 
        limit || 50, 
        offset || 0
      );
      
      return {
        success: true,
        data: result
      };
    } catch (error) {
      this.logger.error(`Failed to get chat messages: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Отправить сообщение от имени менеджера
   * POST /api/v1/manager/chat/:threadId/send
   */
  @Post('chat/:threadId/send')
  async sendMessage(
    @Param('threadId') threadId: string,
    @Body() dto: {
      content: string;
      messageType?: 'text' | 'image' | 'file';
      managerId?: string;
    }
  ) {
    try {
      this.logger.log(`Manager sending message to thread: ${threadId}`);
      
      // Извлекаем реальный chat ID из thread ID
      const chatId = threadId.replace('telegram_thread_', '');
      
      const result = await this.managerService.sendMessageAsManager(
        chatId,
        dto.content,
        dto.messageType || 'text',
        dto.managerId
      );
      
      return {
        success: true,
        data: result
      };
    } catch (error) {
      this.logger.error(`Failed to send message: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Получить статистику чатов для менеджера
   * GET /api/v1/manager/stats
   */
  @Get('stats')
  async getManagerStats(@Query('managerId') managerId?: string) {
    try {
      this.logger.log(`Getting manager stats for: ${managerId}`);
      
      const result = await this.managerService.getManagerStats(managerId);
      
      return {
        success: true,
        data: result
      };
    } catch (error) {
      this.logger.error(`Failed to get manager stats: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Отправить файл от имени менеджера
   * POST /api/v1/manager/chat/:threadId/send-file
   */
  @Post('chat/:threadId/send-file')
  @UseInterceptors(FileInterceptor('file'))
  async sendFile(
    @Param('threadId') threadId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('managerId') managerId?: string
  ) {
    try {
      this.logger.log(`Manager sending file to thread: ${threadId}, filename: ${file?.originalname}`);
      
      // Извлекаем реальный chat ID из thread ID
      const chatId = threadId.replace('telegram_thread_', '');
      
      const result = await this.managerService.sendFileAsManager(
        chatId,
        file,
        managerId
      );
      
      return {
        success: true,
        data: result
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
   * Health check для менеджерского API
   * GET /api/v1/manager/health
   */
  @Get('health')
  async getHealth() {
    return {
      status: 'healthy',
      service: 'manager-api',
      timestamp: new Date().toISOString(),
      features: {
        chat_info: true,
        chat_messages: true,
        send_message: true,
        send_file: true,
        anonymization: true,
        real_time_updates: true
      }
    };
  }

  /**
   * Получить список всех менеджеров (для админки)
   * GET /api/v1/manager/list
   */
  @Get('list')
  async getManagersList() {
    try {
      this.logger.log('Getting list of all managers');
      
      const managers = await this.managerService.getAllManagers();
      
      return {
        success: true,
        data: managers
      };
    } catch (error) {
      this.logger.error(`Failed to get managers list: ${error.message}`);
      return {
        success: false,
        error: error.message,
        data: []
      };
    }
  }

  /**
   * Назначить чат менеджеру (админская функция)
   * POST /api/v1/manager/assign-chat  
   */
  @Post('assign-chat')
  async assignChat(@Body() dto: { threadId: string; managerId: string }) {
    try {
      this.logger.log(`Admin assigning chat ${dto.threadId} to manager ${dto.managerId}`);
      
      if (!dto.threadId || !dto.managerId) {
        throw new Error('threadId and managerId are required');
      }
      
      const result = await this.managerService.assignChatToManager(dto.threadId, dto.managerId);
      
      return {
        success: true,
        message: 'Chat assigned successfully',
        data: result
      };
    } catch (error) {
      this.logger.error(`Failed to assign chat: ${error.message}`);
      return {
        success: false,
        message: error.message,
        assignmentId: null
      };
    }
  }
}