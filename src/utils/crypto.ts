/**
 * 加密工具模块
 */

import CryptoJS from 'crypto-js';
import { DB_CONFIG } from '../config';
import { logger } from './logger';

/**
 * 检查 AES 密钥是否配置
 */
export const checkAESKey = (): void => {
  if (!DB_CONFIG.aesKey) {
    throw new Error('AESKEY 未配置，请在环境变量中设置 AESKEY');
  }
};

/**
 * 加密数据
 */
export const encrypt = (data: Record<string, unknown>): string => {
  checkAESKey();
  const str = JSON.stringify(data);
  return CryptoJS.AES.encrypt(str, DB_CONFIG.aesKey).toString();
};
/**
 * 解密数据
 */
export const decrypt = <T = Record<string, unknown>>(encryptedStr: string): T => {
  checkAESKey();
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedStr, DB_CONFIG.aesKey);
    const str = bytes.toString(CryptoJS.enc.Utf8);
    if (!str) {
      throw new Error('解密失败：数据为空或密钥错误');
    }
    return JSON.parse(str) as T;
  } catch (error) {
    // 移除 logger.error(error) 以避免在日志中打印红色的错误堆栈
    // 外层的 getSession 捕获到 Error 后会自动执行降级(重新登录)逻辑
    throw new Error('缓存解密失败(密钥已变更或数据损坏)，将重新登录');
  }
};
