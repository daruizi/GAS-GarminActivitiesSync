import { describe, it, expect } from 'vitest';
import {
  checkAESKey,
  encrypt,
  decrypt,
} from '../src/utils/crypto';

// Mock the config module
vi.mock('../src/config', () => ({
  DB_CONFIG: {
    aesKey: 'TestKey12345678!@',
  },
}));

import { vi } from 'vitest';

describe('Crypto Utils', () => {
  describe('checkAESKey', () => {
    it('should pass with valid key', () => {
      // Since we mocked the config, this should not throw
      expect(() => checkAESKey()).not.toThrow();
    });
  });

  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt data correctly', () => {
      const data = { test: 'value', number: 123 };

      const encrypted = encrypt(data);
      expect(typeof encrypted).toBe('string');
      expect(encrypted).not.toBe(JSON.stringify(data));

      const decrypted = decrypt(encrypted);
      expect(decrypted).toEqual(data);
    });

    it('should produce different encrypted values for same data', () => {
      const data = { test: 'value' };

      const encrypted1 = encrypt(data);
      const encrypted2 = encrypt(data);

      // AES encryption should produce different ciphertext each time due to IV
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should throw on invalid encrypted string', () => {
      expect(() => decrypt('invalid-encrypted-string')).toThrow();
    });
  });
});