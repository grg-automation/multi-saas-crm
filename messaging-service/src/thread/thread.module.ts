// src/thread/thread.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessageModule } from '../message/message.module'; // Import MessageModule
import { ThreadEntity } from './entities/thread.entity';
import { ThreadController } from './thread.controller';
import { ThreadRepository } from './thread.repository';
import { ThreadService } from './thread.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ThreadEntity]),
    forwardRef(() => MessageModule), // Handle circular dependency
  ],
  controllers: [ThreadController],
  providers: [ThreadService, ThreadRepository],
  exports: [ThreadService, ThreadRepository],
})
export class ThreadModule {}
