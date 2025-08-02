import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosResponse } from 'axios';
import * as crypto from 'crypto';

/**
 * WhatsApp Business API Service
 * Предоставляет интеграцию с WhatsApp Business API для:
 * - Отправки сообщений
 * - Обработки webhook'ов
 * - Верификации подписей
 * - Управления шаблонами сообщений
 */

export interface WhatsAppMessage {
  to: string; // Phone number in international format
  type: 'text' | 'template' | 'image' | 'document';
  text?: {
    body: string;
  };
  template?: {
    name: string;
    language: {
      code: string;
    };
    components?: any[];
  };
  image?: {
    link?: string;
    id?: string;
    caption?: string;
  };
  document?: {
    link?: string;
    id?: string;
    filename?: string;
    caption?: string;
  };
}

export interface WhatsAppWebhookMessage {
  id: string;
  from: string;
  timestamp: string;
  type: 'text' | 'image' | 'document' | 'voice' | 'video' | 'audio' | 'button' | 'interactive';
  text?: {
    body: string;
  };
  image?: {
    id: string;
    mime_type: string;
    sha256: string;
    caption?: string;
  };
  document?: {
    id: string;
    filename: string;
    mime_type: string;
    sha256: string;
    caption?: string;
  };
  voice?: {
    id: string;
    mime_type: string;
  };
  button?: {
    text: string;
    payload: string;
  };
  interactive?: {
    type: 'button_reply' | 'list_reply';
    button_reply?: {
      id: string;
      title: string;
    };
    list_reply?: {
      id: string;
      title: string;
      description?: string;
    };
  };
  context?: {
    from: string;
    id: string;
  };
}

export interface WhatsAppStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  errors?: Array<{
    code: number;
    title: string;
    message?: string;
    error_data?: {
      details: string;
    };
  }>;
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly apiVersion = 'v19.0';
  private readonly baseUrl = 'https://graph.facebook.com';

  constructor(private configService: ConfigService) {
    this.validateConfiguration();
  }

  private validateConfiguration(): void {
    const requiredConfigs = [
      'WHATSAPP_ACCESS_TOKEN',
      'WHATSAPP_PHONE_NUMBER_ID',
      'WHATSAPP_VERIFY_TOKEN'
    ];

    const missingConfigs = requiredConfigs.filter(
      config => !this.configService.get(config)
    );

    if (missingConfigs.length > 0) {
      this.logger.warn(`Missing WhatsApp configuration: ${missingConfigs.join(', ')}`);
      this.logger.warn('WhatsApp service will work in development mode with stubs');
    } else {
      this.logger.log('WhatsApp Business API configured successfully');
    }
  }

  /**
   * Отправить сообщение через WhatsApp Business API
   */
  async sendMessage(message: WhatsAppMessage): Promise<any> {
    try {
      this.logger.log(`Sending WhatsApp message to ${message.to}, type: ${message.type}`);

      // В DEV режиме или без конфигурации - возвращаем mock ответ
      if (this.isDevelopmentMode()) {
        return this.mockSendMessage(message);
      }

      const accessToken = this.configService.get<string>('WHATSAPP_ACCESS_TOKEN');
      const phoneNumberId = this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID');

      const url = `${this.baseUrl}/${this.apiVersion}/${phoneNumberId}/messages`;
      
      const payload = {
        messaging_product: 'whatsapp',
        to: this.formatPhoneNumber(message.to),
        type: message.type,
        ...this.buildMessagePayload(message)
      };

      const response: AxiosResponse = await axios.post(url, payload, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      this.logger.log(`WhatsApp message sent successfully: ${response.data.messages[0].id}`);
      
      return {
        success: true,
        messageId: response.data.messages[0].id,
        whatsappId: response.data.messages[0].id,
        to: message.to,
        status: 'sent',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      this.logger.error(`Failed to send WhatsApp message:`, error.response?.data || error.message);
      
      if (error.response?.status === 401) {
        throw new Error('WhatsApp API authentication failed. Check access token.');
      } else if (error.response?.status === 400) {
        throw new Error(`WhatsApp API error: ${error.response.data.error.message}`);
      }
      
      throw new Error(`WhatsApp message sending failed: ${error.message}`);
    }
  }

  /**
   * Верифицировать webhook от WhatsApp
   */
  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    const verifyToken = this.configService.get<string>('WHATSAPP_VERIFY_TOKEN');
    
    this.logger.log(`Webhook verification: mode=${mode}, token=${token}`);
    
    if (mode === 'subscribe' && token === verifyToken) {
      this.logger.log('Webhook verified successfully');
      return challenge;
    }
    
    this.logger.warn('Webhook verification failed');
    return null;
  }

  /**
   * Обработать входящий webhook от WhatsApp
   */
  async processWebhook(payload: any): Promise<void> {
    try {
      this.logger.log('Processing WhatsApp webhook payload');

      if (!payload.entry || !Array.isArray(payload.entry)) {
        this.logger.warn('Invalid webhook payload structure');
        return;
      }

      for (const entry of payload.entry) {
        if (!entry.changes || !Array.isArray(entry.changes)) {
          continue;
        }

        for (const change of entry.changes) {
          if (change.field === 'messages') {
            await this.processMessagesChange(change.value);
          }
        }
      }

    } catch (error) {
      this.logger.error('Failed to process WhatsApp webhook:', error);
      throw error;
    }
  }

  /**
   * Верифицировать подпись webhook'а (для production)
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    try {
      const appSecret = this.configService.get<string>('WHATSAPP_APP_SECRET');
      
      if (!appSecret) {
        this.logger.warn('WhatsApp app secret not configured, skipping signature verification');
        return true; // В DEV режиме пропускаем верификацию
      }

      const expectedSignature = crypto
        .createHmac('sha256', appSecret)
        .update(payload)
        .digest('hex');

      const receivedSignature = signature.replace('sha256=', '');
      
      const isValid = crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(receivedSignature)
      );

      this.logger.log(`Webhook signature verification: ${isValid ? 'valid' : 'invalid'}`);
      return isValid;

    } catch (error) {
      this.logger.error('Failed to verify webhook signature:', error);
      return false;
    }
  }

  /**
   * Получить медиа файл по ID
   */
  async getMediaUrl(mediaId: string): Promise<string> {
    try {
      if (this.isDevelopmentMode()) {
        return `https://example.com/dev-media/${mediaId}`;
      }

      const accessToken = this.configService.get<string>('WHATSAPP_ACCESS_TOKEN');
      const url = `${this.baseUrl}/${this.apiVersion}/${mediaId}`;

      const response: AxiosResponse = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      return response.data.url;

    } catch (error) {
      this.logger.error(`Failed to get media URL for ${mediaId}:`, error);
      throw new Error(`Media retrieval failed: ${error.message}`);
    }
  }

  /**
   * Скачать медиа файл
   */
  async downloadMedia(mediaUrl: string): Promise<Buffer> {
    try {
      if (this.isDevelopmentMode()) {
        return Buffer.from('mock-media-content');
      }

      const accessToken = this.configService.get<string>('WHATSAPP_ACCESS_TOKEN');
      
      const response: AxiosResponse = await axios.get(mediaUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
        responseType: 'arraybuffer',
      });

      return Buffer.from(response.data);

    } catch (error) {
      this.logger.error(`Failed to download media from ${mediaUrl}:`, error);
      throw new Error(`Media download failed: ${error.message}`);
    }
  }

  // Приватные методы

  private isDevelopmentMode(): boolean {
    return this.configService.get('NODE_ENV') === 'development' ||
           !this.configService.get('WHATSAPP_ACCESS_TOKEN');
  }

  private mockSendMessage(message: WhatsAppMessage): any {
    const mockId = `wamid.mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger.log(`DEV MODE: Mock WhatsApp message to ${message.to}`);
    this.logger.log(`DEV MODE: Message content:`, message);
    
    return {
      success: true,
      messageId: mockId,
      whatsappId: mockId,
      to: message.to,
      status: 'sent',
      timestamp: new Date().toISOString(),
      development: true
    };
  }

  private formatPhoneNumber(phoneNumber: string): string {
    // Убираем все неиф-символы и добавляем + если нужно
    let formatted = phoneNumber.replace(/\D/g, '');
    
    if (!formatted.startsWith('7') && !formatted.startsWith('1')) {
      // Если не указан код страны, добавляем 7 для России
      formatted = '7' + formatted;
    }
    
    return formatted;
  }

  private buildMessagePayload(message: WhatsAppMessage): any {
    const payload: any = {};

    switch (message.type) {
      case 'text':
        if (message.text) {
          payload.text = message.text;
        }
        break;
      
      case 'template':
        if (message.template) {
          payload.template = message.template;
        }
        break;
      
      case 'image':
        if (message.image) {
          payload.image = message.image;
        }
        break;
      
      case 'document':
        if (message.document) {
          payload.document = message.document;
        }
        break;
      
      default:
        throw new Error(`Unsupported message type: ${message.type}`);
    }

    return payload;
  }

  private async processMessagesChange(value: any): Promise<void> {
    try {
      // Обработка входящих сообщений
      if (value.messages && Array.isArray(value.messages)) {
        for (const message of value.messages) {
          await this.processIncomingMessage(value.metadata, message);
        }
      }

      // Обработка статусов доставки
      if (value.statuses && Array.isArray(value.statuses)) {
        for (const status of value.statuses) {
          await this.processMessageStatus(status);
        }
      }

    } catch (error) {
      this.logger.error('Failed to process messages change:', error);
    }
  }

  private async processIncomingMessage(metadata: any, message: WhatsAppWebhookMessage): Promise<void> {
    try {
      this.logger.log(`Processing incoming WhatsApp message: ${message.id} from ${message.from}`);

      // Подготовка данных для отправки в Core CRM
      const messageData = {
        channelType: 'WHATSAPP',
        externalId: message.id,
        from: message.from,
        phoneNumberId: metadata.phone_number_id,
        timestamp: message.timestamp,
        messageType: message.type,
        content: this.extractMessageContent(message),
        context: message.context || null,
        metadata: {
          whatsappMetadata: metadata,
          originalMessage: message
        }
      };

      // Отправка в Core CRM
      await this.sendToCoreCRM('/api/v1/messaging/messages/inbound', messageData);
      
      this.logger.log(`Successfully forwarded WhatsApp message ${message.id} to Core CRM`);

    } catch (error) {
      this.logger.error(`Failed to process incoming message ${message.id}:`, error);
    }
  }

  private async processMessageStatus(status: WhatsAppStatus): Promise<void> {
    try {
      this.logger.log(`Processing message status: ${status.id} -> ${status.status}`);

      const statusData = {
        externalId: status.id,
        status: status.status,
        timestamp: status.timestamp,
        recipientId: status.recipient_id,
        errors: status.errors || null
      };

      // Отправка статуса в Core CRM
      await this.sendToCoreCRM('/api/v1/messaging/messages/status', statusData);

    } catch (error) {
      this.logger.error(`Failed to process message status ${status.id}:`, error);
    }
  }

  private extractMessageContent(message: WhatsAppWebhookMessage): string {
    switch (message.type) {
      case 'text':
        return message.text?.body || '';
      
      case 'image':
        return message.image?.caption || '[Image]';
      
      case 'document':
        return message.document?.caption || `[Document: ${message.document?.filename}]`;
      
      case 'voice':
        return '[Voice Message]';
      
      case 'video':
        return '[Video]';
      
      case 'audio':
        return '[Audio]';
      
      case 'button':
        return message.button?.text || '[Button Response]';
      
      case 'interactive':
        if (message.interactive?.button_reply) {
          return message.interactive.button_reply.title;
        } else if (message.interactive?.list_reply) {
          return message.interactive.list_reply.title;
        }
        return '[Interactive Response]';
      
      default:
        return `[${(message.type as string).toUpperCase()}]`;
    }
  }

  private async sendToCoreCRM(endpoint: string, data: any): Promise<void> {
    try {
      const coreCrmBaseUrl = this.configService.get<string>('CORE_CRM_BASE_URL') || 'http://localhost:8080';
      const url = `${coreCrmBaseUrl}${endpoint}`;

      if (this.isDevelopmentMode()) {
        this.logger.log(`DEV MODE: Would send to Core CRM ${endpoint}:`, data);
        return;
      }

      const response = await axios.post(url, data, {
        headers: {
          'Content-Type': 'application/json',
          // TODO: Добавить JWT токен для аутентификации
          // 'Authorization': `Bearer ${jwtToken}`
        },
        timeout: 5000,
      });

      this.logger.log(`Successfully sent to Core CRM: ${response.status}`);

    } catch (error) {
      this.logger.error(`Failed to send to Core CRM:`, error.response?.data || error.message);
      throw error;
    }
  }
}