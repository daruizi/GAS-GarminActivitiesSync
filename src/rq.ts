/**
 * RQ + Google Sheets 同步
 */

import { doRQGoogleSheets } from './services/rq-sync';
import { sendErrorNotification, sendSuccessNotification } from './services/notification';
import { logger } from './utils/logger';

const main = async () => {
  logger.info('========== 开始 RQ + Google Sheets 同步 ==========');

  try {
    await doRQGoogleSheets();
    await sendSuccessNotification('RQ + Google Sheets', '同步完成');
  } catch (error) {
    await sendErrorNotification('RQ + Google Sheets 同步', error as Error);
    process.exit(1);
  }

  logger.info('========== 同步完成 ==========');
};

main();