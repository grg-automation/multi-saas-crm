import { Module } from '@nestjs/common';
import { MessageModule } from '../message/message.module';
import { TelegramWebhookController } from './controllers/telegram-webhook.controller';
import { WhatsAppWebhookController } from './controllers/whatsapp-webhook.controller';
import { KworkWebhookController } from './controllers/kwork-webhook.controller';

@Module({
  imports: [MessageModule],
  controllers: [TelegramWebhookController, WhatsAppWebhookController, KworkWebhookController],
})
export class WebhookModule {}
