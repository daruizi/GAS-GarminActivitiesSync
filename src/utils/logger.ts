/**
 * 日志工具模块
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const formatTime = (): string => {
  return new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const formatMessage = (level: LogLevel, message: string, ...args: unknown[]): string => {
  const timestamp = formatTime();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  return `${prefix} ${message}`;
};

export const logger = {
  info: (message: string, ...args: unknown[]): void => {
    console.log(formatMessage('info', message), ...args);
  },

  warn: (message: string, ...args: unknown[]): void => {
    console.warn(formatMessage('warn', message), ...args);
  },

  error: (message: string, ...args: unknown[]): void => {
    console.error(formatMessage('error', message), ...args);
  },

  debug: (message: string, ...args: unknown[]): void => {
    if (process.env.DEBUG) {
      console.log(formatMessage('debug', message), ...args);
    }
  },

  success: (message: string, ...args: unknown[]): void => {
    console.log(formatMessage('info', `✓ ${message}`), ...args);
  },
};