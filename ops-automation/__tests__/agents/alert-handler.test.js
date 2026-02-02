/**
 * @fileoverview Tests for Alert Handler Agent
 */

import { handleAlert, processAlerts } from '../../agents/alert-handler.js';

describe('Alert Handler', () => {
  test('processAlerts returns an array', async () => {
    const alerts = await processAlerts();

    expect(Array.isArray(alerts)).toBe(true);
  });

  test('alerts have required properties', async () => {
    const alerts = await processAlerts();

    if (alerts.length > 0) {
      const alert = alerts[0];
      expect(alert).toHaveProperty('id');
      expect(alert).toHaveProperty('timestamp');
      expect(alert).toHaveProperty('level');
      expect(alert).toHaveProperty('message');
      expect(alert).toHaveProperty('shouldAutoHeal');
    }
  });

  test('handleAlert processes alert correctly', async () => {
    const testAlert = {
      id: 'test-alert-123',
      metric: 'test_metric',
      value: 100,
      level: 'critical',
      message: 'Test alert',
      shouldAutoHeal: false
    };

    const result = await handleAlert(testAlert);

    expect(result).toBeDefined();
    expect(result).toHaveProperty('alertId');
    expect(result).toHaveProperty('actions');
    expect(result.alertId).toBe(testAlert.id);
    expect(Array.isArray(result.actions)).toBe(true);
  });

  test('critical alerts trigger notifications', async () => {
    const criticalAlert = {
      id: 'critical-test',
      metric: 'cpu_usage',
      value: 95,
      level: 'critical',
      message: 'CPU critical',
      shouldAutoHeal: true
    };

    const result = await handleAlert(criticalAlert);

    expect(result.actions).toContain('logged');
    expect(result.actions).toContain('notified');
  });

  test('autoheal is triggered when shouldAutoHeal is true', async () => {
    const autoHealAlert = {
      id: 'autoheal-test',
      metric: 'disk_usage',
      value: 95,
      level: 'critical',
      message: 'Disk critical',
      shouldAutoHeal: true
    };

    const result = await handleAlert(autoHealAlert);

    expect(result.autoHealRequested).toBe(true);
    expect(result.actions).toContain('autoheal_triggered');
  });
});
