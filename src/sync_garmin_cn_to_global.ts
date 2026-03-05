/**
 * 同步 Garmin CN -> Global
 */

import { syncCN2Global } from './services/sync';
import { sendErrorNotification, sendSuccessNotification } from './services/notification';
import { logger } from './utils/logger';

const main = async () => {
  logger.info('========== 开始同步 CN -> Global ==========');

  try {
    const result = await syncCN2Global();

    if (result.success) {
      await sendSuccessNotification('Garmin CN -> Global', result.message);
    }
  } catch (error) {
    await sendErrorNotification('Garmin CN -> Global 同步', error as Error);
    process.exit(1);
  }

  logger.info('========== 同步完成 ==========');
};

main();