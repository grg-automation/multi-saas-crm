import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: { origin: 'http://localhost:3001' }, // Frontend URL for Next.js
  pingInterval: 10000, // Send ping every 10s
  pingTimeout: 20000, // Wait 20s for pong
  connectTimeout: 30000, // Allow 30s for connection
})
export class MessagingWebSocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private logger = new Logger(MessagingWebSocketGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(client: Socket, sessionId: string) {
    this.logger.log(`Client ${client.id} subscribed to ${sessionId}`);
    client.join(sessionId);
    client.emit('subscribed', { sessionId });
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(client: Socket, sessionId: string) {
    this.logger.log(`Client ${client.id} unsubscribed from ${sessionId}`);
    client.leave(sessionId);
  }

  sendToSession(sessionId: string, payload: any) {
    this.logger.log(`Emitted ${payload.type} to session ${sessionId}`);
    this.server.to(sessionId).emit(payload.type, payload.data);
  }
}
