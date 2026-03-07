/**
 * Garmin 客户端模块 - 统一处理 CN 和 Global 区域
 */

import { GarminConnect } from 'garmin-connect';
import fs from 'fs';
import path from 'path';
import decompress from 'decompress';
import filter from 'lodash/filter';
import * as core from '@actions/core';

import { GARMIN_CONFIG, FILE_CONFIG, validateConfig, GARMIN_URL } from '../config';
import { GarminRegion, GarminClient, GarminActivity, GarminUserInfo, RunningStatistics } from '../types';
import { initDB, getSession, saveSession, updateSession } from '../utils/database';
import { logger } from '../utils/logger';
import { formatPace } from '../utils/format';

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
  const axiosClient = (client as unknown as { client: { client: { defaults: { timeout: number } } } })?.client?.client;
  if (axiosClient?.defaults) {
    axiosClient.defaults.timeout = GARMIN_CONFIG.timeout || 30000;
    logger.debug(`已设置请求超时: ${GARMIN_CONFIG.timeout || 30000}ms`);
  }

  // 初始化数据库
  await initDB();

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
      await updateSession(region, client.exportToken());
    }
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
export const downloadActivity = async (
  activityId: number,
  client: GarminClient
): Promise<string> => {
  const dir = FILE_CONFIG.DOWNLOAD_DIR;

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const activity = await client.getActivity({ activityId });
  await client.downloadOriginalActivityData(activity, dir);

  const zipFile = `${dir}/${activityId}.zip`;
  const unzipped = await decompress(zipFile, dir);
  const fileName = unzipped?.[0]?.path;

  if (!fileName) {
    throw new Error(`解压失败: ${activityId}`);
  }

  const filePath = `${dir}/${fileName}`;
  logger.debug(`下载完成: ${filePath}`);

  return filePath;
};

/**
 * 上传活动数据
 */
export const uploadActivity = async (
  filePath: string,
  client: GarminClient
): Promise<void> => {
  try {
    const result = await client.uploadActivity(filePath);
    logger.success('上传成功', result);
  } catch (error) {
    logger.error('上传失败', error);
    throw error;
  }
};

/**
 * 获取跑步统计数据
 */
export const getRunningStatistics = async (
  client: GarminClient
): Promise<RunningStatistics> => {
  const acts = await client.getActivities(0, 10);

  // 筛选跑步类型活动
  const runningAct = filter(acts, (act) =>
    act?.activityType?.typeKey?.includes('running')
  )[0];

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