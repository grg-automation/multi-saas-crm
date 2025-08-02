import { Module } from '@nestjs/common';
import { ManagerController } from './manager.controller';
import { ManagerService } from './manager.service';
import { TelegramUserModule } from '../telegram-user/telegram-user.module';
import { WebSocketModule } from '../websocket/websocket.module';

@Module({
  imports: [
    TelegramUserModule, // Для доступа к Telegram API
    WebSocketModule     // Для real-time обновлений
  ],
  controllers: [ManagerController],
  providers: [ManagerService],
  exports: [ManagerService]
})
export class ManagerModule {}