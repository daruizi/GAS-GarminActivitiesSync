/**
 * 任务运行器 - 统一处理入口脚本的执行逻辑
 */

import { sendErrorNotification, sendSuccessNotification } from '../services/notification';
import { validateAllConfig } from './validation';
import { checkAESKey } from './crypto';
import { initDB, closeDB } from './database';
import { logger } from './logger';

export interface TaskResult {
  success: boolean;
  message?: string;
}

/**
 * 执行任务并处理通知
 */
export const runTask = async (taskName: string, task: () => Promise<TaskResult>): Promise<void> => {
  const startTime = Date.now();
  let exitCode = 0;

  logger.info(`========== 开始 ${taskName} ==========`);

  try {
    // 启动时验证配置
    const configResult = validateAllConfig({
      garminUsername: process.env.GARMIN_USERNAME,
      garminPassword: process.env.GARMIN_PASSWORD,
      garminGlobalUsername: process.env.GARMIN_GLOBAL_USERNAME,
      garminGlobalPassword: process.env.GARMIN_GLOBAL_PASSWORD,
      aesKey: process.env.AESKEY,
      barkKey: process.env.BARK_KEY,
      telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
      telegramChatId: process.env.TELEGRAM_CHAT_ID,
      wecomWebhookUrl: process.env.WECOM_WEBHOOK_URL,
    });

    // 输出警告信息
    if (configResult.warnings.length > 0) {
      configResult.warnings.forEach(w => logger.warn(w));
    }

    // 如果有错误，抛出异常
    if (!configResult.success) {
      throw new Error(`配置验证失败：\n${configResult.errors.join('\n')}`);
    }

    // 一次性校验 AES Key（缓存结果，后续 encrypt/decrypt 不再重复校验）
    checkAESKey();

    // 一次性初始化数据库
    await initDB();

    // 执行任务
    const result = await task();

    if (result.success) {
      await sendSuccessNotification(taskName, result.message || '完成');
    }
  } catch (error) {
    await sendErrorNotification(taskName, error as Error);
    exitCode = 1;
  } finally {
    // 关闭数据库连接
    await closeDB();

    // 计算并输出执行时间
    const duration = Date.now() - startTime;
    const seconds = (duration / 1000).toFixed(2);
    logger.info(`========== 完成 (耗时 ${seconds} 秒) ==========`);
  }

  // process.exit 移至 finally 之后，确保 closeDB 和日志输出完整执行
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
};
