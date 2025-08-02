import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';

/**
 * WhatsApp Business API Module
 * 
 * Предоставляет полную интеграцию с WhatsApp Business API:
 * - Отправка текстовых сообщений
 * - Отправка медиа файлов (изображения, документы, видео, аудио)
 * - Отправка шаблонных сообщений
 * - Обработка webhook'ов для входящих сообщений
 * - Обработка статусов доставки сообщений
 * - Верификация webhook'ов
 * - Загрузка и обработка медиа файлов
 * 
 * Поддерживает как DEV режим (с заглушками), так и полную PROD интеграцию
 * с WhatsApp Business API через Facebook Graph API.
 */

@Module({
  imports: [
    ConfigModule, // Для доступа к переменным окружения
  ],
  controllers: [WhatsAppController],
  providers: [WhatsAppService],
  exports: [WhatsAppService], // Экспортируем сервис для использования в других модулях
})
export class WhatsAppModule {}