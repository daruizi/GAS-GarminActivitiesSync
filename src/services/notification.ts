/**
 * 通知服务模块 - 支持多种通知渠道
 */

import axios from 'axios';
import * as core from '@actions/core';

import { BARK_CONFIG, getEnv } from '../config';
import { logger } from '../utils/logger';

// 通知配置
const NOTIFICATION_CONFIG = {
  telegram: {
    botToken: getEnv('TELEGRAM_BOT_TOKEN'),
    chatId: getEnv('TELEGRAM_CHAT_ID'),
  },
  wecom: {
    webhookUrl: getEnv('WECOM_WEBHOOK_URL'),
  },
};

/**
 * 发送 Bark 通知
 */
export const sendBarkNotification = async (
  title: string,
  message: string
): Promise<boolean> => {
  if (!BARK_CONFIG.key) {
    logger.debug('Bark Key 未配置，跳过通知');
    return false;
  }

  try {
    const url = `${BARK_CONFIG.apiUrl}/${BARK_CONFIG.key}/${title}/${encodeURIComponent(message)}`;
    await axios.get(url, { timeout: 10000 });
    logger.debug('Bark 通知发送成功');
    return true;
  } catch (error) {
    logger.error('Bark 通知发送失败', error);
    return false;
  }
};

/**
 * 发送 Telegram 通知
 */
export const sendTelegramNotification = async (
  title: string,
  message: string
): Promise<boolean> => {
  const { botToken, chatId } = NOTIFICATION_CONFIG.telegram;

  if (!botToken || !chatId) {
    logger.debug('Telegram 配置不完整，跳过通知');
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const text = `*${title}*\n\n${message}`;

    await axios.post(
      url,
      {
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
      },
      { timeout: 10000 }
    );

    logger.debug('Telegram 通知发送成功');
    return true;
  } catch (error) {
    logger.error('Telegram 通知发送失败', error);
    return false;
  }
};

/**
 * 发送企业微信通知
 */
export const sendWeComNotification = async (
  title: string,
  message: string
): Promise<boolean> => {
  const { webhookUrl } = NOTIFICATION_CONFIG.wecom;

  if (!webhookUrl) {
    logger.debug('企业微信 Webhook 未配置，跳过通知');
    return false;
  }

  try {
    await axios.post(
      webhookUrl,
      {
        msgtype: 'markdown',
        markdown: {
          content: `### ${title}\n\n${message}`,
        },
      },
      { timeout: 10000 }
    );

    logger.debug('企业微信通知发送成功');
    return true;
  } catch (error) {
    logger.error('企业微信通知发送失败', error);
    return false;
  }
};

/**
 * 发送所有已配置的通知
 * @param title 标题
 * @param message 消息内容
 * @returns 发送结果
 */
export const sendAllNotifications = async (
  title: string,
  message: string
): Promise<{ bark: boolean; telegram: boolean; wecom: boolean }> => {
  const results = await Promise.allSettled([
    sendBarkNotification(title, message),
    sendTelegramNotification(title, message),
    sendWeComNotification(title, message),
  ]);

  return {
    bark: results[0].status === 'fulfilled' ? results[0].value : false,
    telegram: results[1].status === 'fulfilled' ? results[1].value : false,
    wecom: results[2].status === 'fulfilled' ? results[2].value : false,
  };
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

  await sendAllNotifications(title, message);
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
  await sendAllNotifications(title, message);
};

/**
 * 发送自定义通知
 */
export const sendNotification = async (
  title: string,
  message: string,
  channels?: ('bark' | 'telegram' | 'wecom')[]
): Promise<void> => {
  if (!channels || channels.length === 0) {
    await sendAllNotifications(title, message);
    return;
  }

  for (const channel of channels) {
    switch (channel) {
      case 'bark':
        await sendBarkNotification(title, message);
        break;
      case 'telegram':
        await sendTelegramNotification(title, message);
        break;
      case 'wecom':
        await sendWeComNotification(title, message);
        break;
    }
  }
};