import { Global, Module } from '@nestjs/common';
import { OptionalRedisService } from './optional-redis.service';
import { AppCacheService } from './app-cache.service';

@Global()
@Module({
  providers: [OptionalRedisService, AppCacheService],
  exports: [OptionalRedisService, AppCacheService],
})
export class RedisModule {}
