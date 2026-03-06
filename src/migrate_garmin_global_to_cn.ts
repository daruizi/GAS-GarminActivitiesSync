/**
 * 迁移 Garmin Global -> CN
 */

import { migrateGlobal2CN } from './services/sync';
import { runTask } from './utils/runner';

runTask('迁移 Global -> CN', async () => {
  const result = await migrateGlobal2CN();
  return {
    success: result.success,
    message: `成功 ${result.migrated} 条, 失败 ${result.failed} 条`,
  };
});