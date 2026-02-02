/**
 * @fileoverview Tests for config loader utility
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();

vi.mock('node:fs', () => ({
  existsSync: (...args) => mockExistsSync(...args),
  readFileSync: (...args) => mockReadFileSync(...args)
}));

const { loadConfig, loadAlertThresholds, loadAutoHealPlaybooks, loadMonitoringSources } = await import(
  '../../lib/config-loader.js'
);

describe('Config Loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('loadMonitoringSources', () => {
    test('returns valid config object', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          prometheus: { enabled: true },
          logs: { paths: [] },
          healthchecks: []
        })
      );

      const config = loadMonitoringSources();

      expect(config).toBeDefined();
      expect(config).toHaveProperty('prometheus');
      expect(config).toHaveProperty('logs');
      expect(config).toHaveProperty('healthchecks');
    });
  });

  describe('loadAlertThresholds', () => {
    test('returns threshold values', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          cpu_usage: { warning: 70, critical: 90 },
          memory_usage: { warning: 80, critical: 95 },
          disk_usage: { warning: 75, critical: 90 }
        })
      );

      const thresholds = loadAlertThresholds();

      expect(thresholds).toBeDefined();
      expect(thresholds).toHaveProperty('cpu_usage');
      expect(thresholds).toHaveProperty('memory_usage');
      expect(thresholds).toHaveProperty('disk_usage');
      expect(thresholds.cpu_usage).toHaveProperty('warning');
      expect(thresholds.cpu_usage).toHaveProperty('critical');
      expect(typeof thresholds.cpu_usage.warning).toBe('number');
    });

    test('config files contain expected values', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          cpu_usage: { warning: 70, critical: 90 }
        })
      );

      const thresholds = loadAlertThresholds();

      expect(thresholds.cpu_usage.warning).toBeGreaterThan(0);
      expect(thresholds.cpu_usage.warning).toBeLessThan(100);
      expect(thresholds.cpu_usage.critical).toBeGreaterThan(thresholds.cpu_usage.warning);
    });
  });

  describe('loadAutoHealPlaybooks', () => {
    test('returns playbook definitions', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          disk_space_low: { condition: 'disk > 90', actions: ['cleanup'] },
          process_down: { condition: 'status == stopped', actions: ['restart'] }
        })
      );

      const playbooks = loadAutoHealPlaybooks();

      expect(playbooks).toBeDefined();
      expect(playbooks).toHaveProperty('disk_space_low');
      expect(playbooks).toHaveProperty('process_down');

      const diskPlaybook = playbooks.disk_space_low;
      expect(diskPlaybook).toHaveProperty('condition');
      expect(diskPlaybook).toHaveProperty('actions');
      expect(Array.isArray(diskPlaybook.actions)).toBe(true);
    });
  });

  describe('loadConfig', () => {
    test('throws error when config file does not exist', () => {
      mockExistsSync.mockReturnValue(false);

      expect(() => loadConfig('nonexistent-config')).toThrow('Configuration file not found');
    });

    test('throws error when config file has invalid JSON', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{ invalid json }');

      expect(() => loadConfig('invalid-config')).toThrow('Failed to parse config');
    });

    test('successfully loads valid config file', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ key: 'value' }));

      const config = loadConfig('test-config');

      expect(config).toEqual({ key: 'value' });
    });

    test('passes correct path to existsSync', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({}));

      loadConfig('my-config');

      expect(mockExistsSync).toHaveBeenCalledWith(expect.stringContaining('my-config.json'));
    });

    test('reads file with utf8 encoding', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({}));

      loadConfig('test');

      expect(mockReadFileSync).toHaveBeenCalledWith(expect.any(String), 'utf8');
    });
  });
});
