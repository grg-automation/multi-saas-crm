import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { ConfigModule } from '@nestjs/config';
import { MessagingModule } from '../../messaging/messaging.module';
import { TelegramUserModule } from '../../telegram-user/telegram-user.module';
import { WhatsAppModule } from '../../whatsapp/whatsapp.module';

/**
 * Integration tests for CRM Messaging System
 * Тестирование интеграции между messaging, telegram-user и whatsapp модулями
 */

describe('Messaging System Integration Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: ['.env.test', '.env.local', '.env'],
        }),
        MessagingModule,
        TelegramUserModule,
        WhatsAppModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ===========================
  // HEALTH CHECK TESTS
  // ===========================

  describe('Health Checks', () => {
    it('should return messaging hub health', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/messaging/health')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        service: 'Messaging Hub',
        status: 'healthy',
      });
      expect(response.body.timestamp).toBeDefined();
    });

    it('should return telegram user api health', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/telegram-user/health')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        service: 'Telegram User API',
        status: 'healthy',
      });
      expect(response.body.stats).toBeDefined();
    });

    it('should return whatsapp api health', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/whatsapp/health')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        service: 'WhatsApp Business API',
        status: 'healthy',
      });
      expect(response.body.configuration).toBeDefined();
    });
  });

  // ===========================
  // TELEGRAM USER API TESTS
  // ===========================

  describe('Telegram User API', () => {
    let sessionId: string;

    it('should initiate telegram user authentication', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/telegram-user/auth/initiate')
        .send({
          phoneNumber: '+79001234567'
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        codeSent: true,
      });
      expect(response.body.sessionId).toBeDefined();
      
      sessionId = response.body.sessionId;
    });

    it('should complete telegram user authentication', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/telegram-user/auth/complete')
        .send({
          sessionId: sessionId,
          code: '12345'
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Authentication completed successfully',
      });
      expect(response.body.session).toMatchObject({
        id: sessionId,
        phoneNumber: '+79001234567',
        isAuthenticated: true,
        isConnected: true,
      });
    });

    it('should get user sessions', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/telegram-user/sessions')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
      });
      expect(response.body.sessions).toBeInstanceOf(Array);
      expect(response.body.count).toBeGreaterThanOrEqual(1);
      
      // Проверяем что наша сессия есть в списке
      const session = response.body.sessions.find((s: any) => s.id === sessionId);
      expect(session).toBeDefined();
      expect(session.isAuthenticated).toBe(true);
    });

    it('should send user message', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/telegram-user/send-message')
        .send({
          sessionId: sessionId,
          chatId: '123456',
          message: 'Integration test message'
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Message sent successfully',
      });
      expect(response.body.messageId).toBeDefined();
      expect(response.body.sentAt).toBeDefined();
    });

    it('should get user chats', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/telegram-user/${sessionId}/chats`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
      });
      expect(response.body.chats).toBeInstanceOf(Array);
      expect(response.body.count).toBeDefined();
    });

    it('should start listening for messages', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/telegram-user/${sessionId}/start-listening`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Started listening for incoming messages',
      });
    });

    it('should get session info', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/telegram-user/session/${sessionId}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
      });
      expect(response.body.session).toMatchObject({
        id: sessionId,
        phoneNumber: '+79001234567',
        isAuthenticated: true,
        isConnected: true,
      });
    });

    it('should test mock message in development', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/telegram-user/test/mock-message')
        .send({
          phoneNumber: '+79001234567',
          message: 'Test message',
          chatId: '123456'
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Mock message processed',
      });
      expect(response.body.data).toMatchObject({
        from: '+79001234567',
        to: '123456',
        content: 'Test message',
        mode: 'development_test',
      });
    });

    it('should disconnect session', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/api/v1/telegram-user/session/${sessionId}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Session disconnected successfully',
      });
    });
  });

  // ===========================
  // WHATSAPP API TESTS
  // ===========================

  describe('WhatsApp Business API', () => {
    it('should verify webhook with correct token', async () => {
      const verifyToken = 'crm_verify_token_123';
      const challenge = 'test_challenge_123';

      const response = await request(app.getHttpServer())
        .get('/api/v1/whatsapp/webhook')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': verifyToken,
          'hub.challenge': challenge,
        })
        .expect(200);

      expect(response.text).toBe(challenge);
    });

    it('should reject webhook verification with wrong token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/whatsapp/webhook')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong_token',
          'hub.challenge': 'test_challenge_123',
        })
        .expect(403);
    });

    it('should send text message', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/whatsapp/send-message')
        .send({
          to: '79001234567',
          message: 'Integration test message from WhatsApp'
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Message sent successfully',
      });
      expect(response.body.messageId).toBeDefined();
      expect(response.body.whatsappId).toBeDefined();
      expect(response.body.status).toBe('sent');
    });

    it('should send template message', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/whatsapp/send-template')
        .send({
          to: '79001234567',
          templateName: 'hello_world',
          languageCode: 'ru'
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Template message sent successfully',
        template: 'hello_world',
      });
      expect(response.body.messageId).toBeDefined();
    });

    it('should send image', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/whatsapp/send-image')
        .send({
          to: '79001234567',
          imageUrl: 'https://via.placeholder.com/300x200.png',
          caption: 'Test image from integration test'
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Image sent successfully',
      });
      expect(response.body.messageId).toBeDefined();
    });

    it('should send document', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/whatsapp/send-document')
        .send({
          to: '79001234567',
          documentUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
          filename: 'test-document.pdf',
          caption: 'Test document from integration test'
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Document sent successfully',
      });
      expect(response.body.messageId).toBeDefined();
    });

    it('should process webhook message', async () => {
      const webhookPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456',
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '79001234567',
                    phone_number_id: '123456789'
                  },
                  messages: [
                    {
                      id: 'integration_test_msg_123',
                      from: '79007654321',
                      timestamp: '1640995200',
                      type: 'text',
                      text: {
                        body: 'Integration test incoming message'
                      }
                    }
                  ]
                }
              }
            ]
          }
        ]
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/whatsapp/webhook')
        .send(webhookPayload)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Webhook processed successfully',
      });
    });

    it('should test mock webhook in development', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/whatsapp/test/mock-webhook')
        .send({
          from: '79001234567',
          message: 'Integration test mock message'
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Mock webhook processed successfully',
        mode: 'development_test',
      });
      expect(response.body.payload).toBeDefined();
    });
  });

  // ===========================
  // MESSAGING HUB TESTS
  // ===========================

  describe('Messaging Hub Integration', () => {
    it('should process telegram webhook through messaging hub', async () => {
      const telegramWebhook = {
        update_id: 123,
        message: {
          message_id: 1,
          from: {
            id: 123456,
            first_name: 'Integration',
            last_name: 'Test'
          },
          chat: {
            id: 123456,
            type: 'private'
          },
          date: 1640995200,
          text: 'Integration test message via messaging hub'
        }
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/messaging/telegram/webhook')
        .send(telegramWebhook)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        service: 'Messaging Hub',
        message: 'Telegram webhook processed successfully',
      });
    });

    it('should process whatsapp webhook through messaging hub', async () => {
      const whatsappWebhook = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456',
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    phone_number_id: '123456'
                  },
                  messages: [
                    {
                      id: 'hub_integration_test_123',
                      from: '79001234567',
                      timestamp: '1640995200',
                      type: 'text',
                      text: {
                        body: 'Integration test message via messaging hub'
                      }
                    }
                  ]
                }
              }
            ]
          }
        ]
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/messaging/whatsapp/webhook')
        .send(whatsappWebhook)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        service: 'Messaging Hub',
        message: 'WhatsApp webhook processed successfully',
      });
    });

    it('should send message through messaging hub', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/messaging/send')
        .send({
          channelType: 'TELEGRAM',
          to: '@testuser',
          message: 'Integration test message via messaging hub',
          tenantId: '00000000-0000-0000-0000-000000000001'
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        service: 'Messaging Hub',
        message: 'Message sent successfully',
      });
      expect(response.body.messageId).toBeDefined();
    });

    it('should handle message delivery status', async () => {
      const statusUpdate = {
        externalId: 'test_message_123',
        status: 'delivered',
        timestamp: new Date().toISOString(),
        channelType: 'WHATSAPP'
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/messaging/status')
        .send(statusUpdate)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        service: 'Messaging Hub',
        message: 'Status update processed successfully',
      });
    });
  });

  // ===========================
  // ERROR HANDLING TESTS
  // ===========================

  describe('Error Handling', () => {
    it('should handle invalid telegram session', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/telegram-user/session/invalid-session-id')
        .expect(404);
    });

    it('should handle invalid phone number format', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/telegram-user/auth/initiate')
        .send({
          phoneNumber: 'invalid-phone'
        })
        .expect(400);
    });

    it('should handle missing required fields in whatsapp message', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/whatsapp/send-message')
        .send({
          message: 'Missing to field'
        })
        .expect(400);
    });

    it('should handle malformed webhook payload', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/messaging/telegram/webhook')
        .send({
          invalid: 'payload'
        })
        .expect(400);
    });

    it('should reject test endpoints in production mode', async () => {
      // Временно переключаем в production режим
      process.env.NODE_ENV = 'production';

      await request(app.getHttpServer())
        .post('/api/v1/telegram-user/test/mock-message')
        .send({
          phoneNumber: '+79001234567',
          message: 'Test message',
          chatId: '123456'
        })
        .expect(403);

      // Возвращаем обратно
      process.env.NODE_ENV = 'test';
    });
  });

  // ===========================
  // PERFORMANCE TESTS
  // ===========================

  describe('Performance Tests', () => {
    it('should handle multiple concurrent webhook requests', async () => {
      const requests: Promise<any>[] = [];
      const webhookPayload = {
        update_id: 123,
        message: {
          message_id: 1,
          from: { id: 123456, first_name: 'Performance', last_name: 'Test' },
          chat: { id: 123456, type: 'private' },
          date: 1640995200,
          text: 'Performance test message'
        }
      };

      // Отправляем 10 одновременных запросов
      for (let i = 0; i < 10; i++) {
        requests.push(
          request(app.getHttpServer())
            .post('/api/v1/messaging/telegram/webhook')
            .send({ ...webhookPayload, update_id: 123 + i })
            .expect(200)
        );
      }

      const responses: any[] = await Promise.all(requests);
      
      responses.forEach(response => {
        expect(response.body.success).toBe(true);
      });
    });

    it('should respond to health checks quickly', async () => {
      const start = Date.now();
      
      await request(app.getHttpServer())
        .get('/api/v1/messaging/health')
        .expect(200);
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100); // Должно отвечать менее чем за 100ms
    });
  });
});