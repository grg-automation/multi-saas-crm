import { Module } from '@nestjs/common';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';

@Module({
  controllers: [MessagingController],
  providers: [MessagingService],
  exports: [MessagingService], // Export service for use in other modules if needed
})
export class MessagingModule {}