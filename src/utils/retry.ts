/**
 * 统一的重试工具模块
 */

import { logger } from './logger';
import { delay } from './format';

/**
 * 重试配置
 */
export interface RetryConfig {
  /** 最大重试次数 */
  maxRetries: number;
  /** 基础延迟（毫秒） */
  baseDelay: number;
  /** 最大延迟（毫秒） */
  maxDelay: number;
  /** 超时时间（毫秒），0 表示无超时 */
  timeout: number;
}

/**
 * 默认重试配置
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 2000,
  maxDelay: 10000,
  timeout: 0,
};

/**
 * 带超时的 Promise 包装
 */
const withTimeout = <T>(
  promise: Promise<T>,
  timeoutMs: number,
  context?: string
): Promise<T> => {
  if (timeoutMs <= 0) return promise;

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${context ? `[${context}] ` : ''}操作超时 (${timeoutMs}ms)`));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
};

/**
 * 带重试的异步操作（支持指数退避和超时）
 * @param fn 要执行的异步函数
 * @param config 重试配置（部分覆盖）
 * @param context 上下文信息（用于日志）
 */
export const withRetry = async <T>(
  fn: () => Promise<T>,
  config?: Partial<RetryConfig>,
  context?: string
): Promise<T> => {
  const { maxRetries, baseDelay, maxDelay, timeout } = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const operation = fn();
      return await (timeout > 0 ? withTimeout(operation, timeout, context) : operation);
    } catch (error) {
      lastError = error as Error;
      const delayMs = Math.min(
        baseDelay * Math.pow(2, attempt - 1),
        maxDelay
      );

      if (attempt < maxRetries) {
        logger.warn(
          `${context ? `[${context}] ` : ''}第 ${attempt} 次尝试失败，${delayMs / 1000} 秒后重试: ${lastError.message}`
        );
        await delay(delayMs);
      }
    }
  }

  throw lastError;
};
