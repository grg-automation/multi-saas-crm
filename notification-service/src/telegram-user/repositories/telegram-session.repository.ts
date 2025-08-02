import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TelegramSessionEntity } from '../entities/telegram-session.entity';
import { TelegramSessionV2 } from '../telegram-service-v2';

/**
 * Репозиторий для работы с Telegram сессиями в базе данных
 */
@Injectable()
export class TelegramSessionRepository {
  constructor(
    @InjectRepository(TelegramSessionEntity)
    private readonly sessionRepository: Repository<TelegramSessionEntity>,
  ) {}

  /**
   * Сохранить или обновить сессию
   */
  async saveSession(session: TelegramSessionV2, tenantId?: string): Promise<TelegramSessionEntity> {
    // Проверяем существует ли сессия
    let entity = await this.sessionRepository.findOne({
      where: { sessionId: session.id }
    });

    if (entity) {
      // Обновляем существующую сессию
      entity.phoneNumber = session.phoneNumber;
      entity.userId = session.userId || null;
      entity.isAuthenticated = session.isAuthenticated;
      entity.isConnected = session.isConnected;
      entity.sessionString = session.sessionString || null;
      entity.lastActivity = session.lastActivity;
      entity.tenantId = tenantId || null;
    } else {
      // Создаем новую сессию
      entity = this.sessionRepository.create({
        sessionId: session.id,
        phoneNumber: session.phoneNumber,
        userId: session.userId || null,
        isAuthenticated: session.isAuthenticated,
        isConnected: session.isConnected,
        sessionString: session.sessionString || null,
        lastActivity: session.lastActivity,
        tenantId: tenantId || null,
      });
    }

    return await this.sessionRepository.save(entity);
  }

  /**
   * Получить сессию по ID
   */
  async getSession(sessionId: string): Promise<TelegramSessionEntity | null> {
    return await this.sessionRepository.findOne({
      where: { sessionId }
    });
  }

  /**
   * Получить все сессии для тенанта
   */
  async getSessionsByTenant(tenantId?: string): Promise<TelegramSessionEntity[]> {
    const whereCondition = tenantId ? { tenantId } : {};
    return await this.sessionRepository.find({
      where: whereCondition,
      order: { lastActivity: 'DESC' }
    });
  }

  /**
   * Получить все аутентифицированные сессии
   */
  async getAuthenticatedSessions(tenantId?: string): Promise<TelegramSessionEntity[]> {
    const whereCondition: any = { isAuthenticated: true };
    if (tenantId) {
      whereCondition.tenantId = tenantId;
    }
    
    return await this.sessionRepository.find({
      where: whereCondition,
      order: { lastActivity: 'DESC' }
    });
  }

  /**
   * Получить сессию по номеру телефона
   */
  async getSessionByPhone(phoneNumber: string, tenantId?: string): Promise<TelegramSessionEntity | null> {
    const whereCondition: any = { phoneNumber };
    if (tenantId) {
      whereCondition.tenantId = tenantId;
    }
    
    return await this.sessionRepository.findOne({
      where: whereCondition
    });
  }

  /**
   * Обновить статус подключения сессии
   */
  async updateConnectionStatus(sessionId: string, isConnected: boolean): Promise<void> {
    await this.sessionRepository.update(
      { sessionId },
      { 
        isConnected,
        lastActivity: new Date()
      }
    );
  }

  /**
   * Удалить сессию
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.sessionRepository.delete({ sessionId });
  }

  /**
   * Удалить неактивные сессии (старше определенного времени)
   */
  async deleteInactiveSessions(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await this.sessionRepository.delete({
      lastActivity: { $lt: cutoffDate } as any,
      isAuthenticated: false
    });

    return result.affected || 0;
  }

  /**
   * Конвертировать Entity в интерфейс TelegramSessionV2
   */
  entityToSession(entity: TelegramSessionEntity): TelegramSessionV2 {
    return {
      id: entity.sessionId,
      phoneNumber: entity.phoneNumber,
      userId: entity.userId || undefined,
      isAuthenticated: entity.isAuthenticated,
      isConnected: entity.isConnected,
      sessionString: entity.sessionString || undefined,
      lastActivity: entity.lastActivity
    };
  }
}