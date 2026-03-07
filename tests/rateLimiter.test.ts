import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimiter, createRateLimiter } from '../src/utils/rateLimiter';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = createRateLimiter({
      maxRequestsPerSecond: 3,
      maxRequestsPerMinute: 10,
      maxRequestsPerHour: 50,
      retryDelayMs: 100,
      maxRetries: 3,
    });
  });

  describe('canMakeRequest', () => {
    it('should allow requests under limit', () => {
      expect(limiter.canMakeRequest()).toBe(true);
    });

    it('should block requests over second limit', () => {
      limiter.recordRequest();
      limiter.recordRequest();
      limiter.recordRequest();

      expect(limiter.canMakeRequest()).toBe(false);
    });
  });

  describe('recordRequest', () => {
    it('should increment request count', () => {
      limiter.recordRequest();

      const stats = limiter.getStats();
      expect(stats.second).toBe(1);
    });

    it('should track multiple requests', () => {
      limiter.recordRequest();
      limiter.recordRequest();
      limiter.recordRequest();

      const stats = limiter.getStats();
      expect(stats.second).toBe(3);
    });
  });

  describe('getStats', () => {
    it('should return current statistics', () => {
      limiter.recordRequest();
      limiter.recordRequest();

      const stats = limiter.getStats();

      expect(stats.second).toBe(2);
      expect(stats.minute).toBe(2);
      expect(stats.hour).toBe(2);
    });
  });

  describe('reset', () => {
    it('should clear all request counts', () => {
      limiter.recordRequest();
      limiter.recordRequest();

      limiter.reset();

      const stats = limiter.getStats();
      expect(stats.second).toBe(0);
      expect(stats.minute).toBe(0);
      expect(stats.hour).toBe(0);
    });
  });

  describe('executeWithRateLimit', () => {
    it('should execute function when under limit', async () => {
      const fn = vi.fn().mockResolvedValue('result');

      const result = await limiter.executeWithRateLimit(fn);

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});