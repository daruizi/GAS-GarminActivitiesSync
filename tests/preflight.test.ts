import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

// Mock retry
vi.mock('../src/utils/retry', () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

describe('runPreflight', () => {
  let runPreflight: typeof import('../src/utils/preflight').runPreflight;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import('../src/utils/preflight');
    runPreflight = mod.runPreflight;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should pass when all endpoints are reachable', async () => {
    // Mock fetch to return success for all endpoints
    const fetchMock = vi.fn().mockResolvedValue({ status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    const result = await runPreflight('GLOBAL', 'CN');

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.cn.sso).toBe(true);
    expect(result.cn.connect).toBe(true);
    expect(result.global.sso).toBe(true);
    expect(result.global.connect).toBe(true);
  });

  it('should fail when an endpoint is unreachable', async () => {
    // Mock fetch: succeed for CN, fail for Global
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('garmin.com')) {
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve({ status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(runPreflight('GLOBAL', 'CN')).rejects.toThrow('网络预检失败');
  });

  it('should treat 4xx responses as reachable (network is up)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 403 });
    vi.stubGlobal('fetch', fetchMock);

    const result = await runPreflight('GLOBAL', 'CN');
    expect(result.success).toBe(true);
  });

  it('should handle timeout gracefully', async () => {
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          // Simulate abort
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(runPreflight('GLOBAL', 'CN')).rejects.toThrow('网络预检失败');
  });

  it('should check both source and target regions', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await runPreflight('CN', 'GLOBAL');

    // Should have called fetch for CN SSO, CN Connect, Global SSO, Global Connect
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
