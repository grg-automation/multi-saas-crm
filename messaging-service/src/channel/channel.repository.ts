import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, IsNull, Repository } from 'typeorm';
import { ChannelType } from '../types/channel.types';
import { ChannelEntity } from './entities/channel.entity';

@Injectable()
export class ChannelRepository {
  constructor(
    @InjectRepository(ChannelEntity)
    private readonly repo: Repository<ChannelEntity>,
  ) {}

  async save(channel: ChannelEntity): Promise<ChannelEntity> {
    return this.repo.save(channel);
  }

  async findByTenantIdAndIsActiveTrue(
    tenantId: string | null,
  ): Promise<ChannelEntity[]> {
    const where: FindOptionsWhere<ChannelEntity> = {
      isActive: true,
      tenantId: tenantId ? tenantId : IsNull(),
    };
    return this.repo.find({ where });
  }

  async findByTenantIdAndTypeAndExternalId(
    tenantId: string | null,
    type: ChannelType,
    externalId: string,
  ): Promise<ChannelEntity | null> {
    const where: FindOptionsWhere<ChannelEntity> = {
      tenantId: tenantId ? tenantId : IsNull(),
      type,
      externalId,
    };
    return this.repo.findOne({ where });
  }
}
