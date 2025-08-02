import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
// import { TelegramUserController } from './telegram-user.controller'; // V1 ОТКЛЮЧЕН
// import { TelegramUserService } from './telegram-user.service'; // V1 ОТКЛЮЧЕН  
// import { TelegramPollingService } from './telegram-polling.service'; // V1 ОТКЛЮЧЕН
import { TelegramServiceV2 } from './telegram-service-v2';
import { TelegramControllerV2 } from './telegram-controller-v2';
import { TelegramSessionRepository } from './repositories/telegram-session.repository';
import { TelegramSessionEntity } from './entities/telegram-session.entity';
import { SessionTestService } from './session-test.service';
import { WebSocketModule } from '../websocket/websocket.module';

/**
 * Telegram User API Module
 * 
 * Предоставляет функциональность для работы с Telegram User API
 * Поддерживает две версии:
 * 
 * V1 (Legacy): @mtproto/core - сложная низкоуровневая реализация
 * V2 (Modern): GramJS - простая высокоуровневая реализация
 * 
 * Особенности:
 * - Аутентификация через номер телефона + SMS код
 * - Отправка сообщений от имени пользователя
 * - Получение списка чатов пользователя
 * - Прослушивание входящих сообщений
 * - Поддержка множественных сессий
 * - Загрузка/скачивание файлов любого размера
 */

@Module({
  imports: [
    ConfigModule, // Для доступа к переменным окружения
    TypeOrmModule.forFeature([TelegramSessionEntity]), // Подключение Entity для работы с базой данных
    WebSocketModule, // Для real-time обновлений
  ],
  controllers: [
    // TelegramUserController,    // V1 - Legacy MTProto controller (ОТКЛЮЧЕН)
    TelegramControllerV2       // V2 - Modern GramJS controller (ОСНОВНОЙ)
  ],
  providers: [
    // TelegramUserService,       // V1 - Legacy MTProto service (ОТКЛЮЧЕН)
    // TelegramPollingService,    // V1 - Polling for real-time updates (ОТКЛЮЧЕН)
    TelegramServiceV2,         // V2 - Modern GramJS service (ОСНОВНОЙ)
    TelegramSessionRepository, // Репозиторий для работы с сессиями в базе данных
    SessionTestService         // Тестовый сервис для демонстрации формата сессий
  ],
  exports: [
    // TelegramUserService,       // Export V1 for backward compatibility (ОТКЛЮЧЕН)
    // TelegramPollingService,    // Export polling service (ОТКЛЮЧЕН)
    TelegramServiceV2,         // Export V2 for new integrations (ОСНОВНОЙ)
    // TelegramSessionRepository  // ВРЕМЕННО ОТКЛЮЧЕНО
  ],
})
export class TelegramUserModule {}