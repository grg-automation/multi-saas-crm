import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChannelModule } from './channel/channel.module';
import { MessageModule } from './message/message.module';
import { ThreadModule } from './thread/thread.module';
import { WebhookModule } from './webhook/webhook.module';
import { WebSocketModule } from './websoket/websoket.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DATABASE_HOST', 'localhost'),
        port: +configService.get('DATABASE_PORT', 5432),
        username: configService.get('DATABASE_USER', 'crm_user'),
        password: configService.get('DATABASE_PASSWORD', 'crm_password'),
        database: configService.get('DATABASE_NAME', 'crm_messaging_dev'),
        entities: ['dist/**/*.entity{.ts,.js}'],
        // synchronize: configService.get('NODE_ENV') !== 'production',
        synchronize: false,
        migrationsRun: true, // Add for prod migrations
      }),
      inject: [ConfigService],
    }),
    ChannelModule,
    ThreadModule,
    MessageModule,
    WebhookModule,
    WebSocketModule,
  ],
})
export class AppModule {}
