import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  TelegramMessageDto,
  WhatsAppMessageDto,
  WhatsAppValueDto,
  WhatsAppStatusDto,
  SendMessageDto,
  MessageDeliveryStatusDto,
  ChannelConfigDto,
  MessageProcessingResult,
  ChannelAuthResult,
  SendMessageResult,
  ProcessedMessageDto,
  ChannelType,
  MessageType,
  MessageStatus
} from './dto/messaging.dto';

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);
  private readonly crmApiUrl = process.env.CRM_API_URL || 'http://localhost:8080/api/v1';

  // === TELEGRAM MESSAGE PROCESSING ===

  async processTelegramMessage(message: TelegramMessageDto): Promise<MessageProcessingResult> {
    try {
      this.logger.log(`📱 [TELEGRAM] Processing message ${message.message_id} from ${message.from.id}`);

      // Convert Telegram message to our standard format
      const processedMessage: ProcessedMessageDto = {
        tenantId: await this.getTenantIdForTelegramChat(message.chat.id.toString()),
        channelId: await this.getChannelIdForTelegram(message.chat.id.toString()),
        externalId: `tg_${message.message_id}`,
        content: this.extractTelegramContent(message),
        messageType: this.detectTelegramMessageType(message),
        senderExternalId: message.from.id.toString(),
        senderName: this.formatTelegramSenderName(message.from),
        sentAt: new Date(message.date * 1000),
        attachments: this.extractTelegramAttachments(message),
        metadata: JSON.stringify({
          telegram: {
            chat_id: message.chat.id,
            message_id: message.message_id,
            chat_type: message.chat.type,
            username: message.from.username
          }
        }),
        replyToExternalId: message.reply_to_message ? `tg_${message.reply_to_message.message_id}` : undefined
      };

      // Send to CRM system
      const crmResult = await this.sendToCRM(processedMessage);

      if (crmResult.success) {
        this.logger.log(`📱 [TELEGRAM] Message sent to CRM: ${crmResult.crmMessageId}`);
      } else {
        this.logger.error(`📱 [TELEGRAM] Failed to send to CRM: ${crmResult.error}`);
      }

      return crmResult;
    } catch (error) {
      this.logger.error(`📱 [TELEGRAM] Error processing message:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // === WHATSAPP MESSAGE PROCESSING ===

  async processWhatsAppMessage(
    message: WhatsAppMessageDto, 
    value: WhatsAppValueDto
  ): Promise<MessageProcessingResult> {
    try {
      this.logger.log(`💬 [WHATSAPP] Processing message ${message.id} from ${message.from}`);

      // Convert WhatsApp message to our standard format
      const processedMessage: ProcessedMessageDto = {
        tenantId: await this.getTenantIdForWhatsApp(message.from),
        channelId: await this.getChannelIdForWhatsApp(message.from),
        externalId: `wa_${message.id}`,
        content: this.extractWhatsAppContent(message),
        messageType: this.detectWhatsAppMessageType(message),
        senderExternalId: message.from,
        senderName: await this.getWhatsAppContactName(message.from, value.contacts),
        sentAt: new Date(message.timestamp * 1000),
        attachments: this.extractWhatsAppAttachments(message),
        metadata: JSON.stringify({
          whatsapp: {
            message_id: message.id,
            phone_number: message.from,
            context: message.context
          }
        }),
        replyToExternalId: message.context ? `wa_${message.context.id}` : undefined
      };

      // Send to CRM system
      const crmResult = await this.sendToCRM(processedMessage);

      if (crmResult.success) {
        this.logger.log(`💬 [WHATSAPP] Message sent to CRM: ${crmResult.crmMessageId}`);
      } else {
        this.logger.error(`💬 [WHATSAPP] Failed to send to CRM: ${crmResult.error}`);
      }

      return crmResult;
    } catch (error) {
      this.logger.error(`💬 [WHATSAPP] Error processing message:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async processWhatsAppStatus(status: WhatsAppStatusDto): Promise<void> {
    try {
      this.logger.log(`💬 [WHATSAPP STATUS] Processing status for message ${status.id}: ${status.status}`);

      const statusUpdate: MessageDeliveryStatusDto = {
        status: this.mapWhatsAppStatus(status.status),
        externalId: `wa_${status.id}`,
        timestamp: status.timestamp
      };

      if (status.errors && status.errors.length > 0) {
        statusUpdate.errorMessage = JSON.stringify(status.errors);
      }

      await this.updateMessageDeliveryStatus(status.id, statusUpdate);
    } catch (error) {
      this.logger.error(`💬 [WHATSAPP STATUS] Error processing status:`, error.message);
    }
  }

  // === MESSAGE SENDING ===

  async sendMessage(dto: SendMessageDto): Promise<SendMessageResult> {
    try {
      switch (dto.channelType) {
        case ChannelType.TELEGRAM:
          return await this.sendTelegramMessage(dto);
        case ChannelType.WHATSAPP:
          return await this.sendWhatsAppMessage(dto);
        default:
          throw new Error(`Unsupported channel type: ${dto.channelType}`);
      }
    } catch (error) {
      this.logger.error(`📤 [SEND] Error sending message:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  private async sendTelegramMessage(dto: SendMessageDto): Promise<SendMessageResult> {
    this.logger.log(`📱 [TELEGRAM SEND] Sending message to ${dto.to}`);
    
    // For now, this is a stub - in real implementation you'd use MTProto or Bot API
    const result = {
      success: true,
      externalId: `tg_${Date.now()}`,
      messageId: dto.threadId,
      status: MessageStatus.SENT as MessageStatus,
      deliveredAt: new Date()
    };

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 100));

    this.logger.log(`📱 [TELEGRAM SEND] Message sent (STUB): ${result.externalId}`);
    
    // Update CRM with outbound message status
    if (dto.threadId) {
      await this.notifyCRMMessageSent(dto, result);
    }

    return result;
  }

  private async sendWhatsAppMessage(dto: SendMessageDto): Promise<SendMessageResult> {
    this.logger.log(`💬 [WHATSAPP SEND] Sending message to ${dto.to}`);
    
    try {
      const whatsappApiUrl = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v17.0';
      const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
      const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

      if (!accessToken || !phoneNumberId) {
        throw new Error('WhatsApp API credentials not configured');
      }

      const payload = {
        messaging_product: 'whatsapp',
        to: dto.to,
        type: 'text',
        text: {
          body: dto.content
        }
      };

      const response = await axios.post(
        `${whatsappApiUrl}/${phoneNumberId}/messages`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const result = {
        success: true,
        externalId: `wa_${response.data.messages[0].id}`,
        messageId: dto.threadId,
        status: MessageStatus.SENT as MessageStatus,
        deliveredAt: new Date()
      };

      this.logger.log(`💬 [WHATSAPP SEND] Message sent: ${result.externalId}`);
      
      // Update CRM with outbound message status
      if (dto.threadId) {
        await this.notifyCRMMessageSent(dto, result);
      }

      return result;
    } catch (error) {
      this.logger.error(`💬 [WHATSAPP SEND] Error:`, error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message
      };
    }
  }

  // === STATUS UPDATES ===

  async updateMessageDeliveryStatus(messageId: string, dto: MessageDeliveryStatusDto): Promise<void> {
    try {
      this.logger.log(`📊 [STATUS UPDATE] Updating message ${messageId}: ${dto.status}`);

      // Find the message in CRM by external ID and update status
      await axios.put(
        `${this.crmApiUrl}/messaging/messages/external/${dto.externalId}/status`,
        {
          status: dto.status,
          errorMessage: dto.errorMessage
        },
        {
          headers: { 'Content-Type': 'application/json' }
        }
      );

      this.logger.log(`📊 [STATUS UPDATE] Message status updated in CRM`);
    } catch (error) {
      this.logger.error(`📊 [STATUS UPDATE] Error updating status:`, error.message);
    }
  }

  // === CHANNEL MANAGEMENT ===

  async authenticateTelegramChannel(dto: ChannelConfigDto): Promise<ChannelAuthResult> {
    this.logger.log(`🔐 [TELEGRAM AUTH] Authenticating channel for ${dto.managerId}`);
    
    try {
      // This is a stub - in real implementation you'd handle MTProto authentication
      const result = {
        success: true,
        channelId: `tg_${dto.externalId}`,
        status: 'authenticated',
        config: {
          type: 'telegram_user',
          user_id: dto.externalId,
          session_file: `sessions/telegram_${dto.managerId}.session`
        }
      };

      // Register channel in CRM
      await this.registerChannelInCRM(dto, result.channelId);

      this.logger.log(`🔐 [TELEGRAM AUTH] Channel authenticated: ${result.channelId}`);
      return result;
    } catch (error) {
      this.logger.error(`🔐 [TELEGRAM AUTH] Error:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async setupWhatsAppChannel(dto: ChannelConfigDto): Promise<ChannelAuthResult> {
    this.logger.log(`🔐 [WHATSAPP SETUP] Setting up channel for ${dto.managerId}`);
    
    try {
      // Validate WhatsApp Business API configuration
      const config = dto.config || {};
      if (!config.accessToken || !config.phoneNumberId) {
        throw new Error('WhatsApp access token and phone number ID required');
      }

      const result = {
        success: true,
        channelId: `wa_${dto.externalId}`,
        status: 'configured',
        config: {
          type: 'whatsapp_business',
          phone_number: dto.externalId,
          phone_number_id: config.phoneNumberId,
          webhook_url: `${process.env.WEBHOOK_BASE_URL}/api/v1/messaging/whatsapp/webhook`
        }
      };

      // Register channel in CRM
      await this.registerChannelInCRM(dto, result.channelId);

      this.logger.log(`🔐 [WHATSAPP SETUP] Channel configured: ${result.channelId}`);
      return result;
    } catch (error) {
      this.logger.error(`🔐 [WHATSAPP SETUP] Error:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // === HELPER METHODS ===

  private async sendToCRM(message: ProcessedMessageDto): Promise<MessageProcessingResult> {
    try {
      const response = await axios.post(
        `${this.crmApiUrl}/messaging/messages/inbound?tenantId=${message.tenantId}`,
        {
          channelId: message.channelId,
          externalId: message.externalId,
          content: message.content,
          messageType: message.messageType,
          senderExternalId: message.senderExternalId,
          senderName: message.senderName,
          sentAt: message.sentAt,
          attachments: message.attachments,
          metadata: message.metadata
        },
        {
          headers: { 'Content-Type': 'application/json' }
        }
      );

      return {
        success: true,
        crmMessageId: response.data.data.id,
        crmThreadId: response.data.data.threadId,
        externalId: message.externalId
      };
    } catch (error) {
      this.logger.error(`🔗 [CRM] Error sending to CRM:`, error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  private async notifyCRMMessageSent(dto: SendMessageDto, result: SendMessageResult): Promise<void> {
    try {
      await axios.put(
        `${this.crmApiUrl}/messaging/messages/${dto.threadId}/outbound-status`,
        {
          externalId: result.externalId,
          status: result.status,
          sentAt: result.deliveredAt
        },
        {
          headers: { 'Content-Type': 'application/json' }
        }
      );
    } catch (error) {
      this.logger.error(`🔗 [CRM] Error notifying message sent:`, error.message);
    }
  }

  private async registerChannelInCRM(dto: ChannelConfigDto, channelId: string): Promise<void> {
    try {
      await axios.post(
        `${this.crmApiUrl}/messaging/channels?tenantId=${dto.tenantId}`,
        {
          type: dto.channelType.toUpperCase(),
          externalId: dto.externalId,
          managerId: dto.managerId,
          displayName: dto.displayName,
          metadata: JSON.stringify(dto.config)
        },
        {
          headers: { 'Content-Type': 'application/json' }
        }
      );
    } catch (error) {
      this.logger.error(`🔗 [CRM] Error registering channel:`, error.message);
    }
  }

  // Channel lookup methods (these would connect to CRM or cache)
  private async getTenantIdForTelegramChat(chatId: string): Promise<string> {
    // Stub - in real implementation, look up tenant by chat ID
    return process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000000';
  }

  private async getTenantIdForWhatsApp(phoneNumber: string): Promise<string> {
    // Stub - in real implementation, look up tenant by phone number
    return process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000000';
  }

  private async getChannelIdForTelegram(chatId: string): Promise<string> {
    // Stub - in real implementation, look up channel by chat ID
    return `tg_channel_${chatId}`;
  }

  private async getChannelIdForWhatsApp(phoneNumber: string): Promise<string> {
    // Stub - in real implementation, look up channel by phone number
    return `wa_channel_${phoneNumber}`;
  }

  // Message content extraction methods
  private extractTelegramContent(message: TelegramMessageDto): string {
    return message.text || '[Media message]';
  }

  private extractWhatsAppContent(message: WhatsAppMessageDto): string {
    if (message.text) return message.text.body;
    if (message.image?.caption) return message.image.caption;
    if (message.video?.caption) return message.video.caption;
    if (message.document?.caption) return message.document.caption;
    return '[Media message]';
  }

  private detectTelegramMessageType(message: TelegramMessageDto): MessageType {
    if (message.photo) return MessageType.IMAGE;
    if (message.video) return MessageType.VIDEO;
    if (message.audio || message.voice) return MessageType.AUDIO;
    if (message.document) return MessageType.DOCUMENT;
    if (message.location) return MessageType.LOCATION;
    if (message.contact) return MessageType.CONTACT;
    return MessageType.TEXT;
  }

  private detectWhatsAppMessageType(message: WhatsAppMessageDto): MessageType {
    switch (message.type) {
      case 'image': return MessageType.IMAGE;
      case 'video': return MessageType.VIDEO;
      case 'audio': return MessageType.AUDIO;
      case 'document': return MessageType.DOCUMENT;
      case 'location': return MessageType.LOCATION;
      case 'contacts': return MessageType.CONTACT;
      default: return MessageType.TEXT;
    }
  }

  private formatTelegramSenderName(user: any): string {
    const parts = [user.first_name, user.last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : user.username || `User ${user.id}`;
  }

  private async getWhatsAppContactName(phoneNumber: string, contacts?: any[]): Promise<string> {
    if (contacts && contacts.length > 0) {
      const contact = contacts.find(c => c.wa_id === phoneNumber);
      if (contact?.profile?.name) return contact.profile.name;
    }
    return phoneNumber;
  }

  private extractTelegramAttachments(message: TelegramMessageDto): string | undefined {
    const attachments: any[] = [];
    
    if (message.photo) {
      attachments.push({ type: 'photo', data: message.photo });
    }
    if (message.document) {
      attachments.push({ type: 'document', data: message.document });
    }
    if (message.video) {
      attachments.push({ type: 'video', data: message.video });
    }
    if (message.audio) {
      attachments.push({ type: 'audio', data: message.audio });
    }
    if (message.voice) {
      attachments.push({ type: 'voice', data: message.voice });
    }

    return attachments.length > 0 ? JSON.stringify(attachments) : undefined;
  }

  private extractWhatsAppAttachments(message: WhatsAppMessageDto): string | undefined {
    const attachments: any[] = [];

    if (message.image) {
      attachments.push({ type: 'image', data: message.image });
    }
    if (message.video) {
      attachments.push({ type: 'video', data: message.video });
    }
    if (message.audio) {
      attachments.push({ type: 'audio', data: message.audio });
    }
    if (message.document) {
      attachments.push({ type: 'document', data: message.document });
    }

    return attachments.length > 0 ? JSON.stringify(attachments) : undefined;
  }

  private mapWhatsAppStatus(status: string): MessageStatus {
    switch (status) {
      case 'sent': return MessageStatus.SENT;
      case 'delivered': return MessageStatus.DELIVERED;
      case 'read': return MessageStatus.READ;
      case 'failed': return MessageStatus.FAILED;
      default: return MessageStatus.SENT;
    }
  }
}