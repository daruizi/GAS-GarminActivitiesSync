/**
 * Garmin 客户端模块 - 统一处理 CN 和 Global 区域
 */

import { GarminConnect } from 'garmin-connect';
import fs from 'fs';
import path from 'path';
import decompress from 'decompress';
import * as core from '@actions/core';

import { GARMIN_CONFIG, FILE_CONFIG, validateConfig, GARMIN_URL } from '../config';
import { GarminRegion, GarminClient, RunningStatistics } from '../types';
import { getSession, saveSession, updateSession } from '../utils/database';
import { logger } from '../utils/logger';
import { formatPace } from '../utils/format';
import { defaultRateLimiter } from '../utils/rateLimiter';

/**
 * 清理下载的临时文件
 * @param filePath 活动文件路径
 * @param activityId 活动 ID
 */
export const cleanupDownloadedFiles = (filePath: string, activityId: number): void => {
  try {
    const dir = path.dirname(filePath);
    const zipFile = path.join(dir, `${activityId}.zip`);

    // 删除活动文件
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.debug(`已清理活动文件: ${filePath}`);
    }

    // 删除 zip 文件
    if (fs.existsSync(zipFile)) {
      fs.unlinkSync(zipFile);
      logger.debug(`已清理压缩包: ${zipFile}`);
    }
  } catch (error) {
    logger.warn(`清理文件失败: ${error}`);
  }
};

/**
 * 清理下载目录中的所有文件
 */
export const cleanupDownloadDir = (): void => {
  const dir = FILE_CONFIG.DOWNLOAD_DIR;

  try {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        fs.unlinkSync(filePath);
      }
      logger.debug(`已清理下载目录: ${dir}`);
    }
  } catch (error) {
    logger.warn(`清理下载目录失败: ${error}`);
  }
};

/**
 * 创建 Garmin 客户端
 */
export const createGarminClient = async (region: GarminRegion): Promise<GarminClient> => {
  // 验证配置
  if (!validateConfig(region)) {
    const errMsg = `请填写 ${region === 'CN' ? '中国区' : '国际区'} 用户名及密码`;
    core.setFailed(errMsg);
    throw new Error(errMsg);
  }

  const config = GARMIN_CONFIG[region];
  const domain = region === 'CN' ? 'garmin.cn' : undefined;

  const client = new GarminConnect(
    {
      username: config.username,
      password: config.password,
    },
    domain
  );

  // 配置 axios 超时时间
  const axiosClient = (
    client as unknown as { client: { client: { defaults: { timeout: number } } } }
  )?.client?.client;
  if (axiosClient?.defaults) {
    axiosClient.defaults.timeout = GARMIN_CONFIG.timeout || 30000;
    logger.debug(`已设置请求超时: ${GARMIN_CONFIG.timeout || 30000}ms`);
  }

  // 尝试使用已保存的 Session
  const savedSession = await getSession(region);

  if (!savedSession) {
    // 无保存的 Session，执行登录
    logger.info(`${region}: 执行登录...`);
    await client.login();
    await saveSession(region, client.exportToken());
  } else {
    // 使用保存的 Session
    try {
      logger.info(`${region}: 使用已保存的 Session 登录`);
      await client.loadToken(savedSession.oauth1, savedSession.oauth2);
    } catch {
      // Session 失效，重新登录
      logger.warn(`${region}: Session 已失效，重新登录...`);
      await client.login(config.username, config.password);
    }
    // 无论是加载成功还是重新登录，都更新 Session 以刷新 token 过期时间
    await updateSession(region, client.exportToken());
  }

  // 验证登录
  const userInfo = await client.getUserProfile();
  const { fullName, userName: emailAddress, location } = userInfo;

  // 改进的验证逻辑：处理空字符串情况
  if (region === 'CN' && !fullName?.trim()) {
    throw new Error('佳明中国区登录失败');
  }
  if (region === 'GLOBAL' && !emailAddress?.trim()) {
    throw new Error('佳明国际区登录失败，请检查账号密码或网络环境');
  }

  logger.success(`${region} 登录成功`, { fullName, emailAddress, location });

  return client;
};

/**
 * 下载活动原始数据
 */
// 缓存下载目录创建状态，避免每次下载都调用 existsSync
let downloadDirCreated = false;

export const downloadActivity = async (
  activityId: number,
  client: GarminClient
): Promise<string> => {
  const dir = FILE_CONFIG.DOWNLOAD_DIR;

  if (!downloadDirCreated) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    downloadDirCreated = true;
  }

  // 尝试按序下载不同的格式，优先下载原版zip(内含fit)
  const typesToTry = ['zip', 'tcx', 'gpx'] as const;

  let downloadedType = '';
  let lastError: any;

  for (const type of typesToTry) {
    try {
      await defaultRateLimiter.executeWithRateLimit(() =>
        client.downloadOriginalActivityData({ activityId } as any, dir, type)
      );
      downloadedType = type;
      break; // 成功则跳出循环
    } catch (err: any) {
      lastError = err;
      const errMsg = String(err);
      if (errMsg.includes('404') || errMsg.includes('Not Found')) {
        logger.debug(`活动 ${activityId} 下载 ${type} 格式返回 404，尝试下一种格式...`);
        continue;
      }
      throw err; // 其他严重报错直接抛出
    }
  }

  if (!downloadedType) {
    throw lastError || new Error(`所有格式下载均失败: ${activityId}`);
  }

  let filePath = '';

  if (downloadedType === 'zip') {
    // 解压 ZIP 获取实际文件
    const zipFile = path.join(dir, `${activityId}.zip`);
    const unzipped = await decompress(zipFile, dir);
    const fileName = unzipped?.[0]?.path;

    if (!fileName) {
      throw new Error(`解压失败: ${activityId}`);
    }
    filePath = path.join(dir, fileName);
  } else {
    // tcx 或 gpx 直接是该文件
    filePath = path.join(dir, `${activityId}.${downloadedType}`);
  }

  logger.debug(`下载完成: ${filePath}`);

  return filePath;
};

/**
 * 上传活动数据
 */
export const uploadActivity = async (filePath: string, client: GarminClient): Promise<void> => {
  try {
    // 使用速率限制器控制上传频率
    const result = await defaultRateLimiter.executeWithRateLimit(() =>
      client.uploadActivity(filePath)
    );
    logger.success('上传成功', result);
  } catch (error) {
    logger.error('上传失败', error);
    throw error;
  }
};

/**
 * 获取跑步统计数据
 */
export const getRunningStatistics = async (client: GarminClient): Promise<RunningStatistics> => {
  const acts = await client.getActivities(0, 10);

  // 筛选跑步类型活动
  const runningAct = acts.filter(act => act?.activityType?.typeKey?.includes('running'))[0];

  if (!runningAct) {
    throw new Error('未找到跑步活动');
  }

  const {
    activityId,
    activityName,
    startTimeLocal,
    distance,
    duration,
    averageSpeed,
    averageHR,
    maxHR,
    averageRunningCadenceInStepsPerMinute,
    aerobicTrainingEffect,
    anaerobicTrainingEffect,
    avgGroundContactTime,
    avgStrideLength,
    vO2MaxValue,
    avgVerticalOscillation,
    avgVerticalRatio,
    avgGroundContactBalance,
    trainingEffectLabel,
    activityTrainingLoad,
  } = runningAct;

  const { pace, text: paceText } = formatPace(averageSpeed || 0);

  return {
    activityId,
    activityName,
    startTimeLocal,
    distance,
    duration,
    averageSpeed,
    averagePace: pace,
    averagePaceText: paceText,
    averageHR,
    maxHR,
    averageRunningCadenceInStepsPerMinute,
    aerobicTrainingEffect: aerobicTrainingEffect as number | undefined,
    anaerobicTrainingEffect: anaerobicTrainingEffect as number | undefined,
    avgGroundContactTime: avgGroundContactTime as number | undefined,
    avgStrideLength,
    vO2MaxValue,
    avgVerticalOscillation: avgVerticalOscillation as number | undefined,
    avgVerticalRatio: avgVerticalRatio as number | undefined,
    avgGroundContactBalance: avgGroundContactBalance as number | undefined,
    trainingEffectLabel: trainingEffectLabel as string | undefined,
    activityTrainingLoad: activityTrainingLoad as number | undefined,
    activityURL: GARMIN_URL.ACTIVITY_URL + activityId,
  };
};
