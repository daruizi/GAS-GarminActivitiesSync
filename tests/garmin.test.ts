import { describe, it, expect, vi, beforeEach } from 'vitest';

// 共享 mock 实例（vi.hoisted 保证在 vi.mock 工厂执行时已初始化）
const mocks = vi.hoisted(() => ({
  db: {
    getSession: vi.fn(),
    saveSession: vi.fn().mockResolvedValue(undefined),
    updateSession: vi.fn().mockResolvedValue(undefined),
  },
  client: {
    loadToken: vi.fn(),
    getUserProfile: vi.fn(),
    login: vi.fn(),
    exportToken: vi
      .fn()
      .mockReturnValue({
        oauth1: { oauth_token: 'a', oauth_token_secret: 'b' },
        oauth2: { access_token: 't' },
      }),
  },
}));

vi.mock('garmin-connect', () => ({
  GarminConnect: vi.fn().mockImplementation(() => mocks.client),
}));

vi.mock('../src/utils/database', () => mocks.db);

vi.mock('../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@actions/core', () => ({
  setFailed: vi.fn(),
}));

vi.mock('../src/config', () => ({
  GARMIN_CONFIG: {
    CN: { username: 'cn@test.com', password: 'pw' },
    GLOBAL: { username: 'g@test.com', password: 'pw' },
    timeout: 30000,
  },
  FILE_CONFIG: { DOWNLOAD_DIR: '/tmp/dl' },
  GARMIN_URL: { ACTIVITY_URL: 'https://example.com/' },
  validateConfig: () => true,
}));

vi.mock('../src/utils/format', () => ({
  formatPace: vi.fn(),
  delay: vi.fn().mockResolvedValue(undefined),
  number2capital: vi.fn(),
}));

vi.mock('../src/utils/rateLimiter', () => ({
  defaultRateLimiter: { executeWithRateLimit: vi.fn((fn: () => Promise<unknown>) => fn()) },
}));

import { createGarminClient } from '../src/clients/garmin';

describe('createGarminClient - session 续期路径', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认 exportToken 返回有效结构
    mocks.client.exportToken.mockReturnValue({
      oauth1: { oauth_token: 'a', oauth_token_secret: 'b' },
      oauth2: { access_token: 't', expires_at: 9999999999 },
    });
  });

  it('access token 已过期时也不应主动 login() —— 由 401 拦截器用 refresh token 续期', async () => {
    // 保存的 session 中 access token 早已过期（expires_at 在过去）。
    // v2.4.0 的回归正是在此触发 client.login() → 命中 /preauthorized → 风控 400。
    // 修复后应只调 getUserProfile()，交由库的 401 拦截器刷新。
    mocks.db.getSession.mockResolvedValue({
      oauth1: { oauth_token: 'a', oauth_token_secret: 'b' },
      oauth2: { access_token: 'old', expires_at: 1000 },
    });
    mocks.client.getUserProfile.mockResolvedValue({
      fullName: 'Test User',
      userName: 'g@test.com',
      location: 'X',
    });

    await createGarminClient('GLOBAL');

    expect(mocks.client.loadToken).toHaveBeenCalledTimes(1);
    expect(mocks.client.getUserProfile).toHaveBeenCalled();
    // ★ 核心回归断言：即便 access token 过期，也不走完整 SSO login()
    expect(mocks.client.login).not.toHaveBeenCalled();
    // 持久化（可能已被拦截器刷新的）session
    expect(mocks.db.updateSession).toHaveBeenCalledTimes(1);
  });

  it('getUserProfile 抛错（refresh token 也失效）时才回退到完整账密 login()', async () => {
    mocks.db.getSession.mockResolvedValue({
      oauth1: { oauth_token: 'a', oauth_token_secret: 'b' },
      oauth2: { access_token: 'old', expires_at: 1000 },
    });
    // 首次 getUserProfile（验证）抛错 → 触发 catch → login()；
    // 随后的 getUserProfile（取 userInfo）正常返回
    mocks.client.getUserProfile
      .mockRejectedValueOnce(new Error('HTTP Error (400): Bad Request'))
      .mockResolvedValueOnce({ fullName: 'Test User', userName: 'g@test.com', location: 'X' });
    mocks.client.login.mockResolvedValue(undefined);

    await createGarminClient('GLOBAL');

    expect(mocks.client.loadToken).toHaveBeenCalledTimes(1);
    expect(mocks.client.login).toHaveBeenCalledTimes(1);
    expect(mocks.client.login).toHaveBeenCalledWith('g@test.com', 'pw');
    expect(mocks.db.updateSession).toHaveBeenCalledTimes(1);
  });

  it('无保存 session 时执行首次 login() 并 saveSession', async () => {
    mocks.db.getSession.mockResolvedValue(null);
    mocks.client.login.mockResolvedValue(undefined);
    mocks.client.getUserProfile.mockResolvedValue({
      fullName: 'Test User',
      userName: 'g@test.com',
      location: 'X',
    });

    await createGarminClient('GLOBAL');

    expect(mocks.client.login).toHaveBeenCalledTimes(1);
    expect(mocks.client.loadToken).not.toHaveBeenCalled();
    expect(mocks.db.saveSession).toHaveBeenCalledTimes(1);
    expect(mocks.db.updateSession).not.toHaveBeenCalled();
  });

  it('CN 区域校验 fullName 非空', async () => {
    mocks.db.getSession.mockResolvedValue({
      oauth1: { oauth_token: 'a', oauth_token_secret: 'b' },
      oauth2: { access_token: 't', expires_at: 9999999999 },
    });
    mocks.client.getUserProfile.mockResolvedValue({
      fullName: '测试用户',
      userName: 'cn@test.com',
      location: 'CN',
    });

    const client = await createGarminClient('CN');
    expect(client).toBe(mocks.client);
  });

  it('CN 区域 fullName 为空时抛错', async () => {
    mocks.db.getSession.mockResolvedValue({
      oauth1: { oauth_token: 'a', oauth_token_secret: 'b' },
      oauth2: { access_token: 't', expires_at: 9999999999 },
    });
    mocks.client.getUserProfile.mockResolvedValue({
      fullName: '   ',
      userName: 'cn@test.com',
      location: 'CN',
    });

    await expect(createGarminClient('CN')).rejects.toThrow('佳明中国区登录失败');
  });
});
