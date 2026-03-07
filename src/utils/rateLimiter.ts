/**
 * 速率限制工具模块
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
 * 请求记录
 */
interface RequestRecord {
  timestamp: number;
  count: number;
}

/**
 * 速率限制器类
 */
export class RateLimiter {
  private config: RateLimiterConfig;
  private secondRequests: RequestRecord[] = [];
  private minuteRequests: RequestRecord[] = [];
  private hourRequests: RequestRecord[] = [];

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 清理过期的请求记录
   */
  private cleanExpiredRecords(): void {
    const now = Date.now();

    // 清理秒级记录（保留最近 2 秒）
    this.secondRequests = this.secondRequests.filter(
      (r) => now - r.timestamp < 2000
    );

    // 清理分钟级记录（保留最近 2 分钟）
    this.minuteRequests = this.minuteRequests.filter(
      (r) => now - r.timestamp < 2 * 60 * 1000
    );

    // 清理小时级记录（保留最近 2 小时）
    this.hourRequests = this.hourRequests.filter(
      (r) => now - r.timestamp < 2 * 60 * 60 * 1000
    );
  }

  /**
   * 检查是否可以发送请求
   */
  canMakeRequest(): boolean {
    this.cleanExpiredRecords();

    const now = Date.now();
    const currentSecond = Math.floor(now / 1000) * 1000;
    const currentMinute = Math.floor(now / (60 * 1000)) * 60 * 1000;
    const currentHour = Math.floor(now / (60 * 60 * 1000)) * 60 * 60 * 1000;

    // 检查秒级限制
    const secondCount = this.secondRequests
      .filter((r) => r.timestamp >= currentSecond)
      .reduce((sum, r) => sum + r.count, 0);

    if (secondCount >= this.config.maxRequestsPerSecond) {
      return false;
    }

    // 检查分钟级限制
    const minuteCount = this.minuteRequests
      .filter((r) => r.timestamp >= currentMinute)
      .reduce((sum, r) => sum + r.count, 0);

    if (minuteCount >= this.config.maxRequestsPerMinute) {
      return false;
    }

    // 检查小时级限制
    const hourCount = this.hourRequests
      .filter((r) => r.timestamp >= currentHour)
      .reduce((sum, r) => sum + r.count, 0);

    if (hourCount >= this.config.maxRequestsPerHour) {
      return false;
    }

    return true;
  }

  /**
   * 记录一次请求
   */
  recordRequest(): void {
    const now = Date.now();
    const currentSecond = Math.floor(now / 1000) * 1000;
    const currentMinute = Math.floor(now / (60 * 1000)) * 60 * 1000;
    const currentHour = Math.floor(now / (60 * 60 * 1000)) * 60 * 60 * 1000;

    // 更新秒级记录
    const secondRecord = this.secondRequests.find(
      (r) => r.timestamp === currentSecond
    );
    if (secondRecord) {
      secondRecord.count++;
    } else {
      this.secondRequests.push({ timestamp: currentSecond, count: 1 });
    }

    // 更新分钟级记录
    const minuteRecord = this.minuteRequests.find(
      (r) => r.timestamp === currentMinute
    );
    if (minuteRecord) {
      minuteRecord.count++;
    } else {
      this.minuteRequests.push({ timestamp: currentMinute, count: 1 });
    }

    // 更新小时级记录
    const hourRecord = this.hourRequests.find(
      (r) => r.timestamp === currentHour
    );
    if (hourRecord) {
      hourRecord.count++;
    } else {
      this.hourRequests.push({ timestamp: currentHour, count: 1 });
    }
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
   * 获取当前请求统计
   */
  getStats(): {
    second: number;
    minute: number;
    hour: number;
  } {
    this.cleanExpiredRecords();

    const now = Date.now();
    const currentSecond = Math.floor(now / 1000) * 1000;
    const currentMinute = Math.floor(now / (60 * 1000)) * 60 * 1000;
    const currentHour = Math.floor(now / (60 * 60 * 1000)) * 60 * 60 * 1000;

    return {
      second: this.secondRequests
        .filter((r) => r.timestamp >= currentSecond)
        .reduce((sum, r) => sum + r.count, 0),
      minute: this.minuteRequests
        .filter((r) => r.timestamp >= currentMinute)
        .reduce((sum, r) => sum + r.count, 0),
      hour: this.hourRequests
        .filter((r) => r.timestamp >= currentHour)
        .reduce((sum, r) => sum + r.count, 0),
    };
  }

  /**
   * 重置所有计数
   */
  reset(): void {
    this.secondRequests = [];
    this.minuteRequests = [];
    this.hourRequests = [];
  }

  /**
   * 休眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * 默认速率限制器实例
 */
export const defaultRateLimiter = new RateLimiter();

/**
 * 创建自定义速率限制器
 */
export const createRateLimiter = (
  config: Partial<RateLimiterConfig>
): RateLimiter => {
  return new RateLimiter(config);
};