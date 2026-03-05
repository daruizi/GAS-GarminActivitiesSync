/**
 * 迁移 Garmin Global -> CN
 */

import { migrateGlobal2CN } from './services/sync';
import { sendErrorNotification, sendSuccessNotification } from './services/notification';
import { logger } from './utils/logger';

const main = async () => {
  logger.info('========== 开始迁移 Global -> CN ==========');

  try {
    const result = await migrateGlobal2CN();

    if (result.success) {
      const message = `迁移完成: 成功 ${result.migrated} 条, 失败 ${result.failed} 条`;
      await sendSuccessNotification('Garmin Global -> CN 迁移', message);
    }
  } catch (error) {
    await sendErrorNotification('Garmin Global -> CN 迁移', error as Error);
    process.exit(1);
  }

  logger.info('========== 迁移完成 ==========');
};

main();