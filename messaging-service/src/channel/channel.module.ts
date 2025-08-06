// src/channel/channel.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessageModule } from '../message/message.module'; // If needed for circular dependency
import { ChannelRepository } from './channel.repository';
import { ChannelService } from './channel.service';
import { ChannelEntity } from './entities/channel.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChannelEntity]), // Required for ChannelRepository
    forwardRef(() => MessageModule), // Handle potential circular dependency
  ],
  providers: [ChannelService, ChannelRepository],
  exports: [
    ChannelService, // Export for MessageModule
  ],
})
export class ChannelModule {}
