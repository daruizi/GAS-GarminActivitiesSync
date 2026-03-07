/**
 * 环境变量验证模块
 */

import { z } from 'zod';

/**
 * Garmin 账户配置 Schema
 */
const GarminAccountSchema = z.object({
  username: z.string().email('请输入有效的邮箱地址').min(1, '用户名不能为空'),
  password: z.string().min(6, '密码长度至少 6 个字符'),
});

/**
 * 同步配置 Schema
 */
const SyncConfigSchema = z.object({
  num: z.number().int().min(1).max(50).default(10),
  delay: z.number().int().min(500).max(10000).default(1000),
});

/**
 * 迁移配置 Schema
 */
const MigrateConfigSchema = z.object({
  num: z.number().int().min(1).max(500).default(100),
  start: z.number().int().min(0).default(0),
});

/**
 * AES 密钥验证 Schema
 */
const AESKeySchema = z
  .string()
  .min(16, 'AES 密钥长度至少 16 个字符')
  .refine(
    (key) => {
      const hasLower = /[a-z]/.test(key);
      const hasUpper = /[A-Z]/.test(key);
      const hasNumber = /[0-9]/.test(key);
      const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(key);
      return [hasLower, hasUpper, hasNumber, hasSpecial].filter(Boolean).length >= 2;
    },
    { message: 'AES 密钥应包含大小写字母、数字和特殊字符中的至少两种' }
  );

/**
 * 验证结果
 */
export interface ValidationResult {
  success: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 验证 Garmin 账户配置
 */
export const validateGarminAccount = (
  username: string | undefined,
  password: string | undefined,
  region: 'CN' | 'GLOBAL'
): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!username) {
    errors.push(`${region === 'CN' ? '中国区' : '国际区'}用户名未配置`);
  } else if (!z.string().email().safeParse(username).success) {
    errors.push(`${region === 'CN' ? '中国区' : '国际区'}用户名格式不正确，应为邮箱地址`);
  }

  if (!password) {
    errors.push(`${region === 'CN' ? '中国区' : '国际区'}密码未配置`);
  } else if (password.length < 6) {
    errors.push(`${region === 'CN' ? '中国区' : '国际区'}密码长度不足`);
  }

  return {
    success: errors.length === 0,
    errors,
    warnings,
  };
};

/**
 * 验证 AES 密钥
 */
export const validateAESKey = (key: string | undefined): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!key) {
    warnings.push('AESKEY 未配置，Session 将不会加密存储');
    return { success: true, errors, warnings };
  }

  const result = AESKeySchema.safeParse(key);
  if (!result.success) {
    errors.push(...result.error.errors.map((e) => e.message));
  }

  // 检查密钥复杂度
  const hasLower = /[a-z]/.test(key);
  const hasUpper = /[A-Z]/.test(key);
  const hasNumber = /[0-9]/.test(key);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(key);
  const complexityCount = [hasLower, hasUpper, hasNumber, hasSpecial].filter(Boolean).length;

  if (complexityCount < 3) {
    warnings.push('AESKEY 复杂度较低，建议包含大小写字母、数字和特殊字符');
  }

  return {
    success: errors.length === 0,
    errors,
    warnings,
  };
};

/**
 * 验证通知配置
 */
export const validateNotificationConfig = (
  barkKey?: string,
  telegramBotToken?: string,
  telegramChatId?: string,
  wecomWebhookUrl?: string
): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 检查是否配置了至少一种通知方式
  const hasBark = !!barkKey;
  const hasTelegram = !!(telegramBotToken && telegramChatId);
  const hasWeCom = !!wecomWebhookUrl;

  if (!hasBark && !hasTelegram && !hasWeCom) {
    warnings.push('未配置任何通知方式，运行结果将不会推送');
  }

  // 验证 Telegram 配置完整性
  if (telegramBotToken && !telegramChatId) {
    errors.push('Telegram Bot Token 已配置但缺少 Chat ID');
  }
  if (!telegramBotToken && telegramChatId) {
    errors.push('Telegram Chat ID 已配置但缺少 Bot Token');
  }

  // 验证企业微信 Webhook URL 格式
  if (wecomWebhookUrl && !wecomWebhookUrl.startsWith('https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=')) {
    warnings.push('企业微信 Webhook URL 格式可能不正确');
  }

  return {
    success: errors.length === 0,
    errors,
    warnings,
  };
};

/**
 * 验证所有配置
 */
export const validateAllConfig = (config: {
  garminUsername?: string;
  garminPassword?: string;
  garminGlobalUsername?: string;
  garminGlobalPassword?: string;
  aesKey?: string;
  barkKey?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  wecomWebhookUrl?: string;
}): ValidationResult => {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  // 验证 Garmin 账户
  const cnResult = validateGarminAccount(config.garminUsername, config.garminPassword, 'CN');
  const globalResult = validateGarminAccount(config.garminGlobalUsername, config.garminGlobalPassword, 'GLOBAL');

  allErrors.push(...cnResult.errors, ...globalResult.errors);
  allWarnings.push(...cnResult.warnings, ...globalResult.warnings);

  // 验证 AES 密钥
  const aesResult = validateAESKey(config.aesKey);
  allWarnings.push(...aesResult.warnings);

  // 验证通知配置
  const notifyResult = validateNotificationConfig(
    config.barkKey,
    config.telegramBotToken,
    config.telegramChatId,
    config.wecomWebhookUrl
  );
  allErrors.push(...notifyResult.errors);
  allWarnings.push(...notifyResult.warnings);

  return {
    success: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
};