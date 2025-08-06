import { Injectable } from '@nestjs/common';
import { ChannelStatus, ChannelType } from '../types/channel.types';
import { ChannelRepository } from './channel.repository';
import { ChannelEntity } from './entities/channel.entity';

@Injectable()
export class ChannelService {
  constructor(private readonly channelRepo: ChannelRepository) {}

  async getOrCreateChannel(
    tenantId: string | null,
    type: ChannelType,
    externalId: string,
  ): Promise<ChannelEntity> {
    let channel = await this.channelRepo.findByTenantIdAndTypeAndExternalId(
      tenantId,
      type,
      externalId,
    );
    if (!channel) {
      channel = new ChannelEntity();
      channel.tenantId = tenantId || null; // Store null if not provided
      channel.type = type;
      channel.externalId = externalId;
      channel.status = ChannelStatus.ACTIVE;
      channel = await this.channelRepo.save(channel);
    }
    return channel;
  }
}
