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

@Controller('thread')
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
      // Add DB connection check
      const messages = await this.messageService.findByThreadId(
        threadId,
        page,
        size,
      );
      this.logger.log(
        `✅ Found ${messages.length} messages for thread: ${threadId}`,
      );

      return {
        content: messages.map((msg) => ({
          id: msg.id,
          threadId: msg.threadId,
          content: msg.content,
          senderId: msg.senderId,
          senderName: msg.senderName || 'Unknown',
          timestamp: msg.sentAt,
          direction: msg.direction,
          messageType: msg.messageType,
        })),
        pagination: {
          page,
          size,
          total: messages.length,
          hasMore: messages.length === size,
        },
      };
    } catch (error) {
      this.logger.error(`❌ Error getting messages:`, error);
      throw error;
    }
  }

  @Post(':threadId/messages')
  async sendMessage(
    @Param('threadId') threadId: string,
    @Body()
    messageData: {
      content?: string;
      message?: string; // Support both formats
      senderId: string;
      senderName?: string;
      messageType?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT';
    },
  ) {
    this.logger.log(`📤 Sending message to thread: ${threadId}`);
    this.logger.log(`Message data:`, messageData);

    // Support both content and message fields
    const messageContent = messageData.content || messageData.message;
    
    if (!messageContent) {
      this.logger.error('❌ No message content provided');
      return { error: 'Message content is required' };
    }

    try {
      // 1. Save message to database first
      const newMessage = await this.messageService.create({
        threadId,
        content: messageContent,
        direction: 'OUTBOUND',
        messageType: messageData.messageType || 'TEXT',
        senderName: messageData.senderName || 'Manager',
        senderId: messageData.senderId,
        sentAt: new Date(),
        status: 'SENT', // Mark as sent immediately for better UX
      });

      this.logger.log(`✅ Message saved to database: ${newMessage.id}`);

      // 2. Try to send to Telegram if this is a Telegram thread
      await this.sendToTelegramIfNeeded(threadId, messageContent, newMessage.id);

      // 3. Transform to match frontend format
      const transformedMessage = {
        id: newMessage.id,
        threadId: newMessage.threadId,
        direction: newMessage.direction,
        content: newMessage.content,
        senderId: newMessage.senderId,
        senderName: newMessage.senderName || 'Manager',
        timestamp: newMessage.sentAt || new Date().toISOString(),
        messageType: newMessage.messageType || 'TEXT',
        sentAt: newMessage.sentAt || new Date().toISOString(),
        status: 'SENT', // Show as sent to user immediately
        isInbound: false,
        isOutbound: true,
      };

      return transformedMessage;
    } catch (error) {
      this.logger.error(
        `❌ Error sending message to thread ${threadId}:`,
        error.message,
      );

      // Create a basic message entry even if main creation fails
      const fallbackMessage = {
        id: Date.now().toString(),
        threadId,
        direction: 'OUTBOUND' as const,
        content: messageContent,
        senderId: messageData.senderId,
        senderName: messageData.senderName || 'Manager',
        timestamp: new Date().toISOString(),
        messageType: messageData.messageType || ('TEXT' as const),
        sentAt: new Date().toISOString(),
        status: 'SENT' as const,
        isInbound: false,
        isOutbound: true,
      };

      this.logger.log(`⚠️ Returning fallback message:`, fallbackMessage);
      return fallbackMessage;
    }
  }

  private async sendToTelegramIfNeeded(threadId: string, messageContent: string, messageId: string) {
    try {
      // Get thread details to check if it's a Telegram thread
      const thread = await this.threadService.findById(threadId);
      if (!thread) {
        this.logger.warn(`Thread ${threadId} not found, skipping Telegram send`);
        return;
      }

      // Check if this thread is associated with a Telegram channel
      // For now, we'll check if contactId looks like a Telegram user ID (numeric)
      const telegramUserId = thread.contactId;
      if (!telegramUserId || !/^\d+$/.test(telegramUserId)) {
        this.logger.log(`Thread ${threadId} contactId '${telegramUserId}' is not a Telegram user ID, skipping Telegram send`);
        return;
      }

      this.logger.log(`🤖 Attempting to send message to Telegram user: ${telegramUserId}`);

      // Call notification-service to send via Telegram (auto-select session)
      try {
        const response = await fetch('http://localhost:3004/telegram-user/send-message-auto', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chatId: telegramUserId,
            message: messageContent,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          this.logger.log(`✅ Message sent to Telegram successfully:`, result);
          
          // Update message status to SENT
          // TODO: Update message status in database when MessageService supports it
          
        } else {
          const errorData = await response.json();
          this.logger.error(`❌ Failed to send to Telegram:`, errorData);
        }
      } catch (telegramError) {
        this.logger.error(`❌ Telegram send error:`, telegramError.message);
        // Don't throw error here - message was already saved to DB
      }
    } catch (error) {
      this.logger.error(`❌ Error in sendToTelegramIfNeeded:`, error);
      // Don't throw error here - message was already saved to DB
    }
  }

  @Get()
  async getAllThreads(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    this.logger.log('📋 Getting all threads');
    return this.threadService.findAllWithPagination(page, limit);
  }
}
