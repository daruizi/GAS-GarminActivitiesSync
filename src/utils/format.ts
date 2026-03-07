/**
 * 格式化工具模块
 */

/**
 * 数字转中文大写
 * 用于解决 GitHub Actions 中数字被 *** 替换的问题
 * 支持 0-9999 的中文位制表示（十、百、千）
 */
const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const units = ['', '十', '百', '千'];

export const number2capital = (num: number): string => {
  if (num < 0 || num > 9999) return String(num);
  if (num === 0) return digits[0];

  const str = String(num);
  const len = str.length;
  let result = '';
  let lastWasZero = false;

  for (let i = 0; i < len; i++) {
    const digit = Number(str[i]);
    const unitIndex = len - 1 - i;

    if (digit === 0) {
      lastWasZero = true;
    } else {
      if (lastWasZero && result.length > 0) {
        result += digits[0]; // 插入 "零"
      }
      // 十位为1时省略 "一"（如 10 → "十" 而非 "一十"）
      if (digit === 1 && unitIndex === 1 && result.length === 0) {
        result += units[unitIndex];
      } else {
        result += digits[digit] + units[unitIndex];
      }
      lastWasZero = false;
    }
  }

  return result;
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