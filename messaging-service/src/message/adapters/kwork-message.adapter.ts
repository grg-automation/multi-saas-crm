import { Injectable, Logger } from '@nestjs/common';
import { MessageDirection, MessageType } from '../../types/message.types';
import { MessageEntity } from '../entities/message.entity';

export interface KworkMessageData {
  id: string;
  dialog_id: string;
  message: string;
  sender_id: string;
  sender_name: string;
  sent_at: string;
  message_type: string;
  attachments?: any[];
  order_id?: string;
  client_info?: {
    id: string;
    name: string;
    rating?: number;
  };
}

@Injectable()
export class KworkMessageAdapter {
  private readonly logger = new Logger(KworkMessageAdapter.name);

  canHandle(data: any): boolean {
    // Check if this is Kwork message data
    return data && (data.dialog_id || data.order_id) && data.message && data.sender_id;
  }

  async adapt(data: KworkMessageData, tenantId: string | null): Promise<Partial<MessageEntity>> {
    try {
      this.logger.log(`🔧 Adapting Kwork message: ${data.id}`);

      // Determine direction based on sender
      const direction = data.sender_id === 'system' ? 'INBOUND' : 
                       data.sender_name?.toLowerCase().includes('manager') ? 'OUTBOUND' : 'INBOUND';

      const adaptedMessage: Partial<MessageEntity> = {
        tenantId: tenantId,
        externalId: data.id,
        platformMessageId: data.id,
        platformThreadId: data.dialog_id || data.order_id,
        content: data.message,
        direction: direction === 'INBOUND' ? MessageDirection.INBOUND : MessageDirection.OUTBOUND,
        messageType: this.mapKworkMessageType(data.message_type) as MessageType,
        senderId: data.sender_id,
        senderName: data.sender_name || 'Kwork User',
        sentAt: new Date(data.sent_at),
        attachments: data.attachments ? JSON.stringify(data.attachments) : null,
        metadata: JSON.stringify({
          kwork_dialog_id: data.dialog_id,
          kwork_order_id: data.order_id,
          kwork_client_info: data.client_info,
          original_message_type: data.message_type,
        }),
      };

      this.logger.log(`✅ Kwork message adapted: ${data.id} -> ${direction}`);
      return adaptedMessage;
    } catch (error) {
      this.logger.error(`❌ Error adapting Kwork message ${data.id}:`, error);
      throw error;
    }
  }

  private mapKworkMessageType(kworkType: string): MessageType {
    const typeMap: { [key: string]: MessageType } = {
      'text': MessageType.TEXT,
      'file': MessageType.DOCUMENT,
      'image': MessageType.IMAGE,
      'system': MessageType.TEXT,
      'notification': MessageType.TEXT,
    };
    return typeMap[kworkType?.toLowerCase()] || MessageType.TEXT;
  }

  // Helper method to extract contact information from Kwork message
  extractContactInfo(data: KworkMessageData): {
    contactId: string;
    name: string;
    metadata: any;
  } {
    return {
      contactId: data.client_info?.id || data.sender_id,
      name: data.client_info?.name || data.sender_name || 'Kwork User',
      metadata: {
        kwork_client_rating: data.client_info?.rating,
        kwork_sender_id: data.sender_id,
        kwork_dialog_id: data.dialog_id,
        kwork_order_id: data.order_id,
      },
    };
  }

  // Helper method to extract channel information
  extractChannelInfo(): {
    type: string;
    externalId: string;
    name: string;
  } {
    return {
      type: 'KWORK',
      externalId: 'kwork_integration',
      name: 'Kwork Integration',
    };
  }
}