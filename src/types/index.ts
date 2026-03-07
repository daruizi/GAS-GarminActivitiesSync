/**
 * 类型定义模块
 */

// Garmin 区域类型
export type GarminRegion = 'CN' | 'GLOBAL';

// Garmin 客户端类型（从 garmin-connect 库导入）
import { GarminConnect } from 'garmin-connect';
export type GarminClient = InstanceType<typeof GarminConnect>;

// 活动数据类型
export interface GarminActivity {
  activityId: number;
  activityName: string;
  startTimeLocal: string;
  activityType?: {
    typeKey: string;
  };
  distance?: number;
  duration?: number;
  averageSpeed?: number;
  averageHR?: number;
  maxHR?: number;
  averageRunningCadenceInStepsPerMinute?: number;
  aerobicTrainingEffect?: number;
  anaerobicTrainingEffect?: number;
  avgGroundContactTime?: number;
  avgStrideLength?: number;
  vO2MaxValue?: number;
  avgVerticalOscillation?: number;
  avgVerticalRatio?: number;
  avgGroundContactBalance?: number;
  trainingEffectLabel?: string;
  activityTrainingLoad?: number;
}

// 用户信息类型
export interface GarminUserInfo {
  fullName: string;
  userName: string;
  location?: string;
}

// Session 数据类型 - 定义 OAuth token 结构
export interface Oauth1Token {
  oauth_token: string;
  oauth_token_secret: string;
}

export interface Oauth2Token {
  scope: string;
  jti: string;
  access_token: string;
  token_type: string;
  refresh_token: string;
  expires_in: number;
  refresh_token_expires_in: number;
  expires_at: number;
  refresh_token_expires_at: number;
  last_update_date: string;
  expires_date: string;
}

export interface SessionData {
  oauth1: Oauth1Token;
  oauth2: Oauth2Token;
}

// 数据库 Session 记录
export interface SessionRecord {
  id: number;
  user: string;
  region: string;
  session: string;
}

// 跑步统计数据
export interface RunningStatistics {
  activityId: number;
  activityName: string;
  startTimeLocal: string;
  distance?: number;
  duration?: number;
  averageSpeed?: number;
  averagePace: number;
  averagePaceText: string;
  averageHR?: number;
  maxHR?: number;
  averageRunningCadenceInStepsPerMinute?: number;
  aerobicTrainingEffect?: number;
  anaerobicTrainingEffect?: number;
  avgGroundContactTime?: number;
  avgStrideLength?: number;
  vO2MaxValue?: number;
  avgVerticalOscillation?: number;
  avgVerticalRatio?: number;
  avgGroundContactBalance?: number;
  trainingEffectLabel?: string;
  activityTrainingLoad?: number;
  activityURL: string;
}

// RQ 数据类型
export interface RQData {
  updateAt: number;
  rqTime: string;
  rqLoad: string;
  rqTired: string;
  rqRunLevelNow: string;
  rqRunLevel: string;
  runLevelDesc: string;
  rqTrend1: string;
  rqTrend2: string;
}

// 同步结果类型
export interface SyncResult {
  success: boolean;
  count: number;
  message: string;
  activities?: string[];
}

// 迁移结果类型
export interface MigrateResult {
  success: boolean;
  total: number;
  migrated: number;
  failed: number;
  errors?: string[];
}

// 迁移进度记录
export interface MigrationProgress {
  id?: number;
  sourceRegion: string;
  targetRegion: string;
  lastProcessedIndex: number;
  totalActivities: number;
  updatedAt: string;
}

// 已同步活动记录
export interface SyncedActivityRecord {
  id?: number;
  activityId: number;
  sourceRegion: string;
  targetRegion: string;
  syncedAt: string;
}