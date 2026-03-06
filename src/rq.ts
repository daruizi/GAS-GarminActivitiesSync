/**
 * RQ + Google Sheets 同步
 */

import { doRQGoogleSheets } from './services/rq-sync';
import { runTask } from './utils/runner';

runTask('RQ + Google Sheets 同步', async () => {
  await doRQGoogleSheets();
  return { success: true, message: '同步完成' };
});