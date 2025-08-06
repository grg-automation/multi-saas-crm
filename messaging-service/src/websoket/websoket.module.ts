import { Module } from '@nestjs/common';
import { MessagingWebSocketGateway } from './websoket.gateway';

@Module({
  providers: [MessagingWebSocketGateway],
  exports: [MessagingWebSocketGateway],
})
export class WebSocketModule {}
