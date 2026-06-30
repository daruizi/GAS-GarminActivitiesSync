import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

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

describe('syncHealth', () => {
  let db: Database;
  let initSyncHealthTable: typeof import('../src/utils/syncHealth').initSyncHealthTable;
  let recordSyncSuccess: typeof import('../src/utils/syncHealth').recordSyncSuccess;
  let recordSyncFailure: typeof import('../src/utils/syncHealth').recordSyncFailure;
  let getSyncHealth: typeof import('../src/utils/syncHealth').getSyncHealth;
  let shouldPauseDueToFailures: typeof import('../src/utils/syncHealth').shouldPauseDueToFailures;
  let formatHealthReport: typeof import('../src/utils/syncHealth').formatHealthReport;

  beforeEach(async () => {
    vi.resetModules();

    // Create in-memory database
    db = await open({
      filename: ':memory:',
      driver: sqlite3.Database,
    });

    // Mock getDB to return our in-memory database
    vi.doMock('../src/utils/database', () => ({
      getDB: vi.fn().mockResolvedValue(db),
      initDB: vi.fn(),
      closeDB: vi.fn(),
    }));

    const mod = await import('../src/utils/syncHealth');
    initSyncHealthTable = mod.initSyncHealthTable;
    recordSyncSuccess = mod.recordSyncSuccess;
    recordSyncFailure = mod.recordSyncFailure;
    getSyncHealth = mod.getSyncHealth;
    shouldPauseDueToFailures = mod.shouldPauseDueToFailures;
    formatHealthReport = mod.formatHealthReport;

    await initSyncHealthTable();
  });

  afterEach(async () => {
    await db.close();
    vi.restoreAllMocks();
  });

  describe('initSyncHealthTable', () => {
    it('should create the sync_health table', async () => {
      const tables = await db.all(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='sync_health'"
      );
      expect(tables).toHaveLength(1);
    });

    it('should be idempotent (can be called multiple times)', async () => {
      await initSyncHealthTable();
      await initSyncHealthTable();
      // No error means success
    });
  });

  describe('recordSyncSuccess', () => {
    it('should create a new record on first success', async () => {
      await recordSyncSuccess('GLOBAL', 'CN', 3);

      const health = await getSyncHealth('GLOBAL', 'CN');
      expect(health).not.toBeNull();
      expect(health!.totalSuccess).toBe(1);
      expect(health!.totalFailure).toBe(0);
      expect(health!.consecutiveFailures).toBe(0);
      expect(health!.lastSuccessAt).toBeTruthy();
    });

    it('should increment success count on subsequent successes', async () => {
      await recordSyncSuccess('GLOBAL', 'CN', 1);
      await recordSyncSuccess('GLOBAL', 'CN', 2);
      await recordSyncSuccess('GLOBAL', 'CN', 3);

      const health = await getSyncHealth('GLOBAL', 'CN');
      expect(health!.totalSuccess).toBe(3);
    });

    it('should reset consecutive failures on success', async () => {
      await recordSyncFailure('GLOBAL', 'CN', 'error 1');
      await recordSyncFailure('GLOBAL', 'CN', 'error 2');
      await recordSyncSuccess('GLOBAL', 'CN', 1);

      const health = await getSyncHealth('GLOBAL', 'CN');
      expect(health!.consecutiveFailures).toBe(0);
      expect(health!.totalFailure).toBe(2);
      expect(health!.totalSuccess).toBe(1);
    });
  });

  describe('recordSyncFailure', () => {
    it('should create a new record on first failure', async () => {
      await recordSyncFailure('GLOBAL', 'CN', 'network error');

      const health = await getSyncHealth('GLOBAL', 'CN');
      expect(health).not.toBeNull();
      expect(health!.totalFailure).toBe(1);
      expect(health!.consecutiveFailures).toBe(1);
      expect(health!.lastErrorMessage).toBe('network error');
    });

    it('should increment consecutive failures', async () => {
      await recordSyncFailure('GLOBAL', 'CN', 'error 1');
      await recordSyncFailure('GLOBAL', 'CN', 'error 2');
      await recordSyncFailure('GLOBAL', 'CN', 'error 3');

      const health = await getSyncHealth('GLOBAL', 'CN');
      expect(health!.consecutiveFailures).toBe(3);
      expect(health!.lastErrorMessage).toBe('error 3');
    });
  });

  describe('shouldPauseDueToFailures', () => {
    it('should not pause when no records exist', async () => {
      const result = await shouldPauseDueToFailures('GLOBAL', 'CN');
      expect(result.shouldPause).toBe(false);
      expect(result.consecutiveFailures).toBe(0);
    });

    it('should not pause when consecutive failures are below threshold', async () => {
      await recordSyncFailure('GLOBAL', 'CN', 'error');
      await recordSyncFailure('GLOBAL', 'CN', 'error');

      const result = await shouldPauseDueToFailures('GLOBAL', 'CN', 5);
      expect(result.shouldPause).toBe(false);
      expect(result.consecutiveFailures).toBe(2);
    });

    it('should pause when consecutive failures reach threshold', async () => {
      for (let i = 0; i < 5; i++) {
        await recordSyncFailure('GLOBAL', 'CN', `error ${i}`);
      }

      const result = await shouldPauseDueToFailures('GLOBAL', 'CN', 5);
      expect(result.shouldPause).toBe(true);
      expect(result.consecutiveFailures).toBe(5);
    });

    it('should support custom threshold', async () => {
      await recordSyncFailure('GLOBAL', 'CN', 'error');
      await recordSyncFailure('GLOBAL', 'CN', 'error');
      await recordSyncFailure('GLOBAL', 'CN', 'error');

      const result = await shouldPauseDueToFailures('GLOBAL', 'CN', 3);
      expect(result.shouldPause).toBe(true);
    });

    it('should not pause if successes interrupt failures', async () => {
      await recordSyncFailure('GLOBAL', 'CN', 'error');
      await recordSyncFailure('GLOBAL', 'CN', 'error');
      await recordSyncSuccess('GLOBAL', 'CN', 1);
      await recordSyncFailure('GLOBAL', 'CN', 'error');

      const result = await shouldPauseDueToFailures('GLOBAL', 'CN', 3);
      expect(result.shouldPause).toBe(false);
      expect(result.consecutiveFailures).toBe(1);
    });
  });

  describe('formatHealthReport', () => {
    it('should format health data into readable report', async () => {
      await recordSyncSuccess('GLOBAL', 'CN', 5);
      await recordSyncSuccess('GLOBAL', 'CN', 3);
      await recordSyncFailure('GLOBAL', 'CN', 'timeout');

      const health = await getSyncHealth('GLOBAL', 'CN');
      expect(health).not.toBeNull();

      const report = formatHealthReport(health!);
      expect(report).toContain('GLOBAL → CN');
      expect(report).toContain('总成功: 2 次');
      expect(report).toContain('总失败: 1 次');
      expect(report).toContain('66.7%');
      expect(report).toContain('连续失败: 1 次');
      expect(report).toContain('timeout');
    });

    it('should handle no data gracefully', () => {
      const health = {
        sourceRegion: 'GLOBAL',
        targetRegion: 'CN',
        totalSuccess: 0,
        totalFailure: 0,
        consecutiveFailures: 0,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastErrorMessage: null,
        updatedAt: new Date().toISOString(),
      };

      const report = formatHealthReport(health);
      expect(report).toContain('N/A');
      expect(report).toContain('从未');
    });
  });

  describe('getSyncHealth', () => {
    it('should return null when no records exist', async () => {
      const health = await getSyncHealth('GLOBAL', 'CN');
      expect(health).toBeNull();
    });

    it('should distinguish between different sync directions', async () => {
      await recordSyncSuccess('GLOBAL', 'CN', 1);
      await recordSyncSuccess('CN', 'GLOBAL', 1);
      await recordSyncSuccess('CN', 'GLOBAL', 1);

      const healthG2C = await getSyncHealth('GLOBAL', 'CN');
      const healthC2G = await getSyncHealth('CN', 'GLOBAL');

      expect(healthG2C!.totalSuccess).toBe(1);
      expect(healthC2G!.totalSuccess).toBe(2);
    });
  });
});
