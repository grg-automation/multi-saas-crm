import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { MessageDirection } from '../types/message.types';
import { MessageEntity } from './entities/message.entity';

@Injectable()
export class MessageRepository {
  private readonly logger = new Logger(MessageRepository.name);

  constructor(
    @InjectRepository(MessageEntity)
    private readonly repo: Repository<MessageEntity>,
  ) {}

  async saveMessage(message: MessageEntity): Promise<MessageEntity> {
    this.logger.log(`💾 Saving message for thread: ${message.threadId}`);
    try {
      const savedMessage = await this.repo.save(message);
      this.logger.log(`✅ Message saved with ID: ${savedMessage.id}`);
      return savedMessage;
    } catch (error) {
      this.logger.error(`❌ Error saving message:`, error.message);
      throw error;
    }
  }

  async findByThreadId(
    threadId: string,
    page: number = 1,
    size: number = 50,
  ): Promise<MessageEntity[]> {
    this.logger.log(
      `🔍 Finding messages for thread: ${threadId}, page: ${page}, size: ${size}`,
    );

    try {
      const messages = await this.repo.find({
        where: { threadId },
        order: { sentAt: 'ASC' }, // Oldest first for chat display
        skip: (page - 1) * size,
        take: size,
      });

      this.logger.log(
        `✅ Found ${messages.length} messages for thread: ${threadId}`,
      );
      return messages;
    } catch (error) {
      this.logger.error(
        `❌ Error finding messages for thread ${threadId}:`,
        error.message,
      );
      throw error;
    }
  }

  async markThreadMessagesAsRead(
    threadId: string,
    userId: string,
  ): Promise<number> {
    this.logger.log(
      `📖 Marking unread messages as read for thread: ${threadId} by user: ${userId}`,
    );

    try {
      const result = await this.repo.update(
        {
          threadId,
          direction: MessageDirection.INBOUND, // Use enum
          readAt: IsNull(), // Use TypeORM IsNull() helper
        },
        {
          readAt: new Date(),
          status: 'READ',
        },
      );

      const affectedCount = result.affected || 0;
      this.logger.log(
        `✅ Marked ${affectedCount} messages as read in thread: ${threadId}`,
      );
      return affectedCount;
    } catch (error) {
      this.logger.error(
        `❌ Error marking messages as read for thread ${threadId}:`,
        error.message,
      );
      throw error;
    }
  }

  async findById(messageId: string): Promise<MessageEntity | null> {
    this.logger.log(`🔍 Finding message by ID: ${messageId}`);

    try {
      const message = await this.repo.findOne({ where: { id: messageId } });
      if (message) {
        this.logger.log(`✅ Found message: ${messageId}`);
      } else {
        this.logger.warn(`⚠️  Message not found: ${messageId}`);
      }
      return message;
    } catch (error) {
      this.logger.error(
        `❌ Error finding message ${messageId}:`,
        error.message,
      );
      throw error;
    }
  }

  async countUnreadByThreadId(threadId: string): Promise<number> {
    this.logger.log(`🔢 Counting unread messages for thread: ${threadId}`);

    try {
      const count = await this.repo.count({
        where: {
          threadId,
          direction: MessageDirection.INBOUND,
          readAt: IsNull(),
        },
      });

      this.logger.log(
        `✅ Found ${count} unread messages in thread: ${threadId}`,
      );
      return count;
    } catch (error) {
      this.logger.error(
        `❌ Error counting unread messages for thread ${threadId}:`,
        error.message,
      );
      throw error;
    }
  }

  async deleteMessage(messageId: string): Promise<boolean> {
    this.logger.log(`🗑️  Deleting message: ${messageId}`);

    try {
      const result = await this.repo.delete(messageId);
      const deleted = (result.affected || 0) > 0;

      if (deleted) {
        this.logger.log(`✅ Message deleted: ${messageId}`);
      } else {
        this.logger.warn(`⚠️  Message not found for deletion: ${messageId}`);
      }

      return deleted;
    } catch (error) {
      this.logger.error(
        `❌ Error deleting message ${messageId}:`,
        error.message,
      );
      throw error;
    }
  }

  // Get latest message for a thread (useful for thread previews)
  async findLatestByThreadId(threadId: string): Promise<MessageEntity | null> {
    this.logger.log(`🔍 Finding latest message for thread: ${threadId}`);

    try {
      const message = await this.repo.findOne({
        where: { threadId },
        order: { sentAt: 'DESC' },
      });

      if (message) {
        this.logger.log(`✅ Found latest message for thread: ${threadId}`);
      }
      return message;
    } catch (error) {
      this.logger.error(
        `❌ Error finding latest message for thread ${threadId}:`,
        error.message,
      );
      throw error;
    }
  }
}
