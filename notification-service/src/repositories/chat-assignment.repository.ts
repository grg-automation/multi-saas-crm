import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { ChatAssignmentEntity } from '../entities/chat-assignment.entity';

@Injectable()
export class ChatAssignmentRepository extends Repository<ChatAssignmentEntity> {
  constructor(private dataSource: DataSource) {
    super(ChatAssignmentEntity, dataSource.createEntityManager());
  }

  /**
   * Получить активные назначения чатов для менеджера
   */
  async findActiveAssignmentsByManagerId(managerId: string): Promise<ChatAssignmentEntity[]> {
    return this.find({
      where: {
        managerId,
        isActive: true
      },
      order: {
        assignedAt: 'DESC'
      }
    });
  }

  /**
   * Получить уникальные thread_id для менеджера (без дубликатов)
   */
  async findUniqueAssignedThreadIds(managerId: string): Promise<string[]> {
    const assignments = await this.createQueryBuilder('ca')
      .select('DISTINCT ca.thread_id', 'threadId')
      .where('ca.manager_id = :managerId', { managerId })
      .andWhere('ca.is_active = :isActive', { isActive: true })
      .getRawMany();

    return assignments.map(assignment => assignment.threadId);
  }

  /**
   * Подсчитать количество уникальных назначенных чатов
   */
  async countUniqueAssignedChats(managerId: string): Promise<number> {
    const result = await this.createQueryBuilder('ca')
      .select('COUNT(DISTINCT ca.thread_id)', 'count')
      .where('ca.manager_id = :managerId', { managerId })
      .andWhere('ca.is_active = :isActive', { isActive: true })
      .getRawOne();

    return parseInt(result.count, 10);
  }
}