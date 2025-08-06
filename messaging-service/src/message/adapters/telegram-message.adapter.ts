import { Injectable } from '@nestjs/common';
import { MessageDirection, MessageType } from '../../types/message.types';
import { MessageEntity } from '../entities/message.entity';

@Injectable()
export class TelegramMessageAdapter {
  telegramToMessage(
    message: any,
    tenantId: string | null,
    threadId: string,
  ): MessageEntity {
    const entity = new MessageEntity();
    entity.tenantId = tenantId || null;
    entity.threadId = threadId;
    entity.direction = MessageDirection.INBOUND;
    entity.externalId = message.message_id.toString();
    entity.platformMessageId = message.message_id.toString();
    entity.platformThreadId = message.chat.id.toString();
    entity.content = message.text || '';
    entity.messageType = message.document
      ? MessageType.DOCUMENT
      : MessageType.TEXT;
    entity.sentAt = new Date(message.date * 1000);
    entity.attachments = message.document
      ? JSON.stringify({
          file_id: message.document.file_id,
          mime_type: message.document.mime_type,
          file_name: message.document.file_name,
        })
      : null;
    return entity;
  }
}
