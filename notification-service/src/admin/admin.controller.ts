import { Controller, Post, Body, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { AdminService } from './admin.service';

/**
 * Admin Controller для notification-service
 * Проксирует запросы к Kotlin CRM сервису
 */
@Controller('admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(private readonly adminService: AdminService) {}

  /**
   * Назначить чат менеджеру (проксирует к Kotlin CRM API)
   * POST /api/v1/admin/assign-chat
   */
  @Post('assign-chat')
  async assignChat(@Body() dto: { threadId: string; managerId: string }) {
    try {
      this.logger.log(`Admin assigning chat ${dto.threadId} to manager ${dto.managerId}`);
      
      if (!dto.threadId || !dto.managerId) {
        throw new Error('threadId and managerId are required');
      }
      
      const result = await this.adminService.assignChatToManager(dto.threadId, dto.managerId);
      
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