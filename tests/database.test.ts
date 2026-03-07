import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Use a fixed temp path for test DB
const testDbPath = path.join(os.tmpdir(), 'garmin-test-db.db');

// Mock the config to use test DB path — vi.mock is hoisted, so we must inline the path
vi.mock('../src/config', () => {
  const _path = require('path');
  const _os = require('os');
  return {
    DB_CONFIG: {
      filePath: _path.join(_os.tmpdir(), 'garmin-test-db.db'),
      aesKey: 'TestKey12345678!@TestKey',
    },
    GARMIN_CONFIG: {
      CN: { username: 'test@cn.com', password: 'password123' },
      GLOBAL: { username: 'test@global.com', password: 'password456' },
    },
  };
});

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

import {
  initDB,
  closeDB,
  saveSyncedActivity,
  getSyncedActivityIds,
  saveMigrationProgress,
  getMigrationProgress,
} from '../src/utils/database';

describe('Database Utils', () => {
  beforeEach(async () => {
    // Ensure clean state
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    await initDB();
  });

  afterEach(async () => {
    await closeDB();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('initDB', () => {
    it('should create tables without error', async () => {
      // initDB already called in beforeEach
      // Calling again should be idempotent
      await expect(initDB()).resolves.not.toThrow();
    });
  });

  describe('synced_activities', () => {
    it('should save and retrieve synced activity IDs', async () => {
      await saveSyncedActivity(123, 'GLOBAL', 'CN');
      await saveSyncedActivity(456, 'GLOBAL', 'CN');
      await saveSyncedActivity(789, 'CN', 'GLOBAL');

      const globalToCn = await getSyncedActivityIds('GLOBAL', 'CN');
      expect(globalToCn.has(123)).toBe(true);
      expect(globalToCn.has(456)).toBe(true);
      expect(globalToCn.has(789)).toBe(false);

      const cnToGlobal = await getSyncedActivityIds('CN', 'GLOBAL');
      expect(cnToGlobal.has(789)).toBe(true);
      expect(cnToGlobal.has(123)).toBe(false);
    });

    it('should ignore duplicate inserts', async () => {
      await saveSyncedActivity(123, 'GLOBAL', 'CN');
      await saveSyncedActivity(123, 'GLOBAL', 'CN'); // duplicate

      const ids = await getSyncedActivityIds('GLOBAL', 'CN');
      expect(ids.size).toBe(1);
    });

    it('should return empty set when no records', async () => {
      const ids = await getSyncedActivityIds('GLOBAL', 'CN');
      expect(ids.size).toBe(0);
    });
  });

  describe('migration_progress', () => {
    it('should save and retrieve migration progress', async () => {
      await saveMigrationProgress('GLOBAL', 'CN', 5, 100);

      const progress = await getMigrationProgress('GLOBAL', 'CN');
      expect(progress).not.toBeNull();
      expect(progress!.lastProcessedIndex).toBe(5);
      expect(progress!.totalActivities).toBe(100);
      expect(progress!.sourceRegion).toBe('GLOBAL');
      expect(progress!.targetRegion).toBe('CN');
    });

    it('should update progress on conflict', async () => {
      await saveMigrationProgress('GLOBAL', 'CN', 5, 100);
      await saveMigrationProgress('GLOBAL', 'CN', 10, 100);

      const progress = await getMigrationProgress('GLOBAL', 'CN');
      expect(progress!.lastProcessedIndex).toBe(10);
    });

    it('should return null when no progress', async () => {
      const progress = await getMigrationProgress('CN', 'GLOBAL');
      expect(progress).toBeNull();
    });

    it('should track different directions separately', async () => {
      await saveMigrationProgress('GLOBAL', 'CN', 5, 100);
      await saveMigrationProgress('CN', 'GLOBAL', 20, 200);

      const g2c = await getMigrationProgress('GLOBAL', 'CN');
      const c2g = await getMigrationProgress('CN', 'GLOBAL');

      expect(g2c!.lastProcessedIndex).toBe(5);
      expect(c2g!.lastProcessedIndex).toBe(20);
    });
  });
});
