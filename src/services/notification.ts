/**
 * 通知服务模块
 */

import axios from 'axios';
import core from '@actions/core';

import { BARK_CONFIG } from '../config';
import { logger } from '../utils/logger';

/**
 * 发送 Bark 通知
 */
export const sendBarkNotification = async (
  title: string,
  message: string
): Promise<void> => {
  if (!BARK_CONFIG.key) {
    logger.debug('Bark Key 未配置，跳过通知');
    return;
  }

  try {
    const url = `${BARK_CONFIG.apiUrl}/${BARK_CONFIG.key}/${title}/${encodeURIComponent(message)}`;
    await axios.get(url);
    logger.debug('Bark 通知发送成功');
  } catch (error) {
    logger.error('Bark 通知发送失败', error);
  }
};

/**
 * 发送错误通知
 */
export const sendErrorNotification = async (
  context: string,
  error: Error
): Promise<void> => {
  const title = `${context} 运行失败`;
  const message = error.message;

  await sendBarkNotification(title, message);
  core.setFailed(message);
};

/**
 * 发送成功通知
 */
export const sendSuccessNotification = async (
  context: string,
  message: string
): Promise<void> => {
  const title = `${context} 运行成功`;
  await sendBarkNotification(title, message);
};