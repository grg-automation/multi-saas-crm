import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  constructor(private configService: ConfigService) {}

  getHealth() {
    // Check MTProto configuration
    const mtprotoEnabled = this.configService.get('TELEGRAM_MTPROTO_ENABLED') === 'true';
    const forceRealMode = this.configService.get('TELEGRAM_FORCE_REAL_MODE') === 'true';
    const apiId = this.configService.get('TELEGRAM_API_ID');
    const apiHash = this.configService.get('TELEGRAM_API_HASH');
    
    const telegramStatus = (mtprotoEnabled || forceRealMode) && apiId && apiHash ? 
      'MTProto enabled' : 'stub mode';

    return {
      status: 'healthy',
      service: 'notification-service',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
        total:
          Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB',
      },
      channels: {
        email: 'stub mode',
        sms: 'stub mode',
        telegram: telegramStatus,
        whatsapp: 'stub mode',
        push: 'stub mode',
      },
    };
  }

  getRoot() {
    return {
      service: 'notification-service',
      version: '1.0.0',
      status: 'running',
      description: 'Multi-channel Notification Service for Multi-SaaS Platform',
      mode: 'STUB MODE - All channels are simulated',
      endpoints: {
        health: '/api/v1/health',
        notifications: '/api/v1/notifications',
        channels: '/api/v1/notifications/channels',
      },
      channels: ['email', 'sms', 'telegram', 'whatsapp', 'push'],
      features: [
        'Multi-channel notifications (STUB)',
        'Template support (STUB)',
        'Delivery simulation',
        'Error handling',
        'Status tracking',
      ],
      unifiedApi: {
        endpoint: 'POST /api/v1/notifications/send',
        example: {
          to: 'user@example.com',
          channels: ['email', 'telegram', 'sms'],
          template: 'opportunity_created',
          data: { opportunityName: 'Big Deal' },
        },
      },
    };
  }
}
