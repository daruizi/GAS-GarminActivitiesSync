/**
 * 同步健康度监控模块
 *
 * 追踪同步成功/失败次数、连续失败次数、最后同步时间
 * 帮助诊断持续性问题和监控同步状态
 */

import { Database } from 'sqlite';
import { getDB } from './database';
import { GarminRegion } from '../types';
import { logger } from './logger';

/**
 * 同步健康度记录
 */
export interface SyncHealth {
  sourceRegion: string;
  targetRegion: string;
  totalSuccess: number;
  totalFailure: number;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastErrorMessage: string | null;
  updatedAt: string;
}

/**
 * 初始化同步健康度表
 */
export const initSyncHealthTable = async (): Promise<void> => {
  const db = await getDB();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS sync_health (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_region VARCHAR(20) NOT NULL,
      target_region VARCHAR(20) NOT NULL,
      total_success INTEGER NOT NULL DEFAULT 0,
      total_failure INTEGER NOT NULL DEFAULT 0,
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      last_success_at TEXT,
      last_failure_at TEXT,
      last_error_message TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE(source_region, target_region)
    )
  `);
};

/**
 * 记录同步成功
 */
export const recordSyncSuccess = async (
  sourceRegion: GarminRegion,
  targetRegion: GarminRegion,
  syncedCount: number
): Promise<void> => {
  const db = await getDB();
  const now = new Date().toISOString();

  await db.run(
    `INSERT INTO sync_health (source_region, target_region, total_success, total_failure, consecutive_failures, last_success_at, updated_at)
     VALUES (?, ?, 1, 0, 0, ?, ?)
     ON CONFLICT(source_region, target_region)
     DO UPDATE SET
       total_success = total_success + 1,
       consecutive_failures = 0,
       last_success_at = ?,
       updated_at = ?`,
    sourceRegion,
    targetRegion,
    now,
    now,
    now,
    now
  );

  logger.debug(
    `同步健康度已更新: ${sourceRegion} → ${targetRegion} (成功, 同步 ${syncedCount} 条)`
  );
};

/**
 * 记录同步失败
 */
export const recordSyncFailure = async (
  sourceRegion: GarminRegion,
  targetRegion: GarminRegion,
  errorMessage: string
): Promise<void> => {
  const db = await getDB();
  const now = new Date().toISOString();

  await db.run(
    `INSERT INTO sync_health (source_region, target_region, total_success, total_failure, consecutive_failures, last_failure_at, last_error_message, updated_at)
     VALUES (?, ?, 0, 1, 1, ?, ?, ?)
     ON CONFLICT(source_region, target_region)
     DO UPDATE SET
       total_failure = total_failure + 1,
       consecutive_failures = consecutive_failures + 1,
       last_failure_at = ?,
       last_error_message = ?,
       updated_at = ?`,
    sourceRegion,
    targetRegion,
    now,
    errorMessage,
    now,
    now,
    errorMessage,
    now
  );

  logger.debug(`同步健康度已更新: ${sourceRegion} → ${targetRegion} (失败)`);
};

/**
 * 获取同步健康度
 */
export const getSyncHealth = async (
  sourceRegion: GarminRegion,
  targetRegion: GarminRegion
): Promise<SyncHealth | null> => {
  const db = await getDB();
  const result = await db.get(
    'SELECT * FROM sync_health WHERE source_region = ? AND target_region = ?',
    sourceRegion,
    targetRegion
  );

  if (!result) return null;

  return {
    sourceRegion: result.source_region,
    targetRegion: result.target_region,
    totalSuccess: result.total_success,
    totalFailure: result.total_failure,
    consecutiveFailures: result.consecutive_failures,
    lastSuccessAt: result.last_success_at,
    lastFailureAt: result.last_failure_at,
    lastErrorMessage: result.last_error_message,
    updatedAt: result.updated_at,
  };
};

/**
 * 检查是否应该因连续失败而暂停同步
 * @param maxConsecutiveFailures 最大连续失败次数（默认 5）
 */
export const shouldPauseDueToFailures = async (
  sourceRegion: GarminRegion,
  targetRegion: GarminRegion,
  maxConsecutiveFailures = 5
): Promise<{ shouldPause: boolean; consecutiveFailures: number }> => {
  const health = await getSyncHealth(sourceRegion, targetRegion);

  if (!health) {
    return { shouldPause: false, consecutiveFailures: 0 };
  }

  return {
    shouldPause: health.consecutiveFailures >= maxConsecutiveFailures,
    consecutiveFailures: health.consecutiveFailures,
  };
};

/**
 * 格式化健康度报告
 */
export const formatHealthReport = (health: SyncHealth): string => {
  const successRate =
    health.totalSuccess + health.totalFailure > 0
      ? ((health.totalSuccess / (health.totalSuccess + health.totalFailure)) * 100).toFixed(1)
      : 'N/A';

  return [
    `同步方向: ${health.sourceRegion} → ${health.targetRegion}`,
    `总成功: ${health.totalSuccess} 次`,
    `总失败: ${health.totalFailure} 次`,
    `成功率: ${successRate}%`,
    `连续失败: ${health.consecutiveFailures} 次`,
    `最后成功: ${health.lastSuccessAt || '从未'}`,
    `最后失败: ${health.lastFailureAt || '从未'}`,
    health.lastErrorMessage ? `最后错误: ${health.lastErrorMessage}` : '',
  ]
    .filter(Boolean)
    .join('\n');
};
