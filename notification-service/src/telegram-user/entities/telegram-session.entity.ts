import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * Entity для хранения Telegram сессий в базе данных
 * Обеспечивает персистентность сессий при перезапуске контейнеров
 */
@Entity('telegram_sessions')
export class TelegramSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  sessionId: string;

  @Column({ type: 'varchar', length: 20 })
  phoneNumber: string;

  @Column({ type: 'bigint', nullable: true })
  userId: number | null;

  @Column({ type: 'boolean', default: false })
  isAuthenticated: boolean;

  @Column({ type: 'boolean', default: false })
  isConnected: boolean;

  @Column({ type: 'text', nullable: true })
  sessionString: string | null; // GramJS сессия в строковом формате

  @Column({ type: 'varchar', length: 100, nullable: true })
  tenantId: string | null; // Для мульти-тенантности CRM

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  lastActivity: Date;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any>; // Дополнительные данные (имя пользователя, аватар и т.д.)

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}