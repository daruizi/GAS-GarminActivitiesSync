/**
 * 日志工具模块 - 支持控制台输出和文件写入
 */

import fs from 'fs';
import path from 'path';

type LogLevel = 'info' | 'warn' | 'error' | 'debug' | 'success';

// 日志配置
const LOG_CONFIG = {
  logDir: process.env.LOG_DIR || './logs',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
  enableFileLog: process.env.ENABLE_FILE_LOG !== 'false',
};

// 确保日志目录存在
const ensureLogDir = (): void => {
  if (!fs.existsSync(LOG_CONFIG.logDir)) {
    fs.mkdirSync(LOG_CONFIG.logDir, { recursive: true });
  }
};

// 获取当前日期字符串
const getDateString = (): string => {
  return new Date().toISOString().split('T')[0];
};

// 获取时间戳
const getTimestamp = (): string => {
  return new Date().toISOString();
};

// 格式化时间（用于控制台显示）
const formatTime = (): string => {
  return new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

// 日志文件路径
const getLogFilePath = (): string => {
  return path.join(LOG_CONFIG.logDir, `garmin-sync-${getDateString()}.log`);
};

// 检查并轮转日志文件
const rotateLogFile = (filePath: string): void => {
  if (!fs.existsSync(filePath)) return;

  const stats = fs.statSync(filePath);
  if (stats.size >= LOG_CONFIG.maxFileSize) {
    const timestamp = Date.now();
    const rotatedPath = filePath.replace('.log', `-${timestamp}.log`);
    fs.renameSync(filePath, rotatedPath);

    // 清理旧日志文件
    cleanOldLogFiles();
  }
};

// 清理旧日志文件
const cleanOldLogFiles = (): void => {
  const files = fs.readdirSync(LOG_CONFIG.logDir)
    .filter(f => f.startsWith('garmin-sync-') && f.endsWith('.log'))
    .sort()
    .reverse();

  // 保留最新的 N 个文件
  while (files.length > LOG_CONFIG.maxFiles) {
    const fileToDelete = files.pop();
    if (fileToDelete) {
      fs.unlinkSync(path.join(LOG_CONFIG.logDir, fileToDelete));
    }
  }
};

// 写入日志到文件（异步 fire-and-forget，不阻塞主流程）
const writeToFile = (level: LogLevel, message: string, ...args: unknown[]): void => {
  if (!LOG_CONFIG.enableFileLog) return;

  try {
    ensureLogDir();
    const filePath = getLogFilePath();
    rotateLogFile(filePath);

    const logEntry = {
      timestamp: getTimestamp(),
      level: level.toUpperCase(),
      message,
      data: args.length > 0 ? args : undefined,
    };

    const logLine = JSON.stringify(logEntry) + '\n';
    fs.appendFile(filePath, logLine, 'utf-8', (err) => {
      if (err) {
        console.error('日志文件写入失败:', err);
      }
    });
  } catch (error) {
    // 文件写入失败时仅输出到控制台
    console.error('日志文件写入失败:', error);
  }
};

// 格式化控制台消息
const formatConsoleMessage = (level: LogLevel, message: string, ...args: unknown[]): string => {
  const timestamp = formatTime();
  const levelColors: Record<LogLevel, string> = {
    info: '\x1b[36m',    // cyan
    warn: '\x1b[33m',    // yellow
    error: '\x1b[31m',   // red
    debug: '\x1b[90m',   // gray
    success: '\x1b[32m', // green
  };
  const reset = '\x1b[0m';
  const color = levelColors[level] || '';

  return `${color}[${timestamp}] [${level.toUpperCase()}]${reset} ${message}`;
};

// 日志对象
export const logger = {
  info: (message: string, ...args: unknown[]): void => {
    console.log(formatConsoleMessage('info', message), ...args);
    writeToFile('info', message, ...args);
  },

  warn: (message: string, ...args: unknown[]): void => {
    console.warn(formatConsoleMessage('warn', message), ...args);
    writeToFile('warn', message, ...args);
  },

  error: (message: string, ...args: unknown[]): void => {
    console.error(formatConsoleMessage('error', message), ...args);
    writeToFile('error', message, ...args);
  },

  debug: (message: string, ...args: unknown[]): void => {
    if (process.env.DEBUG) {
      console.log(formatConsoleMessage('debug', message), ...args);
      writeToFile('debug', message, ...args);
    }
  },

  success: (message: string, ...args: unknown[]): void => {
    console.log(formatConsoleMessage('success', `✓ ${message}`), ...args);
    writeToFile('success', message, ...args);
  },

  // 获取日志文件路径
  getLogFilePath,

  // 清理所有日志
  cleanLogs: (): void => {
    if (fs.existsSync(LOG_CONFIG.logDir)) {
      const files = fs.readdirSync(LOG_CONFIG.logDir);
      for (const file of files) {
        fs.unlinkSync(path.join(LOG_CONFIG.logDir, file));
      }
    }
  },
};