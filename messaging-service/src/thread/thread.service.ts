import { Injectable, Logger } from '@nestjs/common';
import { ThreadPriority, ThreadStatus } from '../types/thread.types';
import { ThreadEntity } from './entities/thread.entity';
import { ThreadRepository } from './thread.repository';

@Injectable()
export class ThreadService {
  private readonly logger = new Logger(ThreadService.name);

  constructor(private readonly threadRepo: ThreadRepository) {}

  async createOrUpdateThread(
    tenantId: string | null,
    channelId: string,
    contactId: string,
    externalId: string,
  ): Promise<ThreadEntity> {
    let thread = await this.threadRepo.findByTenantIdAndChannelIdAndContactId(
      tenantId,
      channelId,
      contactId,
    );
    if (!thread) {
      thread = new ThreadEntity();
      thread.tenantId = tenantId || null;
      thread.channelId = channelId;
      thread.contactId = contactId;
      thread.status = ThreadStatus.OPEN;
      thread.priority = ThreadPriority.NORMAL;
      thread = await this.threadRepo.save(thread);
    }
    return thread;
  }

  async incrementUnreadCount(
    threadId: string,
    lastMessageAt: Date,
  ): Promise<void> {
    await this.threadRepo.incrementUnreadCount(threadId, lastMessageAt);
  }

  async findById(threadId: string): Promise<ThreadEntity | null> {
    return this.threadRepo.findById(threadId);
  }

  async resetUnreadCount(threadId: string): Promise<void> {
    try {
      this.logger.log(`✅ Reset unread count for thread: ${threadId}`);
    } catch (error) {
      this.logger.error(
        `❌ Error resetting unread count for thread ${threadId}:`,
        error.message,
      );
      throw error;
    }
  }

  async findAll(): Promise<ThreadEntity[]> {
    try {
      this.logger.log('📋 Fetching all threads');
      const threads = await this.threadRepo.findAll();
      return threads;
    } catch (error) {
      this.logger.error('❌ Error fetching all threads:', error.message);
      throw error;
    }
  }

  async findAllWithPagination(page: number = 1, limit: number = 10) {
    try {
      this.logger.log(`📋 Fetching threads page ${page} with limit ${limit}`);
      const [threads, total] = await this.threadRepo.findAllWithPagination(
        page,
        limit,
      );

      return {
        threads,
        metadata: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error('❌ Error fetching paginated threads:', error.message);
      throw error;
    }
  }
}
