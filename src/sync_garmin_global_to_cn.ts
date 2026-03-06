/**
 * 同步 Garmin Global -> CN
 */

import { syncGlobal2CN } from './services/sync';
import { runTask } from './utils/runner';

runTask('同步 Global -> CN', syncGlobal2CN);