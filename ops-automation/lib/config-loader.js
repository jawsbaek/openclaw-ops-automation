/**
 * @fileoverview Configuration loader utility
 * @module lib/config-loader
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const configDir = join(__dirname, '../config');

/**
 * Loads a JSON configuration file
 * @param {string} configName - Name of config file (without .json extension)
 * @returns {Object} Parsed configuration object
 * @throws {Error} If config file doesn't exist or is invalid JSON
 */
export function loadConfig(configName) {
  const configPath = join(configDir, `${configName}.json`);

  if (!existsSync(configPath)) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  try {
    const configData = readFileSync(configPath, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    throw new Error(`Failed to parse config ${configName}: ${error.message}`);
  }
}

/**
 * Loads monitoring sources configuration
 * @returns {Object} Monitoring sources config
 */
export function loadMonitoringSources() {
  return loadConfig('monitoring-sources');
}

/**
 * Loads alert thresholds configuration
 * @returns {Object} Alert thresholds config
 */
export function loadAlertThresholds() {
  return loadConfig('alert-thresholds');
}

/**
 * Loads autoheal playbooks configuration
 * @returns {Object} AutoHeal playbooks config
 */
export function loadAutoHealPlaybooks() {
  return loadConfig('autoheal-playbooks');
}

export default {
  loadConfig,
  loadMonitoringSources,
  loadAlertThresholds,
  loadAutoHealPlaybooks
};
