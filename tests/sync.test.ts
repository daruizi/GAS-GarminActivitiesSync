import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withRetry } from '../src/utils/retry';

// Mock logger
vi.mock('../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock format delay
vi.mock('../src/utils/format', () => ({
  delay: vi.fn().mockResolvedValue(undefined),
  number2capital: vi.fn((n: number) => String(n)),
  formatPace: vi.fn(),
}));

describe('withRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const result = await withRetry(fn, { maxRetries: 3, baseDelay: 100, maxDelay: 1000, timeout: 0 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const result = await withRetry(fn, { maxRetries: 3, baseDelay: 100, maxDelay: 1000, timeout: 0 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after exhausting retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    await expect(
      withRetry(fn, { maxRetries: 2, baseDelay: 100, maxDelay: 1000, timeout: 0 })
    ).rejects.toThrow('always fails');

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should use context in log messages', async () => {
    const { logger } = await import('../src/utils/logger');
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('test error'))
      .mockResolvedValue('ok');

    await withRetry(fn, { maxRetries: 2, baseDelay: 100, maxDelay: 1000, timeout: 0 }, 'TestOp');

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('[TestOp]')
    );
  });

  it('should timeout if configured', async () => {
    const fn = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 5000, 'late'))
    );

    await expect(
      withRetry(fn, { maxRetries: 1, baseDelay: 100, maxDelay: 1000, timeout: 50 }, 'TimeoutTest')
    ).rejects.toThrow('超时');
  });
});

describe('number2capital', () => {
  // Import after mocks
  let number2capital: (n: number) => string;

  beforeEach(async () => {
    vi.resetModules();
    // Re-import the real module without mocks for this test
    const mod = await vi.importActual<typeof import('../src/utils/format')>('../src/utils/format');
    number2capital = mod.number2capital;
  });

  it('should convert 0', () => {
    expect(number2capital(0)).toBe('零');
  });

  it('should convert single digits', () => {
    expect(number2capital(1)).toBe('一');
    expect(number2capital(5)).toBe('五');
    expect(number2capital(9)).toBe('九');
  });

  it('should convert 10 to "十" (not "一十")', () => {
    expect(number2capital(10)).toBe('十');
  });

  it('should convert teens', () => {
    expect(number2capital(11)).toBe('十一');
    expect(number2capital(15)).toBe('十五');
  });

  it('should convert tens', () => {
    expect(number2capital(20)).toBe('二十');
    expect(number2capital(23)).toBe('二十三');
    expect(number2capital(99)).toBe('九十九');
  });

  it('should convert hundreds with zeros', () => {
    expect(number2capital(100)).toBe('一百');
    expect(number2capital(101)).toBe('一百零一');
    expect(number2capital(110)).toBe('一百一十');
  });

  it('should convert thousands', () => {
    expect(number2capital(1000)).toBe('一千');
    expect(number2capital(1001)).toBe('一千零一');
    expect(number2capital(2345)).toBe('二千三百四十五');
  });
});
