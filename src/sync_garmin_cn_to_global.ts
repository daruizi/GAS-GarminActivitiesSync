/**
 * 同步 Garmin CN -> Global
 */

import { syncCN2Global } from './services/sync';
import { runTask } from './utils/runner';

runTask('同步 CN -> Global', syncCN2Global);