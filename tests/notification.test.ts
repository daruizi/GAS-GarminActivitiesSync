import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock axios
vi.mock('axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: 'ok' }),
    post: vi.fn().mockResolvedValue({ data: 'ok' }),
  },
}));

// Mock @actions/core
vi.mock('@actions/core', () => ({
  setFailed: vi.fn(),
}));

// Mock config
vi.mock('../src/config', () => ({
  BARK_CONFIG: {
    key: 'test-bark-key',
    apiUrl: 'https://api.day.app',
  },
  getEnv: (key: string, defaultValue: string = '') => {
    const env: Record<string, string> = {
      TELEGRAM_BOT_TOKEN: 'test-bot-token',
      TELEGRAM_CHAT_ID: 'test-chat-id',
      WECOM_WEBHOOK_URL: '',
    };
    return env[key] ?? defaultValue;
  },
}));

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

import axios from 'axios';
import {
  sendBarkNotification,
  sendTelegramNotification,
  sendAllNotifications,
} from '../src/services/notification';

describe('Notification Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sendBarkNotification', () => {
    it('should send bark notification successfully', async () => {
      const result = await sendBarkNotification('Test', 'Hello');
      expect(result).toBe(true);
      expect(axios.get).toHaveBeenCalled();
    });

    it('should return false on failure', async () => {
      vi.mocked(axios.get).mockRejectedValueOnce(new Error('Network error'));

      const result = await sendBarkNotification('Test', 'Hello');
      expect(result).toBe(false);
    });
  });

  describe('sendTelegramNotification', () => {
    it('should send telegram notification', async () => {
      const result = await sendTelegramNotification('Title', 'Message');
      expect(result).toBe(true);
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('api.telegram.org'),
        expect.objectContaining({
          text: expect.stringContaining('Title'),
        }),
        expect.any(Object)
      );
    });

    it('should return false on failure', async () => {
      vi.mocked(axios.post).mockRejectedValueOnce(new Error('Network error'));

      const result = await sendTelegramNotification('Title', 'Message');
      expect(result).toBe(false);
    });
  });

  describe('sendAllNotifications', () => {
    it('should send to all configured channels', async () => {
      const results = await sendAllNotifications('Test', 'All channels');

      expect(results.bark).toBe(true);
      expect(results.telegram).toBe(true);
      // wecom is not configured in mock
      expect(results.wecom).toBe(false);
    });
  });
});
