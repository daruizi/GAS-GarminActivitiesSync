/**
 * 同步健康度检查命令
 *
 * 显示当前同步的健康状态，包括成功率、连续失败次数等
 * 用法: yarn health:global2cn 或 yarn health:cn2global
 */

import { initDB, closeDB } from './utils/database';
import { initSyncHealthTable, getSyncHealth, formatHealthReport } from './utils/syncHealth';
import { GarminRegion } from './types';
import { logger } from './utils/logger';

const main = async () => {
  const args = process.argv.slice(2);
  const direction = args[0] || 'GLOBAL2CN';

  let sourceRegion: GarminRegion;
  let targetRegion: GarminRegion;

  if (direction.toUpperCase() === 'CN2GLOBAL') {
    sourceRegion = 'CN';
    targetRegion = 'GLOBAL';
  } else {
    sourceRegion = 'GLOBAL';
    targetRegion = 'CN';
  }

  await initDB();
  await initSyncHealthTable();

  const health = await getSyncHealth(sourceRegion, targetRegion);

  if (!health) {
    logger.info(`暂无 ${sourceRegion} → ${targetRegion} 的同步记录`);
  } else {
    console.log('\n📊 同步健康度报告');
    console.log('─'.repeat(40));
    console.log(formatHealthReport(health));
    console.log('─'.repeat(40));
  }

  await closeDB();
};

main().catch(console.error);
