/**
 * 同步服务模块
 */

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
import { withRetry } from '../utils/retry';
import {
  getSyncedActivityIds,
  saveSyncedActivity,
  getMigrationProgress,
  saveMigrationProgress,
} from '../utils/database';

/**
 * 重试配置
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 2000,
  maxDelay: 10000,
};

/**
 * 同步活动数据（基于 activityId 去重）
 * @param sourceRegion 源区域
 * @param targetRegion 目标区域
 */
export const syncActivities = async (
  sourceRegion: GarminRegion,
  targetRegion: GarminRegion
): Promise<SyncResult> => {
  const sourceClient = await createGarminClient(sourceRegion);

  const syncNum = GARMIN_CONFIG.sync.num;
  const syncDelay = GARMIN_CONFIG.sync.delay;

  // 并行获取源区域活动和已同步 ID 集合
  const [sourceActs, syncedIds] = await Promise.all([
    sourceClient.getActivities(0, syncNum),
    getSyncedActivityIds(sourceRegion, targetRegion),
  ]);

  if (sourceActs.length === 0) {
    const message = '源区域没有活动数据';
    logger.info(message);
    return { success: true, count: 0, message };
  }

  // 筛选未同步的活动（反转为从旧到新）
  const actsToSync = [...sourceActs].reverse().filter(act => !syncedIds.has(act.activityId));

  if (actsToSync.length === 0) {
    const message = `没有要同步的活动，最近的活动: [${sourceActs[0].activityName}]，开始于: [${sourceActs[0].startTimeLocal}]`;
    logger.info(message);
    return { success: true, count: 0, message };
  }

  // 惰性创建目标客户端：仅在确认有活动需要同步时才登录目标区域
  // 避免无活动时浪费一次完整的登录 + getUserProfile 往返
  const targetClient = await createGarminClient(targetRegion);

  const syncedActivities: string[] = [];
  let count = 0;

  for (const act of actsToSync) {
    count++;
    logger.info(
      `同步第 ${number2capital(count)} 条: [${act.activityName}]，开始于 [${act.startTimeLocal}]`
    );

    let filePath = '';

    try {
      // 使用统一重试机制下载并上传
      filePath = await withRetry(
        () => downloadActivity(act.activityId, sourceClient),
        RETRY_CONFIG,
        `下载 ${act.activityName}`
      );

      await withRetry(
        () => uploadActivity(filePath, targetClient),
        RETRY_CONFIG,
        `上传 ${act.activityName}`
      );

      // 记录已同步的活动 ID
      await saveSyncedActivity(act.activityId, sourceRegion, targetRegion);
      syncedActivities.push(act.activityName);
    } catch (error) {
      const errMsg = String(error);
      // 409 Conflict 表示活动在目标端已存在，标记为已同步并继续
      if (errMsg.includes('409') || errMsg.includes('Conflict')) {
        logger.warn(`活动 [${act.activityName}] 在目标端已存在（409 Conflict），标记为已同步`);
        await saveSyncedActivity(act.activityId, sourceRegion, targetRegion);
        syncedActivities.push(act.activityName);
      } else {
        // 其他错误仍然抛出
        throw error;
      }
    } finally {
      // 无论成功失败，都清理临时文件
      if (filePath) {
        cleanupDownloadedFiles(filePath, act.activityId);
      }
    }

    // 延迟避免请求过快（最后一条不需要延迟）
    if (count < actsToSync.length) {
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
 * 迁移活动数据（支持断点续传）
 * @param sourceRegion 源区域
 * @param targetRegion 目标区域
 */
export const migrateActivities = async (
  sourceRegion: GarminRegion,
  targetRegion: GarminRegion
): Promise<MigrateResult> => {
  const sourceClient = await createGarminClient(sourceRegion);
  const targetClient = await createGarminClient(targetRegion);

  const { num, start: configStart } = GARMIN_CONFIG.migrate;

  // 检查是否有上次的迁移进度
  const progress = await getMigrationProgress(sourceRegion, targetRegion);
  const resumeIndex = progress ? progress.lastProcessedIndex + 1 : 0;
  const effectiveStart = configStart + resumeIndex;

  if (resumeIndex > 0) {
    logger.info(`从上次进度恢复，跳过前 ${resumeIndex} 条已迁移的活动`);
  }

  // 获取源区域活动
  const sourceActs = await sourceClient.getActivities(effectiveStart, num);

  if (sourceActs.length === 0) {
    const message = '没有更多活动需要迁移';
    logger.info(message);
    return { success: true, total: 0, migrated: 0, failed: 0 };
  }

  logger.info(`开始迁移，共 ${sourceActs.length} 条活动（从第 ${effectiveStart + 1} 条开始）`);

  let migrated = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < sourceActs.length; i++) {
    const act = sourceActs[i];
    const absoluteIndex = resumeIndex + i;
    const displayIndex = effectiveStart + i + 1;
    let filePath = '';

    try {
      logger.info(
        `迁移第 ${number2capital(displayIndex)} 条: [${act.activityName}]，开始于 [${act.startTimeLocal}]`
      );

      // 使用统一重试机制下载并上传
      filePath = await withRetry(
        () => downloadActivity(act.activityId, sourceClient),
        RETRY_CONFIG,
        `下载 ${act.activityName}`
      );

      await withRetry(
        () => uploadActivity(filePath, targetClient),
        RETRY_CONFIG,
        `上传 ${act.activityName}`
      );

      migrated++;

      // 每成功迁移一条，保存进度
      await saveMigrationProgress(sourceRegion, targetRegion, absoluteIndex, sourceActs.length);
    } catch (error) {
      const errMsg = String(error);
      // 409 Conflict 表示活动已存在，标记为已同步并视为成功
      if (errMsg.includes('409') || errMsg.includes('Conflict')) {
        logger.warn(`活动 [${act.activityName}] 在目标端已存在（409 Conflict），跳过`);
        await saveSyncedActivity(act.activityId, sourceRegion, targetRegion);
        migrated++;
      } else {
        failed++;
        const errorLog = `迁移失败: ${act.activityName} - ${error}`;
        errors.push(errorLog);
        logger.error(errorLog);
      }

      // 即使失败也保存进度，避免重复处理
      await saveMigrationProgress(sourceRegion, targetRegion, absoluteIndex, sourceActs.length);
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
