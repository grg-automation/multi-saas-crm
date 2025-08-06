import { Injectable } from '@nestjs/common';
import { MessageDirection, MessageType } from '../../types/message.types';
import { MessageEntity } from '../entities/message.entity';

@Injectable()
export class WhatsAppMessageAdapter {
  whatsAppToMessage(
    message: any,
    tenantId: string | null,
    threadId: string,
  ): MessageEntity {
    const entity = new MessageEntity();
    entity.tenantId = tenantId || null;
    entity.threadId = threadId;
    entity.direction = MessageDirection.INBOUND;
    entity.externalId = message.id;
    entity.platformMessageId = message.id;
    entity.platformThreadId = message.from;
    entity.content = message.text?.body || '';
    entity.messageType = message.document
      ? MessageType.DOCUMENT
      : MessageType.TEXT;
    entity.sentAt = new Date(parseInt(message.timestamp) * 1000);
    entity.attachments = message.document
      ? JSON.stringify({
          id: message.document.id,
          mime_type: message.document.mime_type,
          file_name: message.document.filename,
        })
      : null;
    return entity;
  }
}
