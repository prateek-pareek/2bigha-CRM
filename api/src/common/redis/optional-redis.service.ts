import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Optional Redis — never required for the platform to run.
 * Set REDIS_URL (e.g. redis://localhost:6379) to enable cache and locks.
 * Set REDIS_ENABLED=false to disable even when REDIS_URL is set.
 */
@Injectable()
export class OptionalRedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OptionalRedisService.name);
  private client: Redis | null = null;
  private configured = false;
  private healthy = false;
  private explicitlyDisabled = false;

  constructor(private readonly config: ConfigService) {}

  isExplicitlyDisabled(): boolean {
    return this.explicitlyDisabled;
  }

  getConnectionState(): string | null {
    return this.client?.status ?? null;
  }

  /** Host/port only — never includes credentials. */
  getServerLabel(): string | null {
    const url = this.config.get<string>('REDIS_URL')?.trim();
    if (!url) return null;
    try {
      const u = new URL(url);
      const port = u.port || (u.protocol === 'rediss:' ? '6380' : '6379');
      return `${u.protocol}//${u.hostname}:${port}`;
    } catch {
      return 'redis (custom URL)';
    }
  }

  getCacheTtlSummary(): Record<string, number> {
    return {
      default: this.getDefaultCacheTtlSeconds(),
      pmBoard: this.getPmBoardCacheTtlSeconds(),
      crmList: Number(process.env.REDIS_CACHE_TTL_CRM_LIST_SECONDS) || 90,
      crmDetail: Number(process.env.REDIS_CACHE_TTL_CRM_DETAIL_SECONDS) || 120,
      crmPicker: Number(process.env.REDIS_CACHE_TTL_CRM_PICKER_SECONDS) || 300,
      wiki: Number(process.env.REDIS_CACHE_TTL_WIKI_SECONDS) || 90,
      search: Number(process.env.REDIS_CACHE_TTL_SEARCH_SECONDS) || 45,
      socialPublic:
        Number(process.env.REDIS_CACHE_TTL_SOCIAL_PUBLIC_SECONDS) || 300,
    };
  }

  async onModuleInit(): Promise<void> {
    const enabledFlag = this.config.get<string>('REDIS_ENABLED');
    if (enabledFlag != null && /^false|0|no$/i.test(String(enabledFlag).trim())) {
      this.explicitlyDisabled = true;
      this.logger.log('Redis disabled (REDIS_ENABLED=false).');
      return;
    }

    const url = this.config.get<string>('REDIS_URL')?.trim();
    if (!url) {
      this.logger.log(
        'Redis not configured (REDIS_URL unset); running without cache/locks.',
      );
      return;
    }

    this.configured = true;
    try {
      const client = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectTimeout: 4000,
        commandTimeout: 3000,
        retryStrategy: (times: number) => (times > 2 ? null : Math.min(times * 200, 800)),
      });

      client.on('error', (err: Error) => {
        this.healthy = false;
        this.logger.warn(`Redis error: ${err.message}`);
      });

      client.on('ready', () => {
        this.healthy = true;
      });

      await client.connect();
      await client.ping();
      this.client = client;
      this.healthy = true;
      this.logger.log('Redis connected (optional cache/locks active).');
    } catch (err) {
      this.healthy = false;
      await this.disconnectClient();
      this.logger.warn(
        `Redis unavailable (${err instanceof Error ? err.message : String(err)}); platform continues without cache.`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnectClient();
  }

  /** True when Redis was configured and last command succeeded. */
  isAvailable(): boolean {
    return (
      this.configured &&
      this.healthy &&
      this.client != null &&
      this.client.status === 'ready'
    );
  }

  wasConfigured(): boolean {
    return this.configured;
  }

  getDefaultCacheTtlSeconds(): number {
    const raw = Number(this.config.get<string>('REDIS_CACHE_TTL_SECONDS'));
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 180;
  }

  getPmBoardCacheTtlSeconds(): number {
    const raw = Number(this.config.get<string>('REDIS_CACHE_TTL_PM_BOARD_SECONDS'));
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 60;
  }

  async getJson<T>(key: string): Promise<T | null> {
    if (!this.isAvailable() || !this.client) return null;
    try {
      const raw = await this.client.get(key);
      if (raw == null || raw === '') return null;
      return JSON.parse(raw) as T;
    } catch (err) {
      this.markUnhealthy(err);
      return null;
    }
  }

  async setJson(
    key: string,
    value: unknown,
    ttlSeconds: number,
  ): Promise<void> {
    if (!this.isAvailable() || !this.client) return;
    try {
      const payload = JSON.stringify(value);
      const ttl = Math.max(1, Math.floor(ttlSeconds));
      await this.client.set(key, payload, 'EX', ttl);
    } catch (err) {
      this.markUnhealthy(err);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.isAvailable() || !this.client) return;
    try {
      await this.client.del(key);
    } catch (err) {
      this.markUnhealthy(err);
    }
  }

  /** Best-effort prefix delete (used after manual outreach edits). */
  async delByPrefix(prefix: string): Promise<void> {
    if (!this.isAvailable() || !this.client || !prefix) return;
    try {
      let cursor = '0';
      do {
        const [next, keys] = await this.client.scan(
          cursor,
          'MATCH',
          `${prefix}*`,
          'COUNT',
          100,
        );
        cursor = next;
        if (keys.length) await this.client.del(...keys);
      } while (cursor !== '0');
    } catch (err) {
      this.markUnhealthy(err);
    }
  }

  /**
   * Distributed lock. Returns true if lock acquired OR Redis is unavailable (fail-open).
   * Returns false only when Redis is up and another holder has the lock.
   */
  async tryAcquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    if (!this.isAvailable() || !this.client) return true;
    try {
      const ttl = Math.max(5, Math.floor(ttlSeconds));
      const result = await this.client.set(key, '1', 'EX', ttl, 'NX');
      return result === 'OK';
    } catch (err) {
      this.markUnhealthy(err);
      return true;
    }
  }

  async releaseLock(key: string): Promise<void> {
    await this.del(key);
  }

  /** Live PING for ops dashboards (does not throw). */
  async probe(): Promise<{
    ok: boolean;
    pingMs: number | null;
    error: string | null;
  }> {
    if (this.explicitlyDisabled) {
      return { ok: false, pingMs: null, error: 'REDIS_ENABLED=false' };
    }
    if (!this.configured || !this.client) {
      return { ok: false, pingMs: null, error: 'Redis not configured or not connected' };
    }
    try {
      const start = Date.now();
      await this.client.ping();
      this.healthy = true;
      return { ok: true, pingMs: Date.now() - start, error: null };
    } catch (err) {
      this.markUnhealthy(err);
      return {
        ok: false,
        pingMs: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private markUnhealthy(err: unknown): void {
    this.healthy = false;
    const msg = err instanceof Error ? err.message : String(err);
    this.logger.debug(`Redis operation skipped: ${msg}`);
  }

  private async disconnectClient(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.quit();
    } catch {
      try {
        this.client.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.client = null;
    this.healthy = false;
  }
}
