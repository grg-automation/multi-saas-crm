import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ThreadEntity } from '../../thread/entities/thread.entity';
import { MessageDirection, MessageType } from '../../types/message.types';

@Entity('messages')
export class MessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column('uuid')
  threadId: string;

  @Column({ type: 'enum', enum: MessageDirection })
  direction: MessageDirection;

  @Column({ type: 'text', nullable: true })
  externalId: string;

  @Column({ type: 'text', nullable: true })
  platformMessageId: string;

  @Column({ type: 'text', nullable: true })
  platformThreadId: string;

  @Column('text')
  content: string;

  @Column({ type: 'enum', enum: MessageType })
  messageType: MessageType;

  @Column({ type: 'timestamp' })
  sentAt: Date;

  @Column({ type: 'text', nullable: true })
  attachments: string | null;

  @Column({ type: 'text', nullable: true })
  metadata: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'text', nullable: true })
  senderName: string | null;

  @Column({ type: 'text', nullable: true })
  senderId: string | null;

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  readAt: Date | null;

  @Column({ type: 'text', default: 'SENT' })
  status: string;

  @Column({ type: 'text', nullable: true })
  sentimentLabel: string | null;

  @Column({ type: 'text', nullable: true })
  fileName: string | null;

  @Column({ type: 'int', nullable: true })
  fileSize: number | null;

  @Column({ type: 'text', nullable: true })
  mimeType: string | null;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => ThreadEntity)
  thread: ThreadEntity;

  get isInbound(): boolean {
    return this.direction === MessageDirection.INBOUND;
  }

  get isOutbound(): boolean {
    return this.direction === MessageDirection.OUTBOUND;
  }
}
