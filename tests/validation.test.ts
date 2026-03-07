import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  validateGarminAccount,
  validateAESKey,
  validateNotificationConfig,
  validateAllConfig,
} from '../src/utils/validation';

describe('Validation Utils', () => {
  describe('validateGarminAccount', () => {
    it('should fail when username is empty', () => {
      const result = validateGarminAccount(undefined, 'password123', 'CN');
      expect(result.success).toBe(false);
      expect(result.errors).toContain('中国区用户名未配置');
    });

    it('should fail when password is empty', () => {
      const result = validateGarminAccount('test@example.com', undefined, 'CN');
      expect(result.success).toBe(false);
      expect(result.errors).toContain('中国区密码未配置');
    });

    it('should fail when username is not an email', () => {
      const result = validateGarminAccount('invalid-email', 'password123', 'CN');
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('格式不正确'))).toBe(true);
    });

    it('should fail when password is too short', () => {
      const result = validateGarminAccount('test@example.com', '12345', 'CN');
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('密码长度不足'))).toBe(true);
    });

    it('should pass with valid credentials', () => {
      const result = validateGarminAccount('test@example.com', 'password123', 'CN');
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should use correct region name in error messages', () => {
      const cnResult = validateGarminAccount(undefined, undefined, 'CN');
      expect(cnResult.errors.some(e => e.includes('中国区'))).toBe(true);

      const globalResult = validateGarminAccount(undefined, undefined, 'GLOBAL');
      expect(globalResult.errors.some(e => e.includes('国际区'))).toBe(true);
    });
  });

  describe('validateAESKey', () => {
    it('should warn when key is not configured', () => {
      const result = validateAESKey(undefined);
      expect(result.success).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should fail when key is too short', () => {
      const result = validateAESKey('short');
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('至少 16 个字符'))).toBe(true);
    });

    it('should warn when key complexity is low', () => {
      const result = validateAESKey('aaaaaaaaaaaaaaaa'); // 16 个相同字符
      expect(result.warnings.some(e => e.includes('复杂度较低'))).toBe(true);
    });

    it('should pass with valid complex key', () => {
      const result = validateAESKey('MySecureKey123!@#');
      expect(result.success).toBe(true);
    });
  });

  describe('validateNotificationConfig', () => {
    it('should warn when no notification is configured', () => {
      const result = validateNotificationConfig();
      expect(result.warnings.some(e => e.includes('未配置任何通知方式'))).toBe(true);
    });

    it('should fail when telegram is partially configured', () => {
      const result = validateNotificationConfig(undefined, 'bot-token', undefined, undefined);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('缺少 Chat ID'))).toBe(true);
    });

    it('should pass when at least one notification is configured', () => {
      const result = validateNotificationConfig('bark-key');
      expect(result.success).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('validateAllConfig', () => {
    it('should validate all configurations', () => {
      const result = validateAllConfig({
        garminUsername: 'test@example.com',
        garminPassword: 'password123',
        garminGlobalUsername: 'global@example.com',
        garminGlobalPassword: 'password456',
        aesKey: 'MySecureKey123!@#',
        barkKey: 'test-bark-key',
      });

      expect(result.success).toBe(true);
    });

    it('should collect all errors', () => {
      const result = validateAllConfig({
        garminUsername: 'invalid-email',
        garminPassword: '123',
        garminGlobalUsername: undefined,
        garminGlobalPassword: undefined,
      });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});