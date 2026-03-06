/**
 * RQ 数据同步服务
 */

import assign from 'lodash/assign';
import values from 'lodash/values';

import { createGarminClient, getRunningStatistics } from '../clients/garmin';
import { getRQOverView } from '../clients/runningquotient';
import { getLatestActivityIdInSheets, insertDataToSheets } from '../clients/google-sheets';
import { logger } from '../utils/logger';

/**
 * 执行 RQ + Google Sheets 同步
 */
export const doRQGoogleSheets = async (): Promise<void> => {
  logger.info('开始 RQ + Google Sheets 同步');

  // 获取 RQ 数据
  const rqResult = await getRQOverView();

  // 获取 Garmin 统计数据
  const clientCN = await createGarminClient('CN');
  const garminStats = await getRunningStatistics(clientCN);

  // 合并数据
  const data = assign(rqResult, garminStats);
  logger.info('合并数据完成', data);

  // 检查是否需要更新
  const latestActivityIdInSheets = await getLatestActivityIdInSheets();
  const currentActivityId = String(garminStats.activityId);

  if (latestActivityIdInSheets === currentActivityId) {
    logger.info('没有需要更新的数据！快去跑步！');
    return;
  }

  // 写入 Google Sheets
  const finalResult = values(data);
  await insertDataToSheets(finalResult);

  logger.success('RQ + Google Sheets 同步完成');
};