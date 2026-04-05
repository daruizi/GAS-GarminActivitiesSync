/**
 * 速率限制工具模块
 *
 * 使用滑动窗口计数器实现 O(1) 速率检查，
 * 替代旧版数组线性扫描方案。
 */

import { logger } from './logger';

/**
 * 速率限制配置
 */
export interface RateLimiterConfig {
  // 每秒最大请求数
  maxRequestsPerSecond: number;
  // 每分钟最大请求数
  maxRequestsPerMinute: number;
  // 每小时最大请求数
  maxRequestsPerHour: number;
  // 重试等待时间（毫秒）
  retryDelayMs: number;
  // 最大重试次数
  maxRetries: number;
}

/**
 * 默认速率限制配置
 */
const DEFAULT_CONFIG: RateLimiterConfig = {
  maxRequestsPerSecond: 5,
  maxRequestsPerMinute: 100,
  maxRequestsPerHour: 500,
  retryDelayMs: 1000,
  maxRetries: 3,
};

/**
 * 滑动窗口计数器
 * 每个窗口存储当前窗口的计数和窗口起始时间戳
 */
interface WindowCounter {
  windowStart: number;
  count: number;
}

/**
 * 速率限制器类（O(1) 滑动窗口计数器实现）
 */
export class RateLimiter {
  private config: RateLimiterConfig;
  private secondCounter: WindowCounter = { windowStart: 0, count: 0 };
  private minuteCounter: WindowCounter = { windowStart: 0, count: 0 };
  private hourCounter: WindowCounter = { windowStart: 0, count: 0 };

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 获取当前时间对齐到指定窗口的起始时间戳
   */
  private getWindowStart(now: number, windowMs: number): number {
    return Math.floor(now / windowMs) * windowMs;
  }

  /**
   * 检查并重置过期窗口的计数器
   */
  private refreshCounter(counter: WindowCounter, currentWindowStart: number): void {
    if (counter.windowStart !== currentWindowStart) {
      counter.windowStart = currentWindowStart;
      counter.count = 0;
    }
  }

  /**
   * 检查是否可以发送请求 - O(1) 时间复杂度
   */
  canMakeRequest(): boolean {
    const now = Date.now();

    const currentSecond = this.getWindowStart(now, 1000);
    const currentMinute = this.getWindowStart(now, 60_000);
    const currentHour = this.getWindowStart(now, 3_600_000);

    // 刷新过期窗口
    this.refreshCounter(this.secondCounter, currentSecond);
    this.refreshCounter(this.minuteCounter, currentMinute);
    this.refreshCounter(this.hourCounter, currentHour);

    // 检查各级限制
    if (this.secondCounter.count >= this.config.maxRequestsPerSecond) return false;
    if (this.minuteCounter.count >= this.config.maxRequestsPerMinute) return false;
    if (this.hourCounter.count >= this.config.maxRequestsPerHour) return false;

    return true;
  }

  /**
   * 记录一次请求 - O(1) 时间复杂度
   */
  recordRequest(): void {
    const now = Date.now();

    const currentSecond = this.getWindowStart(now, 1000);
    const currentMinute = this.getWindowStart(now, 60_000);
    const currentHour = this.getWindowStart(now, 3_600_000);

    this.refreshCounter(this.secondCounter, currentSecond);
    this.refreshCounter(this.minuteCounter, currentMinute);
    this.refreshCounter(this.hourCounter, currentHour);

    this.secondCounter.count++;
    this.minuteCounter.count++;
    this.hourCounter.count++;
  }

  /**
   * 等待直到可以发送请求
   */
  async waitForAvailableSlot(): Promise<void> {
    let retries = 0;

    while (!this.canMakeRequest() && retries < this.config.maxRetries) {
      logger.debug(`速率限制等待中... (${retries + 1}/${this.config.maxRetries})`);
      await this.sleep(this.config.retryDelayMs);
      retries++;
    }

    if (!this.canMakeRequest()) {
      throw new Error('速率限制：超过最大重试次数');
    }
  }

  /**
   * 执行带速率限制的请求
   */
  async executeWithRateLimit<T>(fn: () => Promise<T>): Promise<T> {
    await this.waitForAvailableSlot();
    this.recordRequest();
    return fn();
  }

  /**
   * 获取当前请求统计 - O(1) 时间复杂度
   */
  getStats(): {
    second: number;
    minute: number;
    hour: number;
  } {
    const now = Date.now();

    const currentSecond = this.getWindowStart(now, 1000);
    const currentMinute = this.getWindowStart(now, 60_000);
    const currentHour = this.getWindowStart(now, 3_600_000);

    return {
      second: this.secondCounter.windowStart === currentSecond ? this.secondCounter.count : 0,
      minute: this.minuteCounter.windowStart === currentMinute ? this.minuteCounter.count : 0,
      hour: this.hourCounter.windowStart === currentHour ? this.hourCounter.count : 0,
    };
  }

  /**
   * 重置所有计数
   */
  reset(): void {
    this.secondCounter = { windowStart: 0, count: 0 };
    this.minuteCounter = { windowStart: 0, count: 0 };
    this.hourCounter = { windowStart: 0, count: 0 };
  }

  /**
   * 休眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 默认速率限制器实例
 */
export const defaultRateLimiter = new RateLimiter();

/**
 * 创建自定义速率限制器
 */
export const createRateLimiter = (config: Partial<RateLimiterConfig>): RateLimiter => {
  return new RateLimiter(config);
};
