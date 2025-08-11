import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, IsNull, Repository } from 'typeorm';
import { ThreadStatus } from '../types/thread.types';
import { ThreadEntity } from './entities/thread.entity';

@Injectable()
export class ThreadRepository {
  constructor(
    @InjectRepository(ThreadEntity)
    private readonly repo: Repository<ThreadEntity>,
  ) {}

  async save(thread: ThreadEntity): Promise<ThreadEntity> {
    return this.repo.save(thread);
  }

  async findById(id: string): Promise<ThreadEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByTenantIdAndChannelIdAndContactId(
    tenantId: string | null,
    channelId: string,
    contactId: string,
  ): Promise<ThreadEntity | null> {
    const where: FindOptionsWhere<ThreadEntity> = {
      tenantId: tenantId ? tenantId : IsNull(),
      channelId,
      contactId,
    };
    return this.repo.findOne({ where });
  }

  async incrementUnreadCount(
    threadId: string,
    lastMessageAt: Date,
  ): Promise<void> {
    await this.repo.update(
      { id: threadId },
      {
        unreadCount: () => 'unreadCount + 1',
        lastMessageAt,
        lastCustomerMessageAt: lastMessageAt, // Assuming customer message for inbound
      },
    );
  }

  async findByTenantIdAndStatusOrderByLastMessageAtDesc(
    tenantId: string | null,
    status: ThreadStatus,
    limit: number,
    offset: number,
  ): Promise<ThreadEntity[]> {
    const where: FindOptionsWhere<ThreadEntity> = {
      tenantId: tenantId ? tenantId : IsNull(),
      status,
    };
    return this.repo.find({
      where,
      order: { lastMessageAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  async updateThreadStatus(
    threadId: string,
    status: ThreadStatus,
  ): Promise<void> {
    await this.repo.update({ id: threadId }, { status });
  }

  async findAll(): Promise<ThreadEntity[]> {
    return this.repo.find({
      order: {
        lastMessageAt: 'DESC',
        createdAt: 'DESC',
      },
      relations: ['channel'], // Include channel relationship if it exists
    });
  }

  async findAllWithPagination(
    page: number = 1,
    limit: number = 10,
  ): Promise<[ThreadEntity[], number]> {
    return this.repo.findAndCount({
      order: {
        lastMessageAt: 'DESC',
        createdAt: 'DESC',
      },
      take: limit,
      skip: (page - 1) * limit,
      relations: ['channel'],
    });
  }
}
