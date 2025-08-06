import { Body, Controller, Logger, Param, Post } from '@nestjs/common';
import { MessageService } from '../../message/message.service';

@Controller('webhooks/telegram')
export class TelegramWebhookController {
  private readonly logger = new Logger(TelegramWebhookController.name);

  constructor(private readonly messageService: MessageService) {}

  @Post(':botToken')
  async handleTelegramWebhook(
    @Param('botToken') botToken: string,
    @Body() update: any,
  ) {
    this.logger.log(`Received Telegram webhook for bot ${botToken}`);
    if (update.message) {
      try {
        // Pass null for tenantId; API gateway will handle later
        await this.messageService.processTelegramMessage(update.message, null);
        return { status: 'OK' };
      } catch (error) {
        this.logger.error(`Telegram processing failed: ${error.message}`);
        return { status: 'ERROR', message: 'Processing failed' };
      }
    }
    return { status: 'OK' };
  }
}
