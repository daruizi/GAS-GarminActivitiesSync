/**
 * 预检工具模块 - 在同步前验证网络连通性
 *
 * 避免在网络不可达时浪费时间执行完整的登录流程
 */

import { logger } from './logger';
import { withRetry } from './retry';

/**
 * Garmin 服务端点
 */
const GARMIN_ENDPOINTS = {
  CN: {
    sso: 'https://sso.garmin.cn',
    connect: 'https://connect.garmin.cn',
    label: '中国区 (garmin.cn)',
  },
  GLOBAL: {
    sso: 'https://sso.garmin.com',
    connect: 'https://connect.garmin.com',
    label: '国际区 (garmin.com)',
  },
} as const;

/**
 * 预检结果
 */
export interface PreflightResult {
  success: boolean;
  cn: { sso: boolean; connect: boolean };
  global: { sso: boolean; connect: boolean };
  errors: string[];
}

/**
 * 使用 HTTP HEAD 请求检查端点连通性
 * 使用动态 import 避免顶层 await，兼容 ts-node
 */
const checkEndpoint = async (url: string, timeoutMs = 10000): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timer);

    // 任何 HTTP 响应（包括 4xx）都表示网络可达
    // 只有网络错误（DNS 失败、超时、连接拒绝）才算不可达
    return response.status > 0;
  } catch {
    return false;
  }
};

/**
 * 执行预检：验证 Garmin 两端网络连通性
 * @param sourceRegion 源区域
 * @param targetRegion 目标区域
 */
export const runPreflight = async (
  sourceRegion: 'CN' | 'GLOBAL',
  targetRegion: 'CN' | 'GLOBAL'
): Promise<PreflightResult> => {
  logger.info('正在执行网络预检...');

  const regions = [sourceRegion, targetRegion];
  const endpoints = regions.map(r => GARMIN_ENDPOINTS[r]);

  // 并行检查所有端点
  const checks = await Promise.allSettled(
    endpoints.flatMap((ep, idx) => [
      checkEndpoint(ep.sso).then(ok => ({
        region: regions[idx],
        service: 'sso' as const,
        ok,
        label: `${ep.label} SSO`,
      })),
      checkEndpoint(ep.connect).then(ok => ({
        region: regions[idx],
        service: 'connect' as const,
        ok,
        label: `${ep.label} Connect`,
      })),
    ])
  );

  const result: PreflightResult = {
    success: true,
    cn: { sso: false, connect: false },
    global: { sso: false, connect: false },
    errors: [],
  };

  for (const check of checks) {
    if (check.status === 'fulfilled') {
      const { region, service, ok, label } = check.value;
      result[region.toLowerCase() as 'cn' | 'global'][service] = ok;

      if (ok) {
        logger.debug(`✓ ${label} 可达`);
      } else {
        result.success = false;
        result.errors.push(`${label} 不可达`);
        logger.warn(`✗ ${label} 不可达`);
      }
    }
  }

  if (!result.success) {
    const msg = `网络预检失败: ${result.errors.join(', ')}`;
    logger.error(msg);
    throw new Error(msg);
  }

  logger.success('网络预检通过，所有端点可达');
  return result;
};
