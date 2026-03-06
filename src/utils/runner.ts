/**
 * 任务运行器 - 统一处理入口脚本的执行逻辑
 */

import { sendErrorNotification, sendSuccessNotification } from '../services/notification';
import { logger } from './logger';

export interface TaskResult {
  success: boolean;
  message?: string;
}

/**
 * 执行任务并处理通知
 */
export const runTask = async (
  taskName: string,
  task: () => Promise<TaskResult>
): Promise<void> => {
  logger.info(`========== 开始 ${taskName} ==========`);

  try {
    const result = await task();

    if (result.success) {
      await sendSuccessNotification(taskName, result.message || '完成');
    }
  } catch (error) {
    await sendErrorNotification(taskName, error as Error);
    process.exit(1);
  }

  logger.info(`========== 完成 ==========`);
};