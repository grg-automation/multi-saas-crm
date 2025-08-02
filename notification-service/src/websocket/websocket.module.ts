import { Module } from '@nestjs/common';
import { MessagingWebSocketGateway } from './websocket.gateway';

@Module({
  providers: [MessagingWebSocketGateway],
  exports: [MessagingWebSocketGateway],
})
export class WebSocketModule {}