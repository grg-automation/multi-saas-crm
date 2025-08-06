import { Test, TestingModule } from '@nestjs/testing';
import { Channel } from './channel.repository';

describe('Channel', () => {
  let provider: Channel;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [Channel],
    }).compile();

    provider = module.get<Channel>(Channel);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
