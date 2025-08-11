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
  cors: { origin: 'http://localhost:3009' }, // Frontend URL for Next.js
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

  @SubscribeMessage('join_thread')
  handleJoinThread(client: Socket, threadId: string) {
    this.logger.log(`Client ${client.id} joined thread: ${threadId}`);
    client.join(`thread_${threadId}`);
    client.emit('joined_thread', { threadId });
  }

  @SubscribeMessage('leave_thread')
  handleLeaveThread(client: Socket, threadId: string) {
    this.logger.log(`Client ${client.id} left thread: ${threadId}`);
    client.leave(`thread_${threadId}`);
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(client: Socket, messageData: any) {
    this.logger.log(`Message from client ${client.id}:`, messageData);
    
    try {      
      // Broadcast to thread participants (excluding sender to avoid duplicates)
      if (messageData.threadId) {
        const broadcastData = {
          id: messageData.id || Date.now().toString(),
          threadId: messageData.threadId,
          content: messageData.content,
          senderId: messageData.senderId,
          senderName: messageData.senderName || 'Manager',
          timestamp: messageData.timestamp || new Date().toISOString(),
          direction: 'outbound'
        };
        
        // Broadcast to all clients in the thread EXCEPT the sender
        client.to(`thread_${messageData.threadId}`).emit('new_message', broadcastData);
        client.emit('message_sent', { success: true, messageId: broadcastData.id });
        
        this.logger.log(`✅ Broadcasted message to thread_${messageData.threadId} (excluding sender)`);
      }
    } catch (error) {
      this.logger.error('Error handling send_message:', error);
      client.emit('message_sent', { success: false, error: error.message });
    }
  }

  sendToSession(sessionId: string, payload: any) {
    this.logger.log(`Emitted ${payload.type} to session ${sessionId}`);
    this.server.to(sessionId).emit(payload.type, payload.data);
  }

  // Method to broadcast new messages to thread participants
  broadcastToThread(threadId: string, messageData: any) {
    this.logger.log(`Broadcasting message to thread: ${threadId}`);
    this.server.to(`thread_${threadId}`).emit('new_message', messageData);
  }

  // Method to notify about message status updates
  broadcastMessageStatus(threadId: string, statusData: any) {
    this.logger.log(`Broadcasting status update to thread: ${threadId}`);
    this.server.to(`thread_${threadId}`).emit('message_status', statusData);
  }
}
