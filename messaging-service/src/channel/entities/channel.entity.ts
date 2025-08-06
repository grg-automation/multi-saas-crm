import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ChannelStatus, ChannelType } from '../../types/channel.types';

@Entity('channels')
export class ChannelEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true }) // Allow null for tenantId
  tenantId: string | null;

  @Column({ type: 'enum', enum: ChannelType })
  type: ChannelType;

  @Column()
  externalId: string;

  @Column({ type: 'enum', enum: ChannelStatus, default: ChannelStatus.ACTIVE })
  status: ChannelStatus;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastActivityAt: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  displayName: string;

  @Column({ type: 'text', nullable: true })
  metadata: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
