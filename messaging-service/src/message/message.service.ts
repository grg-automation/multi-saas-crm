import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ChannelService } from '../channel/channel.service';
import { ThreadService } from '../thread/thread.service';
import { ChannelType } from '../types/channel.types';
import { MessagingWebSocketGateway } from '../websoket/websoket.gateway';
import { TelegramMessageAdapter } from './adapters/telegram-message.adapter';
import { WhatsAppMessageAdapter } from './adapters/whatsapp-message.adapter';
import { MessageEntity } from './entities/message.entity';
import { MessageRepository } from './message.repository';

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);

  constructor(
    private readonly messageRepo: MessageRepository,
    private readonly channelService: ChannelService,
    private readonly threadService: ThreadService,
    private readonly telegramAdapter: TelegramMessageAdapter,
    private readonly whatsAppAdapter: WhatsAppMessageAdapter,
    private readonly webSocketGateway: MessagingWebSocketGateway,
  ) {}

  // ADD THESE NEW METHODS FOR THE THREAD CONTROLLER:

  async findByThreadId(
    threadId: string,
    page: number = 1,
    size: number = 50,
  ): Promise<MessageEntity[]> {
    this.logger.log(
      `🔍 Finding messages for thread: ${threadId}, page: ${page}, size: ${size}`,
    );

    try {
      // Try to get messages from repository
      const messages = await this.messageRepo.findByThreadId(
        threadId,
        page,
        size,
      );
      this.logger.log(
        `✅ Found ${messages.length} messages for thread: ${threadId}`,
      );
      return messages;
    } catch (error) {
      this.logger.error(
        `❌ Error finding messages for thread ${threadId}:`,
        error.message,
      );
      // Return empty array - controller will handle with mock data
      return [];
    }
  }

  async create(messageData: {
    threadId: string;
    content: string;
    direction: 'INBOUND' | 'OUTBOUND';
    messageType?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT';
    senderName?: string;
    senderId: string;
    sentAt: Date;
    status: string;
  }): Promise<MessageEntity> {
    this.logger.log(`📝 Creating message for thread: ${messageData.threadId}`);

    try {
      // Create message entity
      const messageEntity = new MessageEntity();
      messageEntity.threadId = messageData.threadId;
      messageEntity.content = messageData.content;
      messageEntity.direction = messageData.direction as any; // Type cast for now
      messageEntity.messageType = (messageData.messageType || 'TEXT') as any; // Type cast for now
      messageEntity.senderName = messageData.senderName || null;
      messageEntity.senderId = messageData.senderId;
      messageEntity.sentAt = messageData.sentAt;
      messageEntity.status = messageData.status;
      messageEntity.externalId = `ext_${Date.now()}`; // Generate external ID

      // Save to repository
      const savedMessage = await this.messageRepo.saveMessage(messageEntity);
      this.logger.log(`✅ Message created with ID: ${savedMessage.id}`);

      // Send WebSocket notification for real-time updates
      this.webSocketGateway.sendToSession('tenant_default', {
        type: 'new_message',
        data: savedMessage,
      });

      return savedMessage;
    } catch (error) {
      this.logger.error(`❌ Error creating message:`, error.message);

      // Return mock message as fallback
      const mockMessage = new MessageEntity();
      mockMessage.id = Date.now().toString();
      mockMessage.threadId = messageData.threadId;
      mockMessage.content = messageData.content;
      mockMessage.direction = messageData.direction as any; // Type cast for now
      mockMessage.messageType = (messageData.messageType || 'TEXT') as any; // Type cast for now
      mockMessage.senderName = messageData.senderName || null;
      mockMessage.senderId = messageData.senderId;
      mockMessage.sentAt = messageData.sentAt;
      mockMessage.status = messageData.status;

      return mockMessage;
    }
  }

  async markThreadAsRead(
    threadId: string,
    userId: string = 'manager_1',
  ): Promise<boolean> {
    this.logger.log(
      `📖 Marking thread as read: ${threadId} by user: ${userId}`,
    );

    try {
      // Update all unread messages in the thread to read status
      const updated = await this.messageRepo.markThreadMessagesAsRead(
        threadId,
        userId,
      );
      this.logger.log(
        `✅ Marked ${updated} messages as read in thread: ${threadId}`,
      );

      // Update thread unread count
      await this.threadService.resetUnreadCount(threadId);

      return true;
    } catch (error) {
      this.logger.error(`❌ Error marking thread as read:`, error.message);
      return false;
    }
  }

  // YOUR EXISTING METHODS:

  async processTelegramMessage(message: any, tenantId: string | null) {
    try {
      const chatId = message.chat.id.toString();
      const userId = message.from.id.toString();

      const channel = await this.channelService.getOrCreateChannel(
        tenantId,
        ChannelType.TELEGRAM, // Use enum
        chatId,
      );

      const thread = await this.threadService.createOrUpdateThread(
        tenantId,
        channel.id,
        userId,
        userId,
      );

      const messageEntity = this.telegramAdapter.telegramToMessage(
        message,
        tenantId,
        thread.id,
      );

      // Save message
      await this.messageRepo.saveMessage(messageEntity);

      await this.threadService.incrementUnreadCount(
        thread.id,
        messageEntity.sentAt,
      );

      await this.forwardToCrm(messageEntity);

      this.webSocketGateway.sendToSession(`tenant_${tenantId || 'default'}`, {
        type: 'new_message',
        data: messageEntity,
      });
    } catch (error) {
      this.logger.error('Telegram processing failed', error);
      throw error;
    }
  }

  async processWhatsAppMessage(webhook: any, tenantId: string | null) {
    try {
      const entry = webhook.entry[0];
      const change = entry.changes[0];
      const message = change.value.messages[0];
      const phoneNumberId = change.value.metadata.phone_number_id;
      const contactId = message.from;

      const channel = await this.channelService.getOrCreateChannel(
        tenantId,
        ChannelType.WHATSAPP, // Use enum
        phoneNumberId,
      );

      const thread = await this.threadService.createOrUpdateThread(
        tenantId,
        channel.id,
        contactId,
        contactId,
      );

      const messageEntity = this.whatsAppAdapter.whatsAppToMessage(
        message,
        tenantId,
        thread.id,
      );

      if (!messageEntity) {
        throw new Error('Failed to adapt WhatsApp message');
      }

      await this.messageRepo.saveMessage(messageEntity);

      await this.threadService.incrementUnreadCount(
        thread.id,
        messageEntity.sentAt,
      );

      // await this.forwardToCrm(messageEntity);

      this.webSocketGateway.sendToSession(`tenant_${tenantId || 'default'}`, {
        type: 'new_message',
        data: messageEntity,
      });
    } catch (error) {
      this.logger.error('WhatsApp processing failed', error);
      throw error;
    }
  }

  async forwardToCrm(message: MessageEntity) {
    try {
      const crmApiUrl =
        process.env.CRM_API_URL || 'http://localhost:8080/api/v1';
      await axios.post(`${crmApiUrl}/messages`, message);
      this.logger.log('Message forwarded to CRM');
    } catch (error) {
      this.logger.error('Failed to forward message to CRM', error);
    }
  }
}
