import { Controller, Post, Body, Logger, Get, Param, Put, Query } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { 
  TelegramWebhookDto, 
  WhatsAppWebhookDto, 
  SendMessageDto,
  MessageDeliveryStatusDto,
  ChannelConfigDto,
  MessageProcessingResult
} from './dto/messaging.dto';

@Controller('messaging')
export class MessagingController {
  private readonly logger = new Logger(MessagingController.name);

  constructor(private readonly messagingService: MessagingService) {}

  // === TELEGRAM WEBHOOK ===
  
  @Post('telegram/webhook')
  async handleTelegramWebhook(@Body() payload: TelegramWebhookDto) {
    this.logger.log(`📱 [TELEGRAM WEBHOOK] Received update: ${JSON.stringify(payload)}`);
    
    try {
      if (payload.message) {
        const result = await this.messagingService.processTelegramMessage(payload.message);
        this.logger.log(`📱 [TELEGRAM WEBHOOK] Message processed: ${result.success}`);
        return { status: 'ok', processed: result.success };
      }

      // Handle other update types (edited_message, callback_query, etc.)
      this.logger.log(`📱 [TELEGRAM WEBHOOK] Unhandled update type`);
      return { status: 'ok', processed: false };
    } catch (error) {
      this.logger.error(`📱 [TELEGRAM WEBHOOK] Error processing webhook:`, error.message);
      throw error;
    }
  }

  // === WHATSAPP WEBHOOK ===

  @Get('whatsapp/webhook')
  async verifyWhatsAppWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.challenge') challenge: string,
    @Query('hub.verify_token') verifyToken: string
  ) {
    this.logger.log(`💬 [WHATSAPP WEBHOOK] Verification request: mode=${mode}, token=${verifyToken}`);
    
    const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN || 'crm_verify_token_123';
    
    if (mode === 'subscribe' && verifyToken === expectedToken) {
      this.logger.log(`💬 [WHATSAPP WEBHOOK] Verification successful`);
      return parseInt(challenge);
    } else {
      this.logger.error(`💬 [WHATSAPP WEBHOOK] Verification failed`);
      throw new Error('Verification failed');
    }
  }

  @Post('whatsapp/webhook')
  async handleWhatsAppWebhook(@Body() payload: WhatsAppWebhookDto) {
    this.logger.log(`💬 [WHATSAPP WEBHOOK] Received payload: ${JSON.stringify(payload)}`);
    
    try {
      if (payload.entry && payload.entry.length > 0) {
        const results: MessageProcessingResult[] = [];
        
        for (const entry of payload.entry) {
          if (entry.changes) {
            for (const change of entry.changes) {
              if (change.value?.messages) {
                for (const message of change.value.messages) {
                  const result = await this.messagingService.processWhatsAppMessage(message, change.value);
                  results.push(result);
                }
              }

              // Handle message status updates
              if (change.value?.statuses) {
                for (const status of change.value.statuses) {
                  await this.messagingService.processWhatsAppStatus(status);
                }
              }
            }
          }
        }
        
        const processedCount = results.filter(r => r.success).length;
        this.logger.log(`💬 [WHATSAPP WEBHOOK] Processed ${processedCount}/${results.length} messages`);
        
        return { status: 'ok', processed: processedCount };
      }
      
      return { status: 'ok', processed: 0 };
    } catch (error) {
      this.logger.error(`💬 [WHATSAPP WEBHOOK] Error processing webhook:`, error.message);
      throw error;
    }
  }

  // === MESSAGE SENDING ===

  @Post('send')
  async sendMessage(@Body() dto: SendMessageDto) {
    this.logger.log(`📤 [SEND MESSAGE] Channel: ${dto.channelType}, To: ${dto.to}`);
    
    try {
      const result = await this.messagingService.sendMessage(dto);
      
      if (result.success) {
        this.logger.log(`📤 [SEND MESSAGE] Sent successfully: ${result.externalId}`);
      } else {
        this.logger.error(`📤 [SEND MESSAGE] Failed: ${result.error}`);
      }
      
      return result;
    } catch (error) {
      this.logger.error(`📤 [SEND MESSAGE] Error:`, error.message);
      throw error;
    }
  }

  // === MESSAGE STATUS UPDATES ===

  @Put('messages/:messageId/status')
  async updateMessageStatus(
    @Param('messageId') messageId: string,
    @Body() dto: MessageDeliveryStatusDto
  ) {
    this.logger.log(`📊 [MESSAGE STATUS] Updating ${messageId}: ${dto.status}`);
    
    try {
      await this.messagingService.updateMessageDeliveryStatus(messageId, dto);
      return { success: true, message: 'Status updated' };
    } catch (error) {
      this.logger.error(`📊 [MESSAGE STATUS] Error:`, error.message);
      throw error;
    }
  }

  // === CHANNEL MANAGEMENT ===

  @Post('channels/telegram/auth')
  async authenticateTelegramChannel(@Body() dto: ChannelConfigDto) {
    this.logger.log(`🔐 [TELEGRAM AUTH] Authenticating channel for manager: ${dto.managerId}`);
    
    try {
      const result = await this.messagingService.authenticateTelegramChannel(dto);
      return result;
    } catch (error) {
      this.logger.error(`🔐 [TELEGRAM AUTH] Error:`, error.message);
      throw error;
    }
  }

  @Post('channels/whatsapp/setup')
  async setupWhatsAppChannel(@Body() dto: ChannelConfigDto) {
    this.logger.log(`🔐 [WHATSAPP SETUP] Setting up channel for manager: ${dto.managerId}`);
    
    try {
      const result = await this.messagingService.setupWhatsAppChannel(dto);
      return result;
    } catch (error) {
      this.logger.error(`🔐 [WHATSAPP SETUP] Error:`, error.message);
      throw error;
    }
  }

  // === HEALTH CHECK ===

  @Get('health')
  async getHealth() {
    return {
      status: 'healthy',
      service: 'messaging-hub',
      timestamp: new Date().toISOString(),
      features: {
        telegram_webhook: true,
        whatsapp_webhook: true,
        message_sending: true,
        status_tracking: true
      },
      endpoints: {
        telegram_webhook: '/messaging/telegram/webhook',
        whatsapp_webhook: '/messaging/whatsapp/webhook',
        whatsapp_verify: '/messaging/whatsapp/webhook (GET)',
        send_message: '/messaging/send',
        update_status: '/messaging/messages/:id/status',
        telegram_auth: '/messaging/channels/telegram/auth',
        whatsapp_setup: '/messaging/channels/whatsapp/setup'
      }
    };
  }

  // === TESTING ENDPOINTS (DEV ONLY) ===

  @Post('test/telegram-message')
  async testTelegramMessage(@Body() testData: any) {
    if (process.env.NODE_ENV !== 'development') {
      throw new Error('Test endpoints only available in development');
    }
    
    this.logger.log(`🧪 [TEST] Simulating Telegram message`);
    return await this.handleTelegramWebhook(testData);
  }

  @Post('test/whatsapp-message')
  async testWhatsAppMessage(@Body() testData: any) {
    if (process.env.NODE_ENV !== 'development') {
      throw new Error('Test endpoints only available in development');
    }
    
    this.logger.log(`🧪 [TEST] Simulating WhatsApp message`);
    return await this.handleWhatsAppWebhook(testData);
  }

  @Get('test/generate-webhook-url')
  async generateWebhookUrl() {
    if (process.env.NODE_ENV !== 'development') {
      throw new Error('Test endpoints only available in development');
    }
    
    const baseUrl = process.env.WEBHOOK_BASE_URL || 'https://your-domain.com';
    
    return {
      telegram: `${baseUrl}/api/v1/messaging/telegram/webhook`,
      whatsapp: `${baseUrl}/api/v1/messaging/whatsapp/webhook`,
      instructions: {
        telegram: 'Set this URL in your Telegram Bot settings',
        whatsapp: 'Use this URL when configuring WhatsApp Business API webhook'
      }
    };
  }
}