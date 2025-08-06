import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ChannelEntity } from '../../channel/entities/channel.entity';
import { ThreadPriority, ThreadStatus } from '../../types/thread.types';

@Entity('threads')
export class ThreadEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column('uuid')
  channelId: string;

  @Column({ type: 'varchar', length: 255 }) // Fix: Change to varchar for platform IDs
  contactId: string;

  @Column({ type: 'enum', enum: ThreadStatus, default: ThreadStatus.OPEN })
  status: ThreadStatus;

  @Column({ type: 'uuid', nullable: true })
  assignedTo: string;

  @Column({
    type: 'enum',
    enum: ThreadPriority,
    default: ThreadPriority.NORMAL,
  })
  priority: ThreadPriority;

  @Column({ nullable: true })
  subject: string;

  @Column({ default: 0 })
  messageCount: number;

  @Column({ default: 0 })
  unreadCount: number;

  @Column({ type: 'timestamp', nullable: true })
  lastMessageAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastCustomerMessageAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => ChannelEntity)
  channel: ChannelEntity;
}
