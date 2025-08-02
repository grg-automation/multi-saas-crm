import { 
  Controller, 
  Post, 
  Get, 
  Body, 
  Query, 
  Headers, 
  Logger, 
  HttpException, 
  HttpStatus,
  RawBodyRequest,
  Req
} from '@nestjs/common';
import { Request } from 'express';
import { WhatsAppService, WhatsAppMessage } from './whatsapp.service';
import { 
  SendWhatsAppMessageDto, 
  WhatsAppWebhookDto,
  SendTemplateMessageDto 
} from './dto/whatsapp.dto';

/**
 * WhatsApp Business API Controller
 * 
 * Предоставляет endpoints для:
 * - Отправки сообщений через WhatsApp Business API
 * - Обработки webhook'ов от WhatsApp
 * - Верификации webhook'ов
 * - Отправки шаблонных сообщений
 */

@Controller('whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(private readonly whatsAppService: WhatsAppService) {}

  /**
   * Webhook verification endpoint
   * GET /api/v1/whatsapp/webhook
   * 
   * WhatsApp требует верификацию webhook URL перед использованием
   */
  @Get('webhook')
  async verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    try {
      this.logger.log(`Webhook verification request: mode=${mode}`);
      
      const result = this.whatsAppService.verifyWebhook(mode, token, challenge);
      
      if (result) {
        this.logger.log('Webhook verification successful');
        return result; // Возвращаем challenge как plain text
      } else {
        this.logger.warn('Webhook verification failed');
        throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
      }
    } catch (error) {
      this.logger.error(`Webhook verification error: ${error.message}`);
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }
  }

  /**
   * Webhook endpoint для получения входящих сообщений
   * POST /api/v1/whatsapp/webhook
   */
  @Post('webhook')
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string,
    @Body() payload: WhatsAppWebhookDto,
  ) {
    try {
      this.logger.log('Received WhatsApp webhook');

      // Верификация подписи в production
      if (process.env.NODE_ENV === 'production' && signature) {
        const rawBody = req.rawBody ? req.rawBody.toString() : JSON.stringify(payload);
        const isValidSignature = this.whatsAppService.verifyWebhookSignature(rawBody, signature);
        
        if (!isValidSignature) {
          this.logger.warn('Invalid webhook signature');
          throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
        }
      }

      // Обработка webhook payload
      await this.whatsAppService.processWebhook(payload);
      
      return { success: true, message: 'Webhook processed successfully' };

    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      this.logger.error(`Webhook processing error: ${error.message}`);
      throw new HttpException(
        { success: false, message: 'Webhook processing failed' },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Отправить текстовое сообщение
   * POST /api/v1/whatsapp/send-message
   */
  @Post('send-message')
  async sendMessage(@Body() dto: SendWhatsAppMessageDto) {
    try {
      this.logger.log(`Sending WhatsApp message to ${dto.to}`);
      
      const message: WhatsAppMessage = {
        to: dto.to,
        type: 'text',
        text: {
          body: dto.message
        }
      };
      
      const result = await this.whatsAppService.sendMessage(message);
      
      return {
        success: true,
        messageId: result.messageId,
        whatsappId: result.whatsappId,
        status: result.status,
        timestamp: result.timestamp,
        message: 'Message sent successfully'
      };

    } catch (error) {
      this.logger.error(`Failed to send message: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Отправить шаблонное сообщение
   * POST /api/v1/whatsapp/send-template
   */
  @Post('send-template')
  async sendTemplate(@Body() dto: SendTemplateMessageDto) {
    try {
      this.logger.log(`Sending WhatsApp template ${dto.templateName} to ${dto.to}`);
      
      const message: WhatsAppMessage = {
        to: dto.to,
        type: 'template',
        template: {
          name: dto.templateName,
          language: {
            code: dto.languageCode || 'ru'
          },
          components: dto.parameters ? [
            {
              type: 'body',
              parameters: dto.parameters.map(param => ({
                type: 'text',
                text: param
              }))
            }
          ] : undefined
        }
      };
      
      const result = await this.whatsAppService.sendMessage(message);
      
      return {
        success: true,
        messageId: result.messageId,
        whatsappId: result.whatsappId,
        status: result.status,
        timestamp: result.timestamp,
        template: dto.templateName,
        message: 'Template message sent successfully'
      };

    } catch (error) {
      this.logger.error(`Failed to send template: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Отправить медиа сообщение (изображение)
   * POST /api/v1/whatsapp/send-image
   */
  @Post('send-image')
  async sendImage(@Body() dto: { to: string; imageUrl: string; caption?: string }) {
    try {
      this.logger.log(`Sending WhatsApp image to ${dto.to}`);
      
      const message: WhatsAppMessage = {
        to: dto.to,
        type: 'image',
        image: {
          link: dto.imageUrl,
          caption: dto.caption
        }
      };
      
      const result = await this.whatsAppService.sendMessage(message);
      
      return {
        success: true,
        messageId: result.messageId,
        whatsappId: result.whatsappId,
        status: result.status,
        timestamp: result.timestamp,
        message: 'Image sent successfully'
      };

    } catch (error) {
      this.logger.error(`Failed to send image: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Отправить документ
   * POST /api/v1/whatsapp/send-document
   */
  @Post('send-document')
  async sendDocument(@Body() dto: { to: string; documentUrl: string; filename?: string; caption?: string }) {
    try {
      this.logger.log(`Sending WhatsApp document to ${dto.to}`);
      
      const message: WhatsAppMessage = {
        to: dto.to,
        type: 'document',
        document: {
          link: dto.documentUrl,
          filename: dto.filename,
          caption: dto.caption
        }
      };
      
      const result = await this.whatsAppService.sendMessage(message);
      
      return {
        success: true,
        messageId: result.messageId,
        whatsappId: result.whatsappId,
        status: result.status,
        timestamp: result.timestamp,
        message: 'Document sent successfully'
      };

    } catch (error) {
      this.logger.error(`Failed to send document: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Получить URL медиа файла
   * GET /api/v1/whatsapp/media/:mediaId
   */
  @Get('media/:mediaId')
  async getMediaUrl(@Query('mediaId') mediaId: string) {
    try {
      this.logger.log(`Getting media URL for: ${mediaId}`);
      
      const mediaUrl = await this.whatsAppService.getMediaUrl(mediaId);
      
      return {
        success: true,
        mediaId,
        url: mediaUrl,
        message: 'Media URL retrieved successfully'
      };

    } catch (error) {
      this.logger.error(`Failed to get media URL: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Health check для WhatsApp service
   * GET /api/v1/whatsapp/health
   */
  @Get('health')
  async healthCheck() {
    try {
      const config = {
        hasAccessToken: !!process.env.WHATSAPP_ACCESS_TOKEN,
        hasPhoneNumberId: !!process.env.WHATSAPP_PHONE_NUMBER_ID,
        hasVerifyToken: !!process.env.WHATSAPP_VERIFY_TOKEN,
        environment: process.env.NODE_ENV || 'development'
      };

      return {
        success: true,
        service: 'WhatsApp Business API',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        configuration: config
      };

    } catch (error) {
      this.logger.error(`Health check failed: ${error.message}`);
      throw new HttpException(
        { success: false, message: 'Service unhealthy' },
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
  }

  /**
   * Тест endpoint для DEV режима
   * POST /api/v1/whatsapp/test/mock-webhook
   */
  @Post('test/mock-webhook')
  async testMockWebhook(@Body() dto: any) {
    try {
      if (process.env.NODE_ENV !== 'development') {
        throw new HttpException(
          { success: false, message: 'Test endpoints only available in development' },
          HttpStatus.FORBIDDEN
        );
      }

      this.logger.log('DEV TEST: Processing mock WhatsApp webhook');
      
      // Создаем mock webhook payload
      const mockPayload = {
        object: 'whatsapp_business_account',
        entry: [{
          id: '123456',
          changes: [{
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '79001234567',
                phone_number_id: '123456789'
              },
              messages: [{
                id: `mock_${Date.now()}`,
                from: dto.from || '79001234567',
                timestamp: Math.floor(Date.now() / 1000).toString(),
                type: 'text',
                text: {
                  body: dto.message || 'Test message from WhatsApp'
                }
              }]
            }
          }]
        }]
      };

      await this.whatsAppService.processWebhook(mockPayload);
      
      return {
        success: true,
        message: 'Mock webhook processed successfully',
        payload: mockPayload,
        mode: 'development_test'
      };

    } catch (error) {
      this.logger.error(`Test mock webhook failed: ${error.message}`);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.BAD_REQUEST
      );
    }
  }
}