import type { OptionalRedisService } from './optional-redis.service';

/** Read-through cache; always runs factory when Redis is off or misses. */
export async function redisGetOrSet<T>(
  redis: OptionalRedisService,
  key: string,
  ttlSeconds: number,
  factory: () => Promise<T>,
): Promise<T> {
  const cached = await redis.getJson<T>(key);
  if (cached != null) return cached;
  const fresh = await factory();
  void redis.setJson(key, fresh, ttlSeconds);
  return fresh;
}
