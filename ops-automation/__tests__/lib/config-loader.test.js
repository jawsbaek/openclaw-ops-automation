/**
 * @fileoverview Tests for config loader utility
 */

import { loadAlertThresholds, loadAutoHealPlaybooks, loadMonitoringSources } from '../../lib/config-loader.js';

describe('Config Loader', () => {
  test('loadMonitoringSources returns valid config object', () => {
    const config = loadMonitoringSources();

    expect(config).toBeDefined();
    expect(config).toHaveProperty('prometheus');
    expect(config).toHaveProperty('logs');
    expect(config).toHaveProperty('healthchecks');
  });

  test('loadAlertThresholds returns threshold values', () => {
    const thresholds = loadAlertThresholds();

    expect(thresholds).toBeDefined();
    expect(thresholds).toHaveProperty('cpu_usage');
    expect(thresholds).toHaveProperty('memory_usage');
    expect(thresholds).toHaveProperty('disk_usage');

    // Check threshold structure
    expect(thresholds.cpu_usage).toHaveProperty('warning');
    expect(thresholds.cpu_usage).toHaveProperty('critical');
    expect(typeof thresholds.cpu_usage.warning).toBe('number');
  });

  test('loadAutoHealPlaybooks returns playbook definitions', () => {
    const playbooks = loadAutoHealPlaybooks();

    expect(playbooks).toBeDefined();
    expect(playbooks).toHaveProperty('disk_space_low');
    expect(playbooks).toHaveProperty('process_down');

    // Check playbook structure
    const diskPlaybook = playbooks.disk_space_low;
    expect(diskPlaybook).toHaveProperty('condition');
    expect(diskPlaybook).toHaveProperty('actions');
    expect(Array.isArray(diskPlaybook.actions)).toBe(true);
  });

  test('config files contain expected values', () => {
    const thresholds = loadAlertThresholds();

    // Verify sensible defaults
    expect(thresholds.cpu_usage.warning).toBeGreaterThan(0);
    expect(thresholds.cpu_usage.warning).toBeLessThan(100);
    expect(thresholds.cpu_usage.critical).toBeGreaterThan(thresholds.cpu_usage.warning);
  });
});
