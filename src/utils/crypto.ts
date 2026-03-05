/**
 * 加密工具模块
 */

import CryptoJS from 'crypto-js';
import { DB_CONFIG } from '../config';

/**
 * 加密数据
 */
export const encrypt = (data: Record<string, unknown>): string => {
  const str = JSON.stringify(data);
  return CryptoJS.AES.encrypt(str, DB_CONFIG.aesKey).toString();
};

/**
 * 解密数据
 */
export const decrypt = <T = Record<string, unknown>>(encryptedStr: string): T => {
  const bytes = CryptoJS.AES.decrypt(encryptedStr, DB_CONFIG.aesKey);
  const str = bytes.toString(CryptoJS.enc.Utf8);
  return JSON.parse(str) as T;
};