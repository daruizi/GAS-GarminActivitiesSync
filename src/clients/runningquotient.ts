/**
 * RunningQuotient 客户端模块
 */

import axios from 'axios';
import _ from 'lodash';
import core from '@actions/core';

import { RQ_CONFIG } from '../config';
import { RQData } from '../types';
import { logger } from '../utils/logger';
import { sendErrorNotification } from '../services/notification';

/**
 * 获取 RQ 概览数据
 */
export const getRQOverView = async (): Promise<RQData> => {
  const url = `${RQ_CONFIG.host}${RQ_CONFIG.routes.UPDATE}${RQ_CONFIG.userId}`;

  logger.debug(`请求 RQ: ${url}`);

  try {
    const res = await axios(url, {
      method: 'post',
      headers: {
        accept: 'application/json, text/javascript, */*; q=0.01',
        'accept-language': 'zh-CN,zh;q=0.9,zh-TW;q=0.8,en;q=0.7,la;q=0.6,ja;q=0.5',
        'sec-ch-ua': '" Not A;Brand";v="99", "Chromium";v="102", "Google Chrome";v="102"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'x-csrf-token': RQ_CONFIG.csrfToken,
        'x-requested-with': 'XMLHttpRequest',
        cookie: RQ_CONFIG.cookie,
        Referer: 'https://www.runningquotient.cn/training/overview',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      },
    });

    if (res?.data?.data) {
      return parseRQData(res.data.data);
    }

    throw new Error('RQ 返回数据格式错误');
  } catch (error) {
    await sendErrorNotification('RQ', error as Error);
    core.setFailed('检查 RQ TOKEN');
    throw error;
  }
};

/**
 * 解析 RQ HTML 数据
 */
const parseRQData = (htmlData: {
  conditionHtml: string;
  heartHtml: string;
  paceHtml: string;
  recordHtml: string;
  runlevelHtml: string;
}): RQData => {
  const { conditionHtml, recordHtml, runlevelHtml } = htmlData;

  // 解析即时跑力、训练负荷、时间
  const now = /<div class.*data-bit[^>]*>(.*?)<small>/.exec(recordHtml.substr(0, 3000));
  const load = /<div class.*data-text[^>]*>(.*?)<small>点/.exec(recordHtml.substr(0, 3000));
  const time = /<span class.*data-label[^>]*>(.*?)<\/span>/.exec(recordHtml.substr(0, 3000));

  logger.info(`即时跑力: ${now?.[1]}`);
  logger.info(`训练负荷: ${load?.[1]}`);
  logger.info(`跑力更新时间: ${time?.[1]}`);

  // 解析疲劳值
  const tired = /<b[^>]*>(.*?)<\/b>/.exec(conditionHtml);
  logger.info(`疲劳: ${tired?.[1]}`);

  // 解析跑力
  const runLevel = /<span class.*myrunlevel[^>]*>(.*?)<\/span>/.exec(runlevelHtml);
  const runLevelDesc = /<div class.*col-xs-12 [^>]*>(.*?)<\/div>/.exec(runlevelHtml);

  logger.info(`跑力: ${runLevel?.[1]}`);
  logger.info(`跑力说明: ${runLevelDesc?.[1]}`);

  return {
    updateAt: Date.now(),
    rqTime: time?.[1] ?? '',
    rqLoad: load?.[1] ?? '',
    rqTired: tired?.[1] ?? '',
    rqRunLevelNow: now?.[1] ?? '',
    rqRunLevel: runLevel?.[1] ?? '',
    runLevelDesc: runLevelDesc?.[1] ?? '',
    rqTrend1: '',
    rqTrend2: '',
  };
};