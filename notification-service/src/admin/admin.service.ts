import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

/**
 * Admin Service для notification-service
 * Проксирует запросы к Kotlin CRM сервису
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private readonly crmServiceUrl = 'http://core-crm:8080'; // Docker internal URL

  /**
   * Назначить чат менеджеру через прямой вызов Kotlin CRM API
   */
  async assignChatToManager(threadId: string, managerId: string): Promise<any> {
    try {
      this.logger.log(`Proxying chat assignment to CRM service: ${threadId} -> ${managerId}`);
      
      // Получаем токен админа для вызова CRM API
      const adminToken = await this.getAdminToken();
      
      // Вызываем Kotlin CRM API напрямую
      const response = await axios.post(
        `${this.crmServiceUrl}/api/v1/admin/assign-chat`,
        {
          threadId,
          managerId
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
          },
          timeout: 10000 // 10 секунд таймаут
        }
      );
      
      this.logger.log(`CRM API response: ${JSON.stringify(response.data)}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to call CRM API: ${error.message}`);
      if (error.response) {
        this.logger.error(`CRM API error: ${JSON.stringify(error.response.data)}`);
        throw new Error(`CRM API error: ${error.response.data.message || error.message}`);
      }
      throw new Error(`Failed to assign chat: ${error.message}`);
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