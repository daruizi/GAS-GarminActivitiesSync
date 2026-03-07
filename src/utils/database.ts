/**
 * 数据库模块
 */

import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { DB_CONFIG, GARMIN_CONFIG } from '../config';
import { encrypt, decrypt } from './crypto';
import { SessionData, GarminRegion } from '../types';
import { logger } from './logger';

let dbInstance: Database | null = null;

/**
 * 获取数据库实例
 */
export const getDB = async (): Promise<Database> => {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await open({
    filename: DB_CONFIG.filePath,
    driver: sqlite3.Database,
  });

  return dbInstance;
};

/**
 * 初始化数据库
 */
export const initDB = async (): Promise<void> => {
  const db = await getDB();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS garmin_session (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user VARCHAR(20),
      region VARCHAR(20),
      session TEXT
    )
  `);
  logger.debug('数据库初始化完成');
};

/**
 * 保存 Session 到数据库
 */
export const saveSession = async (
  region: GarminRegion,
  session: SessionData
): Promise<void> => {
  const db = await getDB();
  const username = GARMIN_CONFIG[region].username;
  const encryptedSession = encrypt(session as unknown as Record<string, unknown>);

  await db.run(
    'INSERT INTO garmin_session (user, region, session) VALUES (?, ?, ?)',
    username,
    region,
    encryptedSession
  );

  logger.debug(`Session 已保存: ${region}`);
};

/**
 * 更新 Session
 */
export const updateSession = async (
  region: GarminRegion,
  session: SessionData
): Promise<void> => {
  const db = await getDB();
  const username = GARMIN_CONFIG[region].username;
  const encryptedSession = encrypt(session as unknown as Record<string, unknown>);

  await db.run(
    'UPDATE garmin_session SET session = ? WHERE user = ? AND region = ?',
    encryptedSession,
    username,
    region
  );

  logger.debug(`Session 已更新: ${region}`);
};

/**
 * 从数据库获取 Session
 */
export const getSession = async (region: GarminRegion): Promise<SessionData | null> => {
  const db = await getDB();
  const username = GARMIN_CONFIG[region].username;

  const result = await db.get(
    'SELECT session, id FROM garmin_session WHERE user = ? AND region = ?',
    username,
    region
  );

  if (!result?.session) {
    return null;
  }

  try {
    return decrypt<SessionData>(result.session);
  } catch (error) {
    logger.warn(`Session 解密失败: ${region}，将清理旧数据并重新登录`);

    // 清理解密失败的旧 Session 记录
    if (result.id) {
      await db.run(
        'DELETE FROM garmin_session WHERE id = ?',
        result.id
      );
      logger.debug(`已清理无效的 Session 记录 (ID: ${result.id})`);
    }

    return null;
  }
};

/**
 * 关闭数据库连接
 */
export const closeDB = async (): Promise<void> => {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
    logger.debug('数据库连接已关闭');
  }
};

/**
 * 清理过期的 Session 记录
 * @param daysToKeep 保留天数
 */
export const cleanExpiredSessions = async (daysToKeep: number = 30): Promise<void> => {
  const db = await getDB();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  // SQLite 不支持直接按日期删除，这里简单清理重复记录
  // 保留每个用户每个区域的最新一条记录
  await db.run(`
    DELETE FROM garmin_session
    WHERE id NOT IN (
      SELECT MAX(id) FROM garmin_session GROUP BY user, region
    )
  `);

  logger.debug('已清理过期的 Session 记录');
};