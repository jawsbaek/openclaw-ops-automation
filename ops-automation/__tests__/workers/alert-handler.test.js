import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../lib/config-loader.js', () => ({
  loadAlertThresholds: vi.fn(() => ({
    cpu_usage: { warning: 70, critical: 90 },
    memory_usage: { warning: 80, critical: 95 },
    disk_usage: { warning: 75, critical: 90 },
    api_latency_ms: { warning: 500, critical: 2000 }
  }))
}));

vi.mock('../../lib/file-utils.js', () => ({
  getLatestMetrics: vi.fn(() => null)
}));

vi.mock('../../lib/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }))
}));

vi.mock('../../src/jsm/jsm-integration.js', () => ({
  createIncidentFromAlert: vi.fn(() => Promise.resolve(null))
}));

describe('Alert Handler', () => {
  let loadAlertThresholds;
  let getLatestMetrics;
  let createIncidentFromAlert;
  let handleAlert;
  let processAlerts;
  let run;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    vi.doMock('../../lib/config-loader.js', () => ({
      loadAlertThresholds: vi.fn(() => ({
        cpu_usage: { warning: 70, critical: 90 },
        memory_usage: { warning: 80, critical: 95 },
        disk_usage: { warning: 75, critical: 90 },
        api_latency_ms: { warning: 500, critical: 2000 }
      }))
    }));

    vi.doMock('../../lib/file-utils.js', () => ({
      getLatestMetrics: vi.fn(() => null)
    }));

    vi.doMock('../../lib/logger.js', () => ({
      createLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
      }))
    }));

    vi.doMock('../../src/jsm/jsm-integration.js', () => ({
      createIncidentFromAlert: vi.fn(() => Promise.resolve(null))
    }));

    const configLoader = await import('../../lib/config-loader.js');
    const fileUtils = await import('../../lib/file-utils.js');
    const jsmIntegration = await import('../../src/jsm/jsm-integration.js');
    const alertHandler = await import('../../workers/alert-handler.js');

    loadAlertThresholds = configLoader.loadAlertThresholds;
    getLatestMetrics = fileUtils.getLatestMetrics;
    createIncidentFromAlert = jsmIntegration.createIncidentFromAlert;
    handleAlert = alertHandler.handleAlert;
    processAlerts = alertHandler.processAlerts;
    run = alertHandler.run;

    loadAlertThresholds.mockReturnValue({
      cpu_usage: { warning: 70, critical: 90 },
      memory_usage: { warning: 80, critical: 95 },
      disk_usage: { warning: 75, critical: 90 },
      api_latency_ms: { warning: 500, critical: 2000 }
    });
  });

  describe('processAlerts', () => {
    test('returns empty array when no metrics available', async () => {
      getLatestMetrics.mockReturnValue(null);

      const alerts = await processAlerts();

      expect(alerts).toEqual([]);
    });

    test('returns empty array when metrics have no concerning values', async () => {
      getLatestMetrics.mockReturnValue({
        system: {
          cpu: 30,
          memory: { percentage: 40 },
          disk: [{ device: '/dev/sda1', mount: '/', percentage: 50 }]
        }
      });

      const alerts = await processAlerts();

      expect(alerts).toEqual([]);
    });

    test('generates critical CPU alert when threshold exceeded', async () => {
      getLatestMetrics.mockReturnValue({
        system: { cpu: 95 }
      });

      const alerts = await processAlerts();

      expect(alerts.length).toBe(1);
      expect(alerts[0].metric).toBe('cpu_usage');
      expect(alerts[0].level).toBe('critical');
      expect(alerts[0].value).toBe(95);
      expect(alerts[0].threshold).toBe(90);
      expect(alerts[0].message).toContain('critical');
    });

    test('generates high priority CPU alert at warning threshold', async () => {
      getLatestMetrics.mockReturnValue({
        system: { cpu: 75 }
      });

      const alerts = await processAlerts();

      expect(alerts.length).toBe(1);
      expect(alerts[0].metric).toBe('cpu_usage');
      expect(alerts[0].level).toBe('high');
      expect(alerts[0].threshold).toBe(70);
    });

    test('generates memory alert when threshold exceeded', async () => {
      getLatestMetrics.mockReturnValue({
        system: { memory: { percentage: 97 } }
      });

      const alerts = await processAlerts();

      expect(alerts.length).toBe(1);
      expect(alerts[0].metric).toBe('memory_usage');
      expect(alerts[0].level).toBe('critical');
    });

    test('generates warning-level memory alert', async () => {
      getLatestMetrics.mockReturnValue({
        system: { memory: { percentage: 85 } }
      });

      const alerts = await processAlerts();

      expect(alerts.length).toBe(1);
      expect(alerts[0].level).toBe('high');
    });

    test('generates disk alerts for multiple disks', async () => {
      getLatestMetrics.mockReturnValue({
        system: {
          disk: [
            { device: '/dev/sda1', mount: '/', percentage: 95 },
            { device: '/dev/sdb1', mount: '/data', percentage: 80 }
          ]
        }
      });

      const alerts = await processAlerts();

      expect(alerts.length).toBe(2);
      expect(alerts[0].metric).toContain('disk_usage');
      expect(alerts[0].level).toBe('critical');
      expect(alerts[0].metadata.mount).toBe('/');
      expect(alerts[1].level).toBe('high');
      expect(alerts[1].metadata.mount).toBe('/data');
    });

    test('generates healthcheck failed alert', async () => {
      getLatestMetrics.mockReturnValue({
        healthchecks: [{ name: 'API', url: 'http://localhost:8080/health', status: 'unhealthy' }]
      });

      const alerts = await processAlerts();

      expect(alerts.length).toBe(1);
      expect(alerts[0].metric).toBe('healthcheck_failed');
      expect(alerts[0].level).toBe('critical');
      expect(alerts[0].value).toBe('API');
      expect(alerts[0].message).toContain('Healthcheck failed');
    });

    test('generates high latency alert', async () => {
      getLatestMetrics.mockReturnValue({
        healthchecks: [{ name: 'API', url: 'http://localhost:8080', status: 'healthy', latency: 3000 }]
      });

      const alerts = await processAlerts();

      expect(alerts.length).toBe(1);
      expect(alerts[0].metric).toBe('api_latency');
      expect(alerts[0].level).toBe('high');
      expect(alerts[0].value).toBe(3000);
    });

    test('does not generate latency alert below threshold', async () => {
      getLatestMetrics.mockReturnValue({
        healthchecks: [{ name: 'API', url: 'http://localhost:8080', status: 'healthy', latency: 100 }]
      });

      const alerts = await processAlerts();

      expect(alerts).toEqual([]);
    });

    test('alerts have id and timestamp', async () => {
      getLatestMetrics.mockReturnValue({
        system: { cpu: 95 }
      });

      const alerts = await processAlerts();

      expect(alerts[0].id).toMatch(/^alert-\d+-\d+$/);
      expect(alerts[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test('sets shouldAutoHeal for disk_usage critical alerts', async () => {
      getLatestMetrics.mockReturnValue({
        system: {
          disk: [{ device: '/dev/sda1', mount: '/', percentage: 95 }]
        }
      });

      const alerts = await processAlerts();

      expect(alerts[0].shouldAutoHeal).toBe(true);
    });

    test('sets shouldAutoHeal for memory_usage critical alerts', async () => {
      getLatestMetrics.mockReturnValue({
        system: { memory: { percentage: 97 } }
      });

      const alerts = await processAlerts();

      expect(alerts[0].shouldAutoHeal).toBe(true);
    });

    test('does not set shouldAutoHeal for cpu_usage alerts', async () => {
      getLatestMetrics.mockReturnValue({
        system: { cpu: 95 }
      });

      const alerts = await processAlerts();

      expect(alerts[0].shouldAutoHeal).toBe(false);
    });

    test('handles multiple alert types simultaneously', async () => {
      getLatestMetrics.mockReturnValue({
        system: {
          cpu: 95,
          memory: { percentage: 97 },
          disk: [{ device: '/dev/sda1', mount: '/', percentage: 92 }]
        },
        healthchecks: [{ name: 'DB', url: 'http://localhost:5432', status: 'unhealthy' }]
      });

      const alerts = await processAlerts();

      expect(alerts.length).toBe(4);
      const metrics = alerts.map((a) => a.metric);
      expect(metrics).toContain('cpu_usage');
      expect(metrics).toContain('memory_usage');
      expect(metrics.some((m) => m.includes('disk_usage'))).toBe(true);
      expect(metrics).toContain('healthcheck_failed');
    });

    test('handles metrics object without system property', async () => {
      getLatestMetrics.mockReturnValue({
        healthchecks: []
      });

      const alerts = await processAlerts();

      expect(alerts).toEqual([]);
    });

    test('handles system without cpu property', async () => {
      getLatestMetrics.mockReturnValue({
        system: { memory: { percentage: 50 } }
      });

      const alerts = await processAlerts();

      expect(alerts).toEqual([]);
    });

    test('handles system without memory property', async () => {
      getLatestMetrics.mockReturnValue({
        system: { cpu: 50 }
      });

      const alerts = await processAlerts();

      expect(alerts).toEqual([]);
    });

    test('handles empty disk array', async () => {
      getLatestMetrics.mockReturnValue({
        system: { disk: [] }
      });

      const alerts = await processAlerts();

      expect(alerts).toEqual([]);
    });

    test('handles empty healthchecks array', async () => {
      getLatestMetrics.mockReturnValue({
        healthchecks: []
      });

      const alerts = await processAlerts();

      expect(alerts).toEqual([]);
    });
  });

  describe('handleAlert', () => {
    test('processes alert and returns result', async () => {
      const testAlert = {
        id: 'test-alert-123',
        metric: 'test_metric',
        value: 100,
        level: 'medium',
        message: 'Test alert',
        shouldAutoHeal: false
      };

      const result = await handleAlert(testAlert);

      expect(result.alertId).toBe('test-alert-123');
      expect(result.actions).toContain('logged');
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test('notifies on critical alerts', async () => {
      const criticalAlert = {
        id: 'critical-test',
        metric: 'cpu_usage',
        value: 95,
        level: 'critical',
        message: 'CPU critical',
        shouldAutoHeal: false
      };

      const result = await handleAlert(criticalAlert);

      expect(result.actions).toContain('logged');
      expect(result.actions).toContain('notified');
    });

    test('does not notify on non-critical alerts', async () => {
      const highAlert = {
        id: 'high-test',
        metric: 'cpu_usage',
        value: 75,
        level: 'high',
        message: 'CPU high',
        shouldAutoHeal: false
      };

      const result = await handleAlert(highAlert);

      expect(result.actions).toContain('logged');
      expect(result.actions).not.toContain('notified');
    });

    test('triggers autoHeal when shouldAutoHeal is true', async () => {
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

    test('does not trigger autoHeal when shouldAutoHeal is false', async () => {
      const noAutoHealAlert = {
        id: 'no-autoheal-test',
        metric: 'cpu_usage',
        value: 95,
        level: 'critical',
        message: 'CPU critical',
        shouldAutoHeal: false
      };

      const result = await handleAlert(noAutoHealAlert);

      expect(result.autoHealRequested).toBeUndefined();
      expect(result.actions).not.toContain('autoheal_triggered');
    });

    test('handles alert with all flags enabled', async () => {
      const fullAlert = {
        id: 'full-test',
        metric: 'memory_usage',
        value: 98,
        level: 'critical',
        message: 'Memory critical',
        shouldAutoHeal: true
      };

      const result = await handleAlert(fullAlert);

      expect(result.actions).toContain('logged');
      expect(result.actions).toContain('notified');
      expect(result.actions).toContain('autoheal_triggered');
      expect(result.autoHealRequested).toBe(true);
    });
  });

  describe('run', () => {
    test('returns processing results', async () => {
      getLatestMetrics.mockReturnValue(null);

      const result = await run();

      expect(result.alertsProcessed).toBe(0);
      expect(result.results).toEqual([]);
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test('processes multiple alerts', async () => {
      getLatestMetrics.mockReturnValue({
        system: {
          cpu: 95,
          memory: { percentage: 97 }
        }
      });

      const result = await run();

      expect(result.alertsProcessed).toBe(2);
      expect(result.results.length).toBe(2);
    });

    test('handles alerts with autoHeal', async () => {
      getLatestMetrics.mockReturnValue({
        system: { memory: { percentage: 97 } }
      });

      const result = await run();

      expect(result.alertsProcessed).toBe(1);
      expect(result.results[0].autoHealRequested).toBe(true);
    });
  });

  describe('Alert Deduplication', () => {
    test('deduplicates repeated alerts within window', async () => {
      getLatestMetrics.mockReturnValue({
        system: { cpu: 95 }
      });

      const alerts1 = await processAlerts();
      expect(alerts1.length).toBe(1);

      const alerts2 = await processAlerts();
      expect(alerts2.length).toBe(0);
    });

    test('deduplicates multiple alert types', async () => {
      getLatestMetrics.mockReturnValue({
        system: { cpu: 95, memory: { percentage: 97 } }
      });

      const alerts1 = await processAlerts();
      expect(alerts1.length).toBe(2);

      const alerts2 = await processAlerts();
      expect(alerts2.length).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    test('handles undefined system.cpu', async () => {
      getLatestMetrics.mockReturnValue({
        system: { cpu: undefined }
      });

      const alerts = await processAlerts();
      expect(alerts).toEqual([]);
    });

    test('handles undefined memory.percentage', async () => {
      getLatestMetrics.mockReturnValue({
        system: { memory: { percentage: undefined } }
      });

      const alerts = await processAlerts();
      expect(alerts).toEqual([]);
    });

    test('handles null disk array', async () => {
      getLatestMetrics.mockReturnValue({
        system: { disk: null }
      });

      const alerts = await processAlerts();
      expect(alerts).toEqual([]);
    });

    test('handles healthy healthcheck with no latency', async () => {
      getLatestMetrics.mockReturnValue({
        healthchecks: [{ name: 'API', url: 'http://localhost', status: 'healthy' }]
      });

      const alerts = await processAlerts();
      expect(alerts).toEqual([]);
    });

    test('handles healthcheck at exactly critical latency', async () => {
      getLatestMetrics.mockReturnValue({
        healthchecks: [{ name: 'API', url: 'http://localhost', status: 'healthy', latency: 2000 }]
      });

      const alerts = await processAlerts();
      expect(alerts).toEqual([]);
    });

    test('handles healthcheck just above critical latency', async () => {
      getLatestMetrics.mockReturnValue({
        healthchecks: [{ name: 'API', url: 'http://localhost', status: 'healthy', latency: 2001 }]
      });

      const alerts = await processAlerts();
      expect(alerts.length).toBe(1);
      expect(alerts[0].metric).toBe('api_latency');
    });

    test('handles CPU at exactly warning threshold', async () => {
      getLatestMetrics.mockReturnValue({
        system: { cpu: 70 }
      });

      const alerts = await processAlerts();
      expect(alerts.length).toBe(1);
      expect(alerts[0].level).toBe('high');
    });

    test('handles CPU just below warning threshold', async () => {
      getLatestMetrics.mockReturnValue({
        system: { cpu: 69 }
      });

      const alerts = await processAlerts();
      expect(alerts).toEqual([]);
    });

    test('handles CPU at exactly critical threshold', async () => {
      getLatestMetrics.mockReturnValue({
        system: { cpu: 90 }
      });

      const alerts = await processAlerts();
      expect(alerts.length).toBe(1);
      expect(alerts[0].level).toBe('critical');
    });

    test('handles memory at exactly warning threshold', async () => {
      getLatestMetrics.mockReturnValue({
        system: { memory: { percentage: 80 } }
      });

      const alerts = await processAlerts();
      expect(alerts.length).toBe(1);
      expect(alerts[0].level).toBe('high');
    });

    test('handles disk at exactly critical threshold', async () => {
      getLatestMetrics.mockReturnValue({
        system: { disk: [{ device: '/dev/sda1', mount: '/', percentage: 90 }] }
      });

      const alerts = await processAlerts();
      expect(alerts.length).toBe(1);
      expect(alerts[0].level).toBe('critical');
    });
  });

  describe('AutoHeal Trigger Logic', () => {
    test('triggers autoHeal for disk_usage critical', async () => {
      getLatestMetrics.mockReturnValue({
        system: { disk: [{ device: '/dev/sda1', mount: '/', percentage: 95 }] }
      });

      const alerts = await processAlerts();
      expect(alerts[0].shouldAutoHeal).toBe(true);
    });

    test('triggers autoHeal for disk_usage high', async () => {
      getLatestMetrics.mockReturnValue({
        system: { disk: [{ device: '/dev/sda1', mount: '/', percentage: 80 }] }
      });

      const alerts = await processAlerts();
      expect(alerts[0].shouldAutoHeal).toBe(true);
    });

    test('triggers autoHeal for memory_usage critical', async () => {
      getLatestMetrics.mockReturnValue({
        system: { memory: { percentage: 97 } }
      });

      const alerts = await processAlerts();
      expect(alerts[0].shouldAutoHeal).toBe(true);
    });

    test('triggers autoHeal for memory_usage high', async () => {
      getLatestMetrics.mockReturnValue({
        system: { memory: { percentage: 85 } }
      });

      const alerts = await processAlerts();
      expect(alerts[0].shouldAutoHeal).toBe(true);
    });

    test('does not trigger autoHeal for cpu_usage critical', async () => {
      getLatestMetrics.mockReturnValue({
        system: { cpu: 95 }
      });

      const alerts = await processAlerts();
      expect(alerts[0].shouldAutoHeal).toBe(false);
    });

    test('does not trigger autoHeal for healthcheck_failed', async () => {
      getLatestMetrics.mockReturnValue({
        healthchecks: [{ name: 'API', url: 'http://localhost', status: 'unhealthy' }]
      });

      const alerts = await processAlerts();
      expect(alerts[0].shouldAutoHeal).toBe(false);
    });

    test('does not trigger autoHeal for api_latency', async () => {
      getLatestMetrics.mockReturnValue({
        healthchecks: [{ name: 'API', url: 'http://localhost', status: 'healthy', latency: 3000 }]
      });

      const alerts = await processAlerts();
      expect(alerts[0].shouldAutoHeal).toBe(false);
    });
  });

  describe('JSM Integration', () => {
    test('creates JSM ticket when handling alert', async () => {
      createIncidentFromAlert.mockResolvedValue({
        issueKey: 'TEST-123',
        deduplicated: false
      });

      const testAlert = {
        id: 'jsm-test-alert',
        metric: 'cpu_usage',
        value: 95,
        level: 'critical',
        message: 'CPU critical',
        shouldAutoHeal: false
      };

      const result = await handleAlert(testAlert);

      expect(createIncidentFromAlert).toHaveBeenCalledWith(testAlert);
      expect(result.actions).toContain('jsm_ticket_created');
      expect(result.jsmIssueKey).toBe('TEST-123');
      expect(result.jsmDeduplicated).toBe(false);
    });

    test('handles JSM ticket deduplication', async () => {
      createIncidentFromAlert.mockResolvedValue({
        issueKey: 'TEST-100',
        deduplicated: true
      });

      const testAlert = {
        id: 'jsm-dedup-test',
        metric: 'memory_usage',
        value: 97,
        level: 'critical',
        message: 'Memory critical',
        shouldAutoHeal: true
      };

      const result = await handleAlert(testAlert);

      expect(result.jsmIssueKey).toBe('TEST-100');
      expect(result.jsmDeduplicated).toBe(true);
    });

    test('handles JSM integration disabled', async () => {
      createIncidentFromAlert.mockResolvedValue(null);

      const testAlert = {
        id: 'jsm-disabled-test',
        metric: 'disk_usage',
        value: 92,
        level: 'critical',
        message: 'Disk critical',
        shouldAutoHeal: true
      };

      const result = await handleAlert(testAlert);

      expect(result.actions).not.toContain('jsm_ticket_created');
      expect(result.jsmIssueKey).toBeUndefined();
    });

    test('handles JSM integration error gracefully', async () => {
      createIncidentFromAlert.mockRejectedValue(new Error('JSM API error'));

      const testAlert = {
        id: 'jsm-error-test',
        metric: 'cpu_usage',
        value: 95,
        level: 'critical',
        message: 'CPU critical',
        shouldAutoHeal: false
      };

      const result = await handleAlert(testAlert);

      expect(result.actions).toContain('logged');
      expect(result.actions).not.toContain('jsm_ticket_created');
      expect(result.jsmIssueKey).toBeUndefined();
    });

    test('skips JSM ticket creation when createJSMTicket option is false', async () => {
      const testAlert = {
        id: 'jsm-skip-test',
        metric: 'cpu_usage',
        value: 95,
        level: 'critical',
        message: 'CPU critical',
        shouldAutoHeal: false
      };

      const result = await handleAlert(testAlert, { createJSMTicket: false });

      expect(createIncidentFromAlert).not.toHaveBeenCalled();
      expect(result.actions).not.toContain('jsm_ticket_created');
    });
  });
});
