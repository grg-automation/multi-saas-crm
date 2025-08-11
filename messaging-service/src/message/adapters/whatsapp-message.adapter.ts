import { Injectable } from '@nestjs/common';
import { MessageDirection, MessageType } from '../../types/message.types';
import { MessageEntity } from '../entities/message.entity';

export interface WhatsAppCrmActivityData {
  activityType: 'whatsapp_message' | 'whatsapp_call' | 'whatsapp_file';
  contactId?: string;
  accountId?: string;
  subject: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'completed' | 'in_progress' | 'scheduled';
  metadata: Record<string, any>;
}

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
    
    // Enhanced content handling
    entity.content = this.extractMessageContent(message);
    entity.messageType = this.determineMessageType(message);
    entity.sentAt = new Date(parseInt(message.timestamp) * 1000);
    
    // Enhanced sender information
    entity.senderId = message.from;
    entity.senderName = this.extractSenderName(message);
    
    // Enhanced attachments and media handling
    entity.attachments = this.extractAttachments(message);
    if (message.document || message.image || message.video || message.audio) {
      const mediaInfo = this.extractMediaInfo(message);
      entity.fileName = mediaInfo.fileName;
      entity.fileSize = mediaInfo.fileSize;
      entity.mimeType = mediaInfo.mimeType;
    }
    
    // Enhanced metadata for CRM integration
    entity.metadata = JSON.stringify({
      whatsapp_from: message.from,
      whatsapp_profile_name: message.profile?.name,
      whatsapp_business_account_id: message.metadata?.business_account_id,
      whatsapp_display_phone_number: message.metadata?.display_phone_number,
      whatsapp_phone_number_id: message.metadata?.phone_number_id,
      whatsapp_context: message.context,
      whatsapp_referral: message.referral,
      whatsapp_type: message.type,
      has_interactive: !!message.interactive,
      has_location: !!message.location,
      has_contacts: !!message.contacts,
      reaction: message.reaction,
    });
    
    return entity;
  }

  private extractMessageContent(message: any): string {
    if (message.text?.body) return message.text.body;
    if (message.image?.caption) return message.image.caption;
    if (message.video?.caption) return message.video.caption;
    if (message.document?.caption) return message.document.caption;
    if (message.image) return '[Image]';
    if (message.video) return '[Video]';
    if (message.audio) return '[Audio]';
    if (message.voice) return '[Voice Message]';
    if (message.document) return `[Document: ${message.document.filename || 'Unknown'}]`;
    if (message.sticker) return '[Sticker]';
    if (message.location) return `[Location: ${message.location.latitude}, ${message.location.longitude}]`;
    if (message.contacts && message.contacts.length > 0) {
      const contact = message.contacts[0];
      return `[Contact: ${contact.name?.formatted_name || contact.name?.first_name || 'Unknown'}]`;
    }
    if (message.interactive) {
      if (message.interactive.type === 'button_reply') {
        return `[Button: ${message.interactive.button_reply.title}]`;
      }
      if (message.interactive.type === 'list_reply') {
        return `[List Selection: ${message.interactive.list_reply.title}]`;
      }
    }
    if (message.button?.text) return message.button.text;
    if (message.reaction) return `[Reaction: ${message.reaction.emoji}]`;
    return '[Unsupported Message Type]';
  }

  private determineMessageType(message: any): MessageType {
    if (message.document) return MessageType.DOCUMENT;
    if (message.image) return MessageType.IMAGE;
    if (message.video) return MessageType.VIDEO;
    if (message.audio || message.voice) return MessageType.AUDIO;
    if (message.sticker) return MessageType.STICKER;
    if (message.location) return MessageType.LOCATION;
    if (message.contacts) return MessageType.CONTACT;
    return MessageType.TEXT;
  }

  private extractSenderName(message: any): string | null {
    if (message.profile?.name) return message.profile.name;
    if (message.from) {
      return `+${message.from}`;
    }
    return null;
  }

  private extractAttachments(message: any): string | null {
    const attachments: any[] = [];
    
    if (message.document) {
      attachments.push({
        type: 'document',
        id: message.document.id,
        mime_type: message.document.mime_type,
        filename: message.document.filename,
        sha256: message.document.sha256,
        caption: message.document.caption,
      });
    }
    
    if (message.image) {
      attachments.push({
        type: 'image',
        id: message.image.id,
        mime_type: message.image.mime_type,
        sha256: message.image.sha256,
        caption: message.image.caption,
      });
    }
    
    if (message.video) {
      attachments.push({
        type: 'video',
        id: message.video.id,
        mime_type: message.video.mime_type,
        sha256: message.video.sha256,
        caption: message.video.caption,
      });
    }
    
    if (message.audio) {
      attachments.push({
        type: 'audio',
        id: message.audio.id,
        mime_type: message.audio.mime_type,
        sha256: message.audio.sha256,
        voice: message.audio.voice,
      });
    }
    
    if (message.voice) {
      attachments.push({
        type: 'voice',
        id: message.voice.id,
        mime_type: message.voice.mime_type,
        sha256: message.voice.sha256,
      });
    }
    
    if (message.sticker) {
      attachments.push({
        type: 'sticker',
        id: message.sticker.id,
        mime_type: message.sticker.mime_type,
        sha256: message.sticker.sha256,
        animated: message.sticker.animated,
      });
    }
    
    return attachments.length > 0 ? JSON.stringify(attachments) : null;
  }

  private extractMediaInfo(message: any): { fileName: string | null; fileSize: number | null; mimeType: string | null } {
    if (message.document) {
      return {
        fileName: message.document.filename || 'document',
        fileSize: null, // WhatsApp API doesn't provide file size directly
        mimeType: message.document.mime_type || null,
      };
    }
    
    if (message.image) {
      return {
        fileName: 'image.jpg',
        fileSize: null,
        mimeType: message.image.mime_type || 'image/jpeg',
      };
    }
    
    if (message.video) {
      return {
        fileName: 'video.mp4',
        fileSize: null,
        mimeType: message.video.mime_type || 'video/mp4',
      };
    }
    
    if (message.audio) {
      return {
        fileName: 'audio.mp3',
        fileSize: null,
        mimeType: message.audio.mime_type || 'audio/mpeg',
      };
    }
    
    if (message.voice) {
      return {
        fileName: 'voice.ogg',
        fileSize: null,
        mimeType: message.voice.mime_type || 'audio/ogg',
      };
    }
    
    return { fileName: null, fileSize: null, mimeType: null };
  }

  toCrmActivity(messageEntity: MessageEntity, contactId?: string, accountId?: string): WhatsAppCrmActivityData {
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
        whatsapp_message_id: messageEntity.platformMessageId,
        whatsapp_thread_id: messageEntity.platformThreadId,
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

  private getCrmActivityType(messageType: MessageType): WhatsAppCrmActivityData['activityType'] {
    switch (messageType) {
      case MessageType.DOCUMENT:
      case MessageType.IMAGE:
      case MessageType.VIDEO:
      case MessageType.AUDIO:
        return 'whatsapp_file';
      default:
        return 'whatsapp_message';
    }
  }

  private generateCrmSubject(messageEntity: MessageEntity): string {
    const senderName = messageEntity.senderName || 'Unknown Sender';
    const messageTypeLabel = this.getMessageTypeLabel(messageEntity.messageType);
    
    return `WhatsApp ${messageTypeLabel} from ${senderName}`;
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

  private determinePriority(messageEntity: MessageEntity): WhatsAppCrmActivityData['priority'] {
    // You can implement custom logic here based on message content, sender, etc.
    if (messageEntity.content?.toLowerCase().includes('urgent') || 
        messageEntity.content?.toLowerCase().includes('emergency')) {
      return 'high';
    }
    if (messageEntity.messageType === MessageType.DOCUMENT || 
        messageEntity.messageType === MessageType.IMAGE ||
        messageEntity.messageType === MessageType.VIDEO) {
      return 'medium';
    }
    return 'low';
  }
}
