// src/message/message.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChannelModule } from '../channel/channel.module';
import { ThreadModule } from '../thread/thread.module';
import { WebSocketModule } from '../websoket/websoket.module';
import { TelegramMessageAdapter } from './adapters/telegram-message.adapter';
import { WhatsAppMessageAdapter } from './adapters/whatsapp-message.adapter';
import { MessageEntity } from './entities/message.entity';
import { MessageRepository } from './message.repository';
import { MessageService } from './message.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([MessageEntity]),
    forwardRef(() => ChannelModule), // Import ChannelModule for ChannelService
    forwardRef(() => ThreadModule), // For ThreadService
    WebSocketModule, // For MessagingWebSocketGateway
  ],
  controllers: [
    // MessageController,
  ],
  providers: [
    MessageService,
    MessageRepository,
    TelegramMessageAdapter,
    WhatsAppMessageAdapter,
  ],
  exports: [MessageService, MessageRepository],
})
export class MessageModule {}
