import { Controller, Get } from '@nestjs/common';
import { OptionalRedisService } from './redis/optional-redis.service';

/** Used by Docker/Traefik health checks; keep fast and DB-free. */
@Controller('health')
export class HealthController {
  constructor(private readonly redis: OptionalRedisService) {}

  @Get()
  liveness() {
    return { status: 'ok' };
  }

  /** Optional ops probe — no host/details (use GET /hrms/tech-services when authenticated). */
  @Get('redis')
  async redisStatus() {
    const probe = await this.redis.probe();
    return {
      ok: probe.ok,
      available: this.redis.isAvailable(),
    };
  }
}
