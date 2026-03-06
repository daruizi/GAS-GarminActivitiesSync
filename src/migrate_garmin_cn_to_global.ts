/**
 * 迁移 Garmin CN -> Global
 */

import { migrateCN2Global } from './services/sync';
import { runTask } from './utils/runner';

runTask('迁移 CN -> Global', async () => {
  const result = await migrateCN2Global();
  return {
    success: result.success,
    message: `成功 ${result.migrated} 条, 失败 ${result.failed} 条`,
  };
});