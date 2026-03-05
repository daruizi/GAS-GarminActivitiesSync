/**
 * 同步 Garmin Global -> CN
 */

import { syncGlobal2CN } from './services/sync';
import { sendErrorNotification, sendSuccessNotification } from './services/notification';
import { logger } from './utils/logger';

const main = async () => {
  logger.info('========== 开始同步 Global -> CN ==========');

  try {
    const result = await syncGlobal2CN();

    if (result.success) {
      await sendSuccessNotification('Garmin Global -> CN', result.message);
    }
  } catch (error) {
    await sendErrorNotification('Garmin Global -> CN 同步', error as Error);
    process.exit(1);
  }

  logger.info('========== 同步完成 ==========');
};

main();