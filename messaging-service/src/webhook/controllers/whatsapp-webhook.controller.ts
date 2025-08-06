import { Body, Controller, Get, Logger, Post, Query } from '@nestjs/common';
import { MessageService } from '../../message/message.service';

@Controller('webhooks/whatsapp')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(private readonly messageService: MessageService) {}

  @Get()
  async verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.challenge') challenge: string,
    @Query('hub.verify_token') verifyToken: string,
  ) {
    const expectedToken =
      process.env.WHATSAPP_VERIFY_TOKEN || 'crm_verify_token_123';
    if (mode === 'subscribe' && verifyToken === expectedToken) {
      this.logger.log('WhatsApp webhook verified');
      return parseInt(challenge);
    }
    throw new Error('Webhook verification failed');
  }

  @Post()
  async handleWebhook(@Body() webhook: any) {
    this.logger.log('Received WhatsApp webhook');
    try {
      // Pass null for tenantId
      await this.messageService.processWhatsAppMessage(webhook, null);
      return { status: 'OK' };
    } catch (error) {
      this.logger.error(`WhatsApp processing failed: ${error.message}`);
      return { status: 'ERROR', message: 'Processing failed' };
    }
  }
}
