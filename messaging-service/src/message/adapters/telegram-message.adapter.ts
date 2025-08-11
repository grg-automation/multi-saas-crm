import { Injectable } from '@nestjs/common';
import { MessageDirection, MessageType } from '../../types/message.types';
import { MessageEntity } from '../entities/message.entity';

export interface CrmActivityData {
  activityType: 'telegram_message' | 'telegram_call' | 'telegram_file';
  contactId?: string;
  accountId?: string;
  subject: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'completed' | 'in_progress' | 'scheduled';
  metadata: Record<string, any>;
}

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
    
    // Enhanced content handling
    entity.content = this.extractMessageContent(message);
    entity.messageType = this.determineMessageType(message);
    entity.sentAt = new Date(message.date * 1000);
    
    // Enhanced sender information
    entity.senderId = message.from?.id?.toString() || null;
    entity.senderName = this.extractSenderName(message.from);
    
    // Enhanced attachments and media handling
    entity.attachments = this.extractAttachments(message);
    if (message.document || message.photo || message.video || message.audio) {
      const mediaInfo = this.extractMediaInfo(message);
      entity.fileName = mediaInfo.fileName;
      entity.fileSize = mediaInfo.fileSize;
      entity.mimeType = mediaInfo.mimeType;
    }
    
    // Enhanced metadata for CRM integration
    entity.metadata = JSON.stringify({
      telegram_chat_type: message.chat?.type,
      telegram_chat_title: message.chat?.title,
      telegram_from_username: message.from?.username,
      telegram_from_is_bot: message.from?.is_bot,
      telegram_reply_to_message_id: message.reply_to_message?.message_id,
      telegram_forward_from: message.forward_from?.id,
      has_entities: message.entities && message.entities.length > 0,
      entities: message.entities?.map((e: any) => ({ type: e.type, offset: e.offset, length: e.length })),
    });
    
    return entity;
  }

  private extractMessageContent(message: any): string {
    if (message.text) return message.text;
    if (message.caption) return message.caption;
    if (message.document) return `[Document: ${message.document.file_name || 'Unknown'}]`;
    if (message.photo) return '[Photo]';
    if (message.video) return '[Video]';
    if (message.audio) return '[Audio]';
    if (message.voice) return '[Voice Message]';
    if (message.sticker) return `[Sticker: ${message.sticker.emoji || ''}]`;
    if (message.location) return `[Location: ${message.location.latitude}, ${message.location.longitude}]`;
    if (message.contact) return `[Contact: ${message.contact.first_name} ${message.contact.last_name || ''}]`;
    return '[Unsupported Message Type]';
  }

  private determineMessageType(message: any): MessageType {
    if (message.document) return MessageType.DOCUMENT;
    if (message.photo) return MessageType.IMAGE;
    if (message.video) return MessageType.VIDEO;
    if (message.audio || message.voice) return MessageType.AUDIO;
    if (message.sticker) return MessageType.STICKER;
    if (message.location) return MessageType.LOCATION;
    if (message.contact) return MessageType.CONTACT;
    return MessageType.TEXT;
  }

  private extractSenderName(from: any): string | null {
    if (!from) return null;
    
    const parts: string[] = [];
    if (from.first_name) parts.push(from.first_name);
    if (from.last_name) parts.push(from.last_name);
    if (parts.length === 0 && from.username) parts.push(`@${from.username}`);
    
    return parts.length > 0 ? parts.join(' ') : null;
  }

  private extractAttachments(message: any): string | null {
    const attachments: any[] = [];
    
    if (message.document) {
      attachments.push({
        type: 'document',
        file_id: message.document.file_id,
        mime_type: message.document.mime_type,
        file_name: message.document.file_name,
        file_size: message.document.file_size,
      });
    }
    
    if (message.photo) {
      const largestPhoto = message.photo[message.photo.length - 1];
      attachments.push({
        type: 'photo',
        file_id: largestPhoto.file_id,
        width: largestPhoto.width,
        height: largestPhoto.height,
        file_size: largestPhoto.file_size,
      });
    }
    
    if (message.video) {
      attachments.push({
        type: 'video',
        file_id: message.video.file_id,
        width: message.video.width,
        height: message.video.height,
        duration: message.video.duration,
        file_size: message.video.file_size,
        mime_type: message.video.mime_type,
      });
    }
    
    if (message.audio) {
      attachments.push({
        type: 'audio',
        file_id: message.audio.file_id,
        duration: message.audio.duration,
        file_size: message.audio.file_size,
        mime_type: message.audio.mime_type,
        title: message.audio.title,
        performer: message.audio.performer,
      });
    }
    
    if (message.voice) {
      attachments.push({
        type: 'voice',
        file_id: message.voice.file_id,
        duration: message.voice.duration,
        file_size: message.voice.file_size,
        mime_type: message.voice.mime_type,
      });
    }
    
    return attachments.length > 0 ? JSON.stringify(attachments) : null;
  }

  private extractMediaInfo(message: any): { fileName: string | null; fileSize: number | null; mimeType: string | null } {
    if (message.document) {
      return {
        fileName: message.document.file_name || null,
        fileSize: message.document.file_size || null,
        mimeType: message.document.mime_type || null,
      };
    }
    
    if (message.photo) {
      const largestPhoto = message.photo[message.photo.length - 1];
      return {
        fileName: 'photo.jpg',
        fileSize: largestPhoto.file_size || null,
        mimeType: 'image/jpeg',
      };
    }
    
    if (message.video) {
      return {
        fileName: 'video.mp4',
        fileSize: message.video.file_size || null,
        mimeType: message.video.mime_type || 'video/mp4',
      };
    }
    
    if (message.audio) {
      return {
        fileName: message.audio.title || 'audio.mp3',
        fileSize: message.audio.file_size || null,
        mimeType: message.audio.mime_type || 'audio/mpeg',
      };
    }
    
    if (message.voice) {
      return {
        fileName: 'voice.ogg',
        fileSize: message.voice.file_size || null,
        mimeType: message.voice.mime_type || 'audio/ogg',
      };
    }
    
    return { fileName: null, fileSize: null, mimeType: null };
  }

  toCrmActivity(messageEntity: MessageEntity, contactId?: string, accountId?: string): CrmActivityData {
    const activityType = this.getCrmActivityType(messageEntity.messageType);
    const subject = this.generateCrmSubject(messageEntity);
    const description = this.generateCrmDescription(messageEntity);
    
    return {
      activityType,
      contactId,
      accountId,
      subject,
      description,
      priority: this.determinePriority(messageEntity),
      status: 'completed',
      metadata: {
        telegram_message_id: messageEntity.platformMessageId,
        telegram_thread_id: messageEntity.platformThreadId,
        sender_id: messageEntity.senderId,
        sender_name: messageEntity.senderName,
        sent_at: messageEntity.sentAt,
        message_type: messageEntity.messageType,
        has_attachments: !!messageEntity.attachments,
        tenant_id: messageEntity.tenantId,
        original_metadata: messageEntity.metadata ? JSON.parse(messageEntity.metadata) : null,
      },
    };
  }

  private getCrmActivityType(messageType: MessageType): CrmActivityData['activityType'] {
    switch (messageType) {
      case MessageType.DOCUMENT:
      case MessageType.IMAGE:
      case MessageType.VIDEO:
      case MessageType.AUDIO:
        return 'telegram_file';
      default:
        return 'telegram_message';
    }
  }

  private generateCrmSubject(messageEntity: MessageEntity): string {
    const senderName = messageEntity.senderName || 'Unknown Sender';
    const messageTypeLabel = this.getMessageTypeLabel(messageEntity.messageType);
    
    return `Telegram ${messageTypeLabel} from ${senderName}`;
  }

  private generateCrmDescription(messageEntity: MessageEntity): string {
    const parts: string[] = [];
    
    if (messageEntity.content) {
      const truncatedContent = messageEntity.content.length > 200 
        ? messageEntity.content.substring(0, 200) + '...' 
        : messageEntity.content;
      parts.push(`Message: ${truncatedContent}`);
    }
    
    if (messageEntity.fileName) {
      parts.push(`File: ${messageEntity.fileName}`);
    }
    
    if (messageEntity.attachments) {
      try {
        const attachments = JSON.parse(messageEntity.attachments);
        if (Array.isArray(attachments) && attachments.length > 0) {
          parts.push(`Attachments: ${attachments.length} file(s)`);
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }
    
    parts.push(`Sent at: ${messageEntity.sentAt.toISOString()}`);
    
    return parts.join('\n');
  }

  private getMessageTypeLabel(messageType: MessageType): string {
    switch (messageType) {
      case MessageType.TEXT: return 'Message';
      case MessageType.DOCUMENT: return 'Document';
      case MessageType.IMAGE: return 'Image';
      case MessageType.VIDEO: return 'Video';
      case MessageType.AUDIO: return 'Audio';
      case MessageType.STICKER: return 'Sticker';
      case MessageType.LOCATION: return 'Location';
      case MessageType.CONTACT: return 'Contact';
      default: return 'Message';
    }
  }

  private determinePriority(messageEntity: MessageEntity): CrmActivityData['priority'] {
    // You can implement custom logic here based on message content, sender, etc.
    if (messageEntity.content?.includes('urgent') || messageEntity.content?.includes('emergency')) {
      return 'high';
    }
    if (messageEntity.messageType === MessageType.DOCUMENT || messageEntity.messageType === MessageType.IMAGE) {
      return 'medium';
    }
    return 'low';
  }
}
