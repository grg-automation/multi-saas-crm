import { Module } from '@nestjs/common';
import { KworkController } from './kwork.controller';

@Module({
  controllers: [KworkController],
})
export class KworkModule {}