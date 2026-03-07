/**
 * 配置模块 - 集中管理所有环境变量和配置
 */

import path from 'path';
import os from 'os';

import { GarminRegion } from '../types';

// Garmin 账户配置
export interface GarminAccountConfig {
  username: string;
  password: string;
}

// 从环境变量获取配置
export const getEnv = (key: string, defaultValue: string = ''): string => {
  return process.env[key] ?? defaultValue;
};

// Garmin 配置
export const GARMIN_CONFIG = {
  // 中国区
  CN: {
    username: getEnv('GARMIN_USERNAME'),
    password: getEnv('GARMIN_PASSWORD'),
    domain: 'garmin.cn' as const,
  },
  // 国际区
  GLOBAL: {
    username: getEnv('GARMIN_GLOBAL_USERNAME'),
    password: getEnv('GARMIN_GLOBAL_PASSWORD'),
    domain: 'garmin.com' as const,
  },
  // 同步配置
  sync: {
    num: parseInt(getEnv('GARMIN_SYNC_NUM', '10'), 10),
    delay: parseInt(getEnv('GARMIN_SYNC_DELAY', '2000'), 10), // 增加默认延迟到 2 秒
  },
  // 迁移配置
  migrate: {
    num: parseInt(getEnv('GARMIN_MIGRATE_NUM', '200'), 10),
    start: parseInt(getEnv('GARMIN_MIGRATE_START', '0'), 10),
  },
  // HTTP 请求超时配置（毫秒）
  timeout: parseInt(getEnv('GARMIN_REQUEST_TIMEOUT', '30000'), 10), // 默认 30 秒
};

// Garmin URL 配置（仅保留使用的属性）
export const GARMIN_URL = {
  ACTIVITY_URL: 'https://connect.garmin.cn/modern/activity/',
};

// 文件配置
export const FILE_CONFIG = {
  SUFFIX: {
    FIT: 'fit',
    GPX: 'gpx',
    TCX: 'tcx',
  },
  DOWNLOAD_DIR: path.join(os.tmpdir(), 'garmin_fit_files'),
  DB_FILE_PATH: './db/garmin.db',
};

// 数据库配置
export const DB_CONFIG = {
  filePath: FILE_CONFIG.DB_FILE_PATH,
  aesKey: getEnv('AESKEY'),
};

// Google Sheets 配置
export const GOOGLE_CONFIG = {
  clientEmail: getEnv('GOOGLE_API_CLIENT_EMAIL'),
  privateKey: getEnv('GOOGLE_API_PRIVATE_KEY')?.replace(/\\n/gm, '\n') || '',
  sheetId: getEnv('GOOGLE_SHEET_ID'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
};

// RunningQuotient 配置
export const RQ_CONFIG = {
  userId: getEnv('RQ_USERID'),
  cookie: getEnv('RQ_COOKIE'),
  csrfToken: getEnv('RQ_CSRF_TOKEN'),
  host: 'https://www.runningquotient.cn/',
  routes: {
    LOGIN: '/user/login',
    OVERVIEW: '/training/getOverView',
    UPDATE: 'training/update-overview?userId=',
  },
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.64 Safari/537.36',
};

// Bark 通知配置
export const BARK_CONFIG = {
  key: getEnv('BARK_KEY'),
  apiUrl: 'https://api.day.app',
};

// 获取 Garmin 账户配置
export const getGarminAccountConfig = (region: GarminRegion): GarminAccountConfig => {
  const config = GARMIN_CONFIG[region];
  return {
    username: config.username,
    password: config.password,
  };
};

// 验证配置
export const validateConfig = (region: GarminRegion): boolean => {
  const config = GARMIN_CONFIG[region];
  return !!(config.username && config.password);
};