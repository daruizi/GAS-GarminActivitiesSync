/**
 * Google Sheets 客户端模块
 */

import { JWT } from 'google-auth-library';
import { google } from 'googleapis';
import last from 'lodash/last';
import * as core from '@actions/core';

import { GOOGLE_CONFIG } from '../config';
import { logger } from '../utils/logger';

/**
 * 获取 Google Sheets 客户端
 */
const getSheetsClient = async () => {
  const client = new JWT({
    email: GOOGLE_CONFIG.clientEmail,
    key: GOOGLE_CONFIG.privateKey,
    scopes: GOOGLE_CONFIG.scopes,
  });

  return google.sheets({
    version: 'v4',
    auth: client,
  });
};

// 默认超时配置
const DEFAULT_TIMEOUT = 30000; // 30 秒

/**
 * 带超时和重试的 API 调用包装器
 */
const withTimeoutAndRetry = async <T>(
  fn: () => Promise<T>,
  timeout: number = DEFAULT_TIMEOUT,
  maxRetries: number = 3
): Promise<T> => {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const result = await fn();
      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        logger.warn(`API 调用失败，第 ${attempt} 次重试...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  throw lastError;
};

/**
 * 插入数据到 Sheets
 */
export const insertDataToSheets = async (data: unknown[]): Promise<void> => {
  const sheets = await getSheetsClient();

  try {
    const response = await withTimeoutAndRetry(() =>
      sheets.spreadsheets.values.append({
        spreadsheetId: GOOGLE_CONFIG.sheetId,
        range: '工作表1!A1:AD',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [data],
        },
      }).then(r => r)
    );

    logger.success('数据已写入 Google Sheets');
    logger.debug('写入结果', response.data);
  } catch (error) {
    const message = `Google Sheets 写入失败: ${error}`;
    core.setFailed(message);
    throw new Error(message);
  }
};

/**
 * 获取 Sheets 最新数据
 */
export const getLatestSheetsData = async (): Promise<string[]> => {
  const sheets = await getSheetsClient();

  try {
    const response = await withTimeoutAndRetry(() =>
      sheets.spreadsheets.values.get({
        spreadsheetId: GOOGLE_CONFIG.sheetId,
        range: '工作表1!A1:AD',
      }).then(r => r)
    );

    return last(response.data.values) ?? [];
  } catch (error) {
    const message = `Google Sheets 读取失败: ${error}`;
    core.setFailed(message);
    throw new Error(message);
  }
};

/**
 * 获取 Sheets 中最新的活动 ID
 */
export const getLatestActivityIdInSheets = async (): Promise<string> => {
  const data = await getLatestSheetsData();
  const id = data[9] ?? '0';
  logger.info(`Sheets 中最新活动 ID: ${id}`);
  return String(id);
};