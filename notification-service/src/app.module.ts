import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { NotificationsModule } from './notifications/notifications.module';
import { MessagingModule } from './messaging/messaging.module';
import { TelegramUserModule } from './telegram-user/telegram-user.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { WebSocketModule } from './websocket/websocket.module';
import { ManagerModule } from './manager/manager.module';
import { AdminModule } from './admin/admin.module';
import { TelegramSessionEntity } from './telegram-user/entities/telegram-session.entity';

@Module({
  imports: [
    // Configuration module
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Database module
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DATABASE_HOST', 'localhost'),
        port: +configService.get('DATABASE_PORT', 5432),
        username: configService.get('DATABASE_USER', 'crm_user'),
        password: configService.get('DATABASE_PASSWORD', 'crm_password'),
        database: configService.get('DATABASE_NAME', 'crm_messaging_dev'),
        entities: [TelegramSessionEntity],
        synchronize: configService.get('NODE_ENV') !== 'production', // Автоматическая синхронизация схемы в dev режиме
        logging: configService.get('NODE_ENV') === 'development',
      }),
      inject: [ConfigService],
    }),

    // Feature modules
    NotificationsModule,
    MessagingModule, // New messaging hub module
    TelegramUserModule, // Telegram User API module
    WhatsAppModule, // WhatsApp Business API module
    WebSocketModule, // WebSocket Gateway for real-time updates
    ManagerModule, // Manager API with anonymized data
    AdminModule, // Admin API with proxy to CRM service
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
