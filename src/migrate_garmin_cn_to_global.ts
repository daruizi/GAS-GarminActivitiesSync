/**
 * 迁移 Garmin CN -> Global
 */

import { migrateCN2Global } from './services/sync';
import { sendErrorNotification, sendSuccessNotification } from './services/notification';
import { logger } from './utils/logger';

const main = async () => {
  logger.info('========== 开始迁移 CN -> Global ==========');

  try {
    const result = await migrateCN2Global();

    if (result.success) {
      const message = `迁移完成: 成功 ${result.migrated} 条, 失败 ${result.failed} 条`;
      await sendSuccessNotification('Garmin CN -> Global 迁移', message);
    }
  } catch (error) {
    await sendErrorNotification('Garmin CN -> Global 迁移', error as Error);
    process.exit(1);
  }

  logger.info('========== 迁移完成 ==========');
};

main();