/**
 * 格式化工具模块
 */

/**
 * 数字转中文大写
 * 用于解决 GitHub Actions 中数字被 *** 替换的问题
 */
const capitals = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

export const number2capital = (number: number): string => {
  return String(number)
    .split('')
    .map((i) => capitals[Number(i)])
    .join('');
};

/**
 * 格式化配速
 */
export const formatPace = (speedMs: number): { pace: number; text: string } => {
  const pace = 1 / ((speedMs / 1000) * 60);
  const paceMin = Math.floor(pace);
  const paceSec = (pace - paceMin) * 60;
  const paceSecText = paceSec < 10 ? `0${paceSec.toFixed(0)}` : paceSec.toFixed(0);

  return {
    pace,
    text: `${paceMin}:${paceSecText}`,
  };
};

/**
 * 延迟函数
 */
export const delay = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};