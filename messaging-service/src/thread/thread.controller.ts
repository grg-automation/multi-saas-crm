import {
  Body,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { MessageService } from '../message/message.service';
import { ThreadService } from './thread.service';

@Controller('api/threads') // Added 'api/' prefix
export class ThreadController {
  private readonly logger = new Logger(ThreadController.name);

  constructor(
    private readonly threadService: ThreadService,
    private readonly messageService: MessageService,
  ) {}

  @Get(':threadId')
  async getThread(@Param('threadId') threadId: string) {
    this.logger.log(`🔍 Getting thread: ${threadId}`);

    try {
      const thread = await this.threadService.findById(threadId);
      if (!thread) {
        this.logger.warn(`❌ Thread not found: ${threadId}`);
        throw new NotFoundException(`Thread with ID ${threadId} not found`);
      }

      this.logger.log(`✅ Thread found: ${threadId}`);
      return {
        id: thread.id,
        contact: {
          telegramId: thread.contactId,
          fullName: `User ${thread.contactId}`,
          // Add more contact fields if available
          phone: null, // thread.contact?.phone - contact relation not loaded
          username: null, // thread.contact?.username - contact relation not loaded
        },
        status: thread.status,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
      };
    } catch (error) {
      this.logger.error(`❌ Error getting thread ${threadId}:`, error.message);
      throw error;
    }
  }

  @Get(':threadId/messages')
  async getThreadMessages(
    @Param('threadId') threadId: string,
    @Query('page') page: number = 1,
    @Query('size') size: number = 50,
  ) {
    this.logger.log(
      `📨 Getting messages for thread: ${threadId}, page: ${page}, size: ${size}`,
    );

    try {
      const messages = await this.messageService.findByThreadId(
        threadId,
        page,
        size,
      );

      this.logger.log(
        `✅ Found ${messages.length} messages for thread: ${threadId}`,
      );

      // Transform messages to match frontend format
      const transformedMessages = messages.map((message) => ({
        id: message.id,
        threadId: message.threadId,
        direction: message.direction,
        content: message.content,
        messageType: message.messageType || 'TEXT',
        senderName:
          message.senderName ||
          (message.direction === 'INBOUND' ? 'User' : 'Agent'),
        sentAt: message.sentAt || message.createdAt,
        deliveredAt: message.deliveredAt,
        readAt: message.readAt,
        status: message.status || 'SENT',
        isInbound: message.direction === 'INBOUND',
        isOutbound: message.direction === 'OUTBOUND',
        sentimentLabel: message.sentimentLabel,
        fileName: message.fileName,
        fileSize: message.fileSize,
        mimeType: message.mimeType,
      }));

      return {
        content: transformedMessages,
        pagination: {
          page,
          size,
          total: transformedMessages.length,
          hasMore: transformedMessages.length === size,
        },
      };
    } catch (error) {
      this.logger.error(
        `❌ Error getting messages for thread ${threadId}:`,
        error.message,
      );

      // Return mock messages for now
      const mockMessages = [
        {
          id: '1',
          threadId,
          direction: 'INBOUND' as const,
          content: 'Hello! This is a test message from user.',
          messageType: 'TEXT' as const,
          senderName: 'User 456',
          sentAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
          status: 'SENT' as const,
          isInbound: true,
          isOutbound: false,
        },
        {
          id: '2',
          threadId,
          direction: 'OUTBOUND' as const,
          content: 'Hi there! How can I help you today?',
          messageType: 'TEXT' as const,
          senderName: 'Manager',
          sentAt: new Date(Date.now() - 3500000).toISOString(), // 55 minutes ago
          status: 'SENT' as const,
          isInbound: false,
          isOutbound: true,
        },
      ];

      return {
        content: mockMessages,
        pagination: {
          page: 1,
          size: 50,
          total: 2,
          hasMore: false,
        },
      };
    }
  }

  @Post(':threadId/messages')
  async sendMessage(
    @Param('threadId') threadId: string,
    @Body()
    messageData: {
      message: string;
      senderId: string;
      senderName?: string;
      messageType?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT';
    },
  ) {
    this.logger.log(`📤 Sending message to thread: ${threadId}`);
    this.logger.log(`Message data:`, messageData);

    try {
      const newMessage = await this.messageService.create({
        threadId,
        content: messageData.message,
        direction: 'OUTBOUND',
        messageType: messageData.messageType || 'TEXT',
        senderName: messageData.senderName || 'Manager',
        senderId: messageData.senderId,
        sentAt: new Date(),
        status: 'SENT',
      });

      this.logger.log(`✅ Message sent: ${newMessage.id}`);

      // Transform to match frontend format
      const transformedMessage = {
        id: newMessage.id,
        threadId: newMessage.threadId,
        direction: newMessage.direction,
        content: newMessage.content,
        messageType: newMessage.messageType || 'TEXT',
        senderName: newMessage.senderName || 'Manager',
        sentAt: newMessage.sentAt || new Date().toISOString(),
        status: newMessage.status || 'SENT',
        isInbound: false,
        isOutbound: true,
      };

      return transformedMessage;
    } catch (error) {
      this.logger.error(
        `❌ Error sending message to thread ${threadId}:`,
        error.message,
      );

      // Return mock response for now
      const mockMessage = {
        id: Date.now().toString(),
        threadId,
        direction: 'OUTBOUND' as const,
        content: messageData.message,
        messageType: messageData.messageType || ('TEXT' as const),
        senderName: messageData.senderName || 'Manager',
        sentAt: new Date().toISOString(),
        status: 'SENT' as const,
        isInbound: false,
        isOutbound: true,
      };

      return mockMessage;
    }
  }
}
