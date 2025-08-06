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

  // Add this method to your thread.service.ts

  async resetUnreadCount(threadId: string): Promise<void> {
    try {
      // TODO: Replace with your actual database update
      // Example with TypeORM:
      // await this.threadEntityRepository.update(
      //   { id: threadId },
      //   { unreadCount: 0 }
      // );

      this.logger.log(`✅ Reset unread count for thread: ${threadId}`);
    } catch (error) {
      this.logger.error(
        `❌ Error resetting unread count for thread ${threadId}:`,
        error.message,
      );
      throw error;
    }
  }
}
