/**
 * 同步服务模块
 */

import reverse from 'lodash/reverse';

import {
  createGarminClient,
  downloadActivity,
  uploadActivity,
  cleanupDownloadedFiles,
  cleanupDownloadDir,
} from '../clients/garmin';
import { GARMIN_CONFIG } from '../config';
import { GarminRegion, SyncResult, MigrateResult } from '../types';
import { logger } from '../utils/logger';
import { number2capital, delay } from '../utils/format';

/**
 * 重试配置
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 2000, // 基础延迟 2 秒
  maxDelay: 10000, // 最大延迟 10 秒
};

/**
 * 带重试的异步操作
 * @param fn 要执行的异步函数
 * @param maxRetries 最大重试次数
 * @param context 上下文信息（用于日志）
 */
export const withRetry = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = RETRY_CONFIG.maxRetries,
  context?: string
): Promise<T> => {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      const delayMs = Math.min(
        RETRY_CONFIG.baseDelay * Math.pow(2, attempt - 1),
        RETRY_CONFIG.maxDelay
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

/**
 * 同步活动数据
 * @param sourceRegion 源区域
 * @param targetRegion 目标区域
 */
export const syncActivities = async (
  sourceRegion: GarminRegion,
  targetRegion: GarminRegion
): Promise<SyncResult> => {
  const sourceClient = await createGarminClient(sourceRegion);
  const targetClient = await createGarminClient(targetRegion);

  const syncNum = GARMIN_CONFIG.sync.num;
  const syncDelay = GARMIN_CONFIG.sync.delay;

  // 获取源区域活动
  const sourceActs = await sourceClient.getActivities(0, syncNum);
  // 获取目标区域最新活动
  const targetActs = await targetClient.getActivities(0, 1);

  const latestTargetActTime = targetActs[0]?.startTimeLocal ?? '0';
  const latestSourceActTime = sourceActs[0]?.startTimeLocal ?? '0';

  // 检查是否有新活动
  if (latestSourceActTime === latestTargetActTime) {
    const message = `没有要同步的活动，最近的活动: [${sourceActs[0].activityName}]，开始于: [${latestSourceActTime}]`;
    logger.info(message);
    return { success: true, count: 0, message };
  }

  // 反转数组，从旧到新同步
  const actsToSync = reverse([...sourceActs]);
  const syncedActivities: string[] = [];
  let count = 0;

  for (const act of actsToSync) {
    if (act.startTimeLocal > latestTargetActTime) {
      count++;
      logger.info(
        `同步第 ${number2capital(count)} 条: [${act.activityName}]，开始于 [${act.startTimeLocal}]`
      );

      let filePath = '';

      try {
        // 使用重试机制下载并上传
        filePath = await withRetry(
          () => downloadActivity(act.activityId, sourceClient),
          RETRY_CONFIG.maxRetries,
          `下载 ${act.activityName}`
        );

        await withRetry(
          () => uploadActivity(filePath, targetClient),
          RETRY_CONFIG.maxRetries,
          `上传 ${act.activityName}`
        );

        syncedActivities.push(act.activityName);
      } finally {
        // 无论成功失败，都清理临时文件
        if (filePath) {
          cleanupDownloadedFiles(filePath, act.activityId);
        }
      }

      // 延迟，避免请求过快
      await delay(syncDelay);
    }
  }

  // 清理整个下载目录
  cleanupDownloadDir();

  const message = `同步完成，共 ${count} 条活动`;
  logger.success(message);

  return { success: true, count, message, activities: syncedActivities };
};

/**
 * 迁移活动数据
 * @param sourceRegion 源区域
 * @param targetRegion 目标区域
 */
export const migrateActivities = async (
  sourceRegion: GarminRegion,
  targetRegion: GarminRegion
): Promise<MigrateResult> => {
  const sourceClient = await createGarminClient(sourceRegion);
  const targetClient = await createGarminClient(targetRegion);

  const { num, start } = GARMIN_CONFIG.migrate;

  // 获取源区域活动
  const sourceActs = await sourceClient.getActivities(start, num);

  logger.info(`开始迁移，共 ${sourceActs.length} 条活动`);

  let migrated = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < sourceActs.length; i++) {
    const act = sourceActs[i];
    const index = start + i + 1;
    let filePath = '';

    try {
      logger.info(
        `迁移第 ${number2capital(index)} 条: [${act.activityName}]，开始于 [${act.startTimeLocal}]`
      );

      // 使用重试机制下载并上传
      filePath = await withRetry(
        () => downloadActivity(act.activityId, sourceClient),
        RETRY_CONFIG.maxRetries,
        `下载 ${act.activityName}`
      );

      await withRetry(
        () => uploadActivity(filePath, targetClient),
        RETRY_CONFIG.maxRetries,
        `上传 ${act.activityName}`
      );

      migrated++;
    } catch (error) {
      failed++;
      const errMsg = `迁移失败: ${act.activityName} - ${error}`;
      errors.push(errMsg);
      logger.error(errMsg);
    } finally {
      // 无论成功失败，都清理临时文件
      if (filePath) {
        cleanupDownloadedFiles(filePath, act.activityId);
      }
    }
  }

  // 清理整个下载目录
  cleanupDownloadDir();

  const message = `迁移完成，成功 ${migrated} 条，失败 ${failed} 条`;
  logger.success(message);

  return {
    success: true,
    total: sourceActs.length,
    migrated,
    failed,
    errors: errors.length > 0 ? errors : undefined,
  };
};

/**
 * 同步 CN -> Global
 */
export const syncCN2Global = async (): Promise<SyncResult> => {
  return syncActivities('CN', 'GLOBAL');
};

/**
 * 同步 Global -> CN
 */
export const syncGlobal2CN = async (): Promise<SyncResult> => {
  return syncActivities('GLOBAL', 'CN');
};

/**
 * 迁移 CN -> Global
 */
export const migrateCN2Global = async (): Promise<MigrateResult> => {
  return migrateActivities('CN', 'GLOBAL');
};

/**
 * 迁移 Global -> CN
 */
export const migrateGlobal2CN = async (): Promise<MigrateResult> => {
  return migrateActivities('GLOBAL', 'CN');
};