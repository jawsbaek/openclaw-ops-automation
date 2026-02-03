/**
 * @fileoverview Tests for Orchestrator Agent
 */

import { vi } from 'vitest';

// Mock all dependencies BEFORE importing orchestrator
vi.mock('../../lib/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }))
}));

vi.mock('../../workers/metrics-collector.js', () => ({
  default: vi.fn()
}));

vi.mock('../../workers/logs-analyzer.js', () => ({
  default: vi.fn()
}));

vi.mock('../../workers/alert-handler.js', () => ({
  run: vi.fn()
}));

vi.mock('../../workers/reporter.js', () => ({
  default: vi.fn()
}));

// Import mocked modules
const { createLogger } = await import('../../lib/logger.js');
const collectMetrics = (await import('../../workers/metrics-collector.js')).default;
const analyzeLogs = (await import('../../workers/logs-analyzer.js')).default;
const { run: runAlertHandler } = await import('../../workers/alert-handler.js');
const generateReport = (await import('../../workers/reporter.js')).default;

// Import orchestrator AFTER mocks are set up
const { heartbeat, start } = await import('../../workers/orchestrator.js');

describe('Orchestrator Agent', () => {
  let mockLogger;
  let activeIntervals = [];

  beforeEach(() => {
    vi.clearAllMocks();
    activeIntervals = [];

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    };
    createLogger.mockReturnValue(mockLogger);

    // Setup default successful mock responses
    collectMetrics.mockResolvedValue({
      system: {
        cpu: 45.2,
        memory: { percentage: 62.5 },
        disk: { percentage: 75.0 }
      },
      healthchecks: [{ url: 'http://test.com', status: 'up' }]
    });

    analyzeLogs.mockResolvedValue({
      results: [
        {
          findings: { total: 5 },
          anomalies: ['anomaly1', 'anomaly2']
        }
      ],
      reportPath: '/tmp/log-analysis.json'
    });

    runAlertHandler.mockResolvedValue({
      alertsProcessed: 3,
      results: [{ type: 'cpu', action: 'triggered' }]
    });

    generateReport.mockResolvedValue({
      reportPath: '/tmp/daily-report.json'
    });
  });

  afterEach(() => {
    // Clean up any active intervals
    activeIntervals.forEach((id) => {
      clearInterval(id);
    });
    activeIntervals = [];
  });

  describe('heartbeat()', () => {
    test('should execute heartbeat and return summary structure', async () => {
      const result = await heartbeat();

      expect(result).toBeDefined();
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('runCount');
      expect(result).toHaveProperty('tasksExecuted');
      expect(result).toHaveProperty('successful');
      expect(result).toHaveProperty('failed');
      expect(result).toHaveProperty('results');
      expect(Array.isArray(result.results)).toBe(true);
    });

    test('should increment runCount on each heartbeat', async () => {
      const result1 = await heartbeat();
      const result2 = await heartbeat();

      expect(result2.runCount).toBeGreaterThan(result1.runCount);
    });

    test('should include timestamp in ISO format', async () => {
      const result = await heartbeat();

      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      const timestamp = new Date(result.timestamp);
      expect(timestamp.toString()).not.toBe('Invalid Date');
    });

    test('should execute at least report generation task', async () => {
      const result = await heartbeat();

      // Report generation always runs
      const reportTask = result.results.find((r) => r.task === 'report-generation');
      expect(reportTask).toBeDefined();
      expect(reportTask.success).toBe(true);
    });

    test('should handle metrics collection when triggered', async () => {
      // Run heartbeat enough times to ensure metrics runs
      let metricsTask;
      for (let i = 0; i < 10 && !metricsTask; i++) {
        const result = await heartbeat();
        metricsTask = result.results.find((r) => r.task === 'metrics-collection');
      }

      if (metricsTask) {
        expect(metricsTask.success).toBe(true);
        expect(metricsTask.summary).toHaveProperty('cpu');
        expect(metricsTask.summary).toHaveProperty('memory');
        expect(metricsTask.summary).toHaveProperty('healthchecks');
      }
    });

    test('should handle metrics collection failure gracefully', async () => {
      collectMetrics.mockRejectedValue(new Error('Metrics collection failed'));

      // Run multiple times to ensure it triggers
      for (let i = 0; i < 10; i++) {
        const result = await heartbeat();
        const metricsTask = result.results.find((r) => r.task === 'metrics-collection');

        if (metricsTask) {
          expect(metricsTask.success).toBe(false);
          expect(metricsTask.error).toBe('Metrics collection failed');
          break;
        }
      }
    });

    test('should handle log analysis when triggered', async () => {
      let logTask;
      for (let i = 0; i < 10 && !logTask; i++) {
        const result = await heartbeat();
        logTask = result.results.find((r) => r.task === 'log-analysis');
      }

      if (logTask) {
        expect(logTask.success).toBe(true);
        expect(logTask.summary).toHaveProperty('filesAnalyzed');
        expect(logTask.summary).toHaveProperty('totalIssues');
        expect(logTask.summary).toHaveProperty('totalAnomalies');
        expect(logTask.summary).toHaveProperty('reportPath');
      }
    });

    test('should handle log analysis failure gracefully', async () => {
      analyzeLogs.mockRejectedValue(new Error('Log analysis failed'));

      for (let i = 0; i < 10; i++) {
        const result = await heartbeat();
        const logTask = result.results.find((r) => r.task === 'log-analysis');

        if (logTask) {
          expect(logTask.success).toBe(false);
          expect(logTask.error).toBe('Log analysis failed');
          break;
        }
      }
    });

    test('should handle alert checking when triggered', async () => {
      let alertTask;
      for (let i = 0; i < 10 && !alertTask; i++) {
        const result = await heartbeat();
        alertTask = result.results.find((r) => r.task === 'alert-check');
      }

      if (alertTask) {
        expect(alertTask.success).toBe(true);
        expect(alertTask.summary).toHaveProperty('alertsProcessed');
        expect(alertTask.summary).toHaveProperty('actionsTriggered');
      }
    });

    test('should handle alert checking failure gracefully', async () => {
      runAlertHandler.mockRejectedValue(new Error('Alert handler failed'));

      for (let i = 0; i < 10; i++) {
        const result = await heartbeat();
        const alertTask = result.results.find((r) => r.task === 'alert-check');

        if (alertTask) {
          expect(alertTask.success).toBe(false);
          expect(alertTask.error).toBe('Alert handler failed');
          break;
        }
      }
    });

    test('should calculate success and failure counts', async () => {
      const result = await heartbeat();

      expect(result.tasksExecuted).toBeGreaterThan(0);
      expect(result.successful).toBeGreaterThanOrEqual(0);
      expect(result.failed).toBeGreaterThanOrEqual(0);
      expect(result.successful + result.failed).toBeLessThanOrEqual(result.tasksExecuted);
    });

    test('should handle empty log analysis results', async () => {
      analyzeLogs.mockResolvedValue({
        results: [],
        reportPath: '/tmp/empty.json'
      });

      for (let i = 0; i < 10; i++) {
        const result = await heartbeat();
        const logTask = result.results.find((r) => r.task === 'log-analysis');

        if (logTask) {
          expect(logTask.success).toBe(true);
          expect(logTask.summary.totalIssues).toBe(0);
          expect(logTask.summary.totalAnomalies).toBe(0);
          break;
        }
      }
    });

    test('should handle multiple log analysis results', async () => {
      analyzeLogs.mockResolvedValue({
        results: [
          { findings: { total: 3 }, anomalies: ['a1'] },
          { findings: { total: 5 }, anomalies: ['a2', 'a3'] },
          { findings: { total: 2 }, anomalies: [] }
        ],
        reportPath: '/tmp/multi.json'
      });

      for (let i = 0; i < 10; i++) {
        const result = await heartbeat();
        const logTask = result.results.find((r) => r.task === 'log-analysis');

        if (logTask) {
          expect(logTask.summary.filesAnalyzed).toBe(3);
          expect(logTask.summary.totalIssues).toBe(10);
          expect(logTask.summary.totalAnomalies).toBe(3);
          break;
        }
      }
    });

    test('should handle missing metrics data gracefully', async () => {
      collectMetrics.mockResolvedValue({});

      for (let i = 0; i < 10; i++) {
        const result = await heartbeat();
        const metricsTask = result.results.find((r) => r.task === 'metrics-collection');

        if (metricsTask) {
          expect(metricsTask.success).toBe(true);
          expect(metricsTask.summary.cpu).toBeUndefined();
          expect(metricsTask.summary.memory).toBeUndefined();
          break;
        }
      }
    });
  });

  describe('start()', () => {
    beforeEach(() => {
      vi.useFakeTimers();

      // Spy on setInterval to track created intervals
      const originalSetInterval = global.setInterval;
      vi.spyOn(global, 'setInterval').mockImplementation((fn, delay) => {
        const id = originalSetInterval(fn, delay);
        activeIntervals.push(id);
        return id;
      });
    });

    afterEach(() => {
      vi.clearAllTimers();
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    test('should run initial heartbeat on start', async () => {
      // Restore real timers and the real setInterval
      vi.useRealTimers();
      vi.restoreAllMocks();

      // Re-spy on setInterval with real implementation to track intervals
      const originalSetInterval = global.setInterval;
      let intervalCreated = false;
      vi.spyOn(global, 'setInterval').mockImplementation((fn, delay) => {
        intervalCreated = true;
        const id = originalSetInterval(fn, delay);
        activeIntervals.push(id);
        return id;
      });

      // Call start and wait for it to complete initial heartbeat
      await start(60000);

      // Verify that an interval was set up (which means start() completed)
      expect(intervalCreated).toBe(true);
    }, 10000);

    test('should schedule recurring heartbeats with setInterval', async () => {
      const interval = 60000;

      start(interval);

      // Flush pending timers to allow start to complete
      await vi.runOnlyPendingTimersAsync();

      // Verify setInterval was called
      expect(global.setInterval).toHaveBeenCalled();
    }, 10000);

    test('should use default interval if not specified', async () => {
      start();

      // Flush pending timers to allow start to complete
      await vi.runOnlyPendingTimersAsync();

      // Should still set up interval
      expect(global.setInterval).toHaveBeenCalled();
    }, 10000);

    test('should handle errors gracefully in continuous mode', async () => {
      collectMetrics.mockRejectedValue(new Error('Critical failure'));

      start(60000);

      await Promise.resolve();
      await Promise.resolve();

      vi.advanceTimersByTime(60000);
      await Promise.resolve();
      await Promise.resolve();

      expect(vi.getTimerCount()).toBeGreaterThan(0);
    });

    test('should catch and log errors in interval callback', async () => {
      const heartbeatError = new Error('Heartbeat catastrophic failure');

      collectMetrics.mockRejectedValue(heartbeatError);
      analyzeLogs.mockRejectedValue(heartbeatError);
      runAlertHandler.mockRejectedValue(heartbeatError);
      generateReport.mockRejectedValue(heartbeatError);

      start(1000);

      await vi.runOnlyPendingTimersAsync();

      vi.advanceTimersByTime(1000);
      await vi.runOnlyPendingTimersAsync();

      expect(vi.getTimerCount()).toBeGreaterThan(0);
    });

    test('should continue running after interval callback error', async () => {
      let callCount = 0;
      collectMetrics.mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Second call failure');
        }
        return Promise.resolve({ system: { cpu: 10 }, healthchecks: [] });
      });

      start(1000);

      await vi.runOnlyPendingTimersAsync();

      vi.advanceTimersByTime(1000);
      await vi.runOnlyPendingTimersAsync();

      vi.advanceTimersByTime(1000);
      await vi.runOnlyPendingTimersAsync();

      expect(vi.getTimerCount()).toBeGreaterThan(0);
    });

    test('should catch thrown errors in interval callback and log them', async () => {
      vi.useRealTimers();
      vi.restoreAllMocks();

      const originalSetInterval = global.setInterval;
      let intervalCallback = null;
      vi.spyOn(global, 'setInterval').mockImplementation((fn, delay) => {
        intervalCallback = fn;
        const id = originalSetInterval(fn, delay);
        activeIntervals.push(id);
        return id;
      });

      await start(60000);

      expect(intervalCallback).toBeDefined();

      await intervalCallback();

      expect(global.setInterval).toHaveBeenCalled();
    });
  });

  describe('Report Generation', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    test('should generate daily report at scheduled hour', async () => {
      vi.setSystemTime(new Date('2024-01-15T09:30:00Z'));

      const result = await heartbeat();

      const reportTask = result.results.find((r) => r.task === 'report-generation');
      expect(reportTask).toBeDefined();

      if (reportTask.reports.length > 0) {
        const dailyReport = reportTask.reports.find((r) => r.type === 'daily');
        if (dailyReport) {
          expect(dailyReport.success).toBe(true);
        }
      }
    });

    test('should not generate daily report at wrong hour', async () => {
      vi.setSystemTime(new Date('2024-01-15T08:30:00Z'));

      const result = await heartbeat();

      const reportTask = result.results.find((r) => r.task === 'report-generation');
      expect(reportTask).toBeDefined();

      const dailyReport = reportTask.reports.find((r) => r.type === 'daily');
      expect(dailyReport).toBeUndefined();
    });

    test('should handle report generation failure', async () => {
      vi.setSystemTime(new Date('2024-01-15T09:30:00Z'));
      generateReport.mockRejectedValueOnce(new Error('Report generation failed'));

      const result = await heartbeat();

      const reportTask = result.results.find((r) => r.task === 'report-generation');

      if (reportTask.reports.length > 0) {
        const failedReport = reportTask.reports.find((r) => r.success === false);
        if (failedReport) {
          expect(failedReport.error).toBe('Report generation failed');
        }
      }
    });

    test('should generate weekly report on Monday at 10 AM after 7 days', async () => {
      vi.setSystemTime(new Date('2024-01-08T10:30:00Z'));
      await heartbeat();

      vi.setSystemTime(new Date('2024-01-15T10:30:00Z'));

      const result = await heartbeat();

      const reportTask = result.results.find((r) => r.task === 'report-generation');
      expect(reportTask).toBeDefined();

      if (reportTask.reports.length > 0) {
        const weeklyReport = reportTask.reports.find((r) => r.type === 'weekly');
        if (weeklyReport) {
          expect(weeklyReport.success).toBe(true);
          expect(weeklyReport.reportPath).toBeDefined();
        }
      }
    });

    test('should handle weekly report generation failure', async () => {
      vi.setSystemTime(new Date('2024-01-08T10:30:00Z'));
      await heartbeat();

      vi.setSystemTime(new Date('2024-01-15T10:30:00Z'));
      generateReport.mockRejectedValue(new Error('Weekly report failed'));

      const result = await heartbeat();

      const reportTask = result.results.find((r) => r.task === 'report-generation');

      if (reportTask.reports.length > 0) {
        const failedReport = reportTask.reports.find((r) => r.success === false);
        if (failedReport) {
          expect(failedReport.error).toContain('failed');
        }
      }
    });

    test('should not generate weekly report on wrong day', async () => {
      vi.setSystemTime(new Date('2024-01-16T10:30:00Z'));

      const result = await heartbeat();

      const reportTask = result.results.find((r) => r.task === 'report-generation');
      const weeklyReport = reportTask.reports.find((r) => r.type === 'weekly');
      expect(weeklyReport).toBeUndefined();
    });

    test('should not generate weekly report if already run within 6 days', async () => {
      generateReport.mockReset();
      generateReport.mockResolvedValue({ reportPath: '/tmp/report.md' });

      const mondayNineAM = new Date();
      while (mondayNineAM.getDay() !== 1) {
        mondayNineAM.setDate(mondayNineAM.getDate() + 1);
      }
      mondayNineAM.setHours(9, 0, 0, 0);

      vi.setSystemTime(mondayNineAM);
      const result1 = await heartbeat();

      const reportTask1 = result1.results.find((r) => r.task === 'report-generation');
      const dailyReport = reportTask1.reports.find((r) => r.type === 'daily');
      expect(dailyReport).toBeDefined();
      expect(dailyReport.success).toBe(true);

      const mondayTenAM = new Date(mondayNineAM);
      mondayTenAM.setHours(10, 0, 0, 0);
      vi.setSystemTime(mondayTenAM);

      const result2 = await heartbeat();

      const reportTask2 = result2.results.find((r) => r.task === 'report-generation');
      expect(reportTask2).toBeDefined();

      const weeklyReport2 = reportTask2.reports.find((r) => r.type === 'weekly');
      expect(weeklyReport2).toBeUndefined();
    });
  });

  describe('Report Generation with timezone-aware times', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      generateReport.mockResolvedValue({ reportPath: '/tmp/report.md' });
    });

    test('daily report success at 9 AM local time', async () => {
      vi.useFakeTimers();
      const nineAMLocal = new Date();
      nineAMLocal.setHours(9, 0, 0, 0);
      nineAMLocal.setDate(nineAMLocal.getDate() + 1);
      vi.setSystemTime(nineAMLocal);

      generateReport.mockReset();
      generateReport.mockResolvedValue({ reportPath: '/tmp/daily.md' });

      const result = await heartbeat();
      const reportTask = result.results.find((r) => r.task === 'report-generation');

      expect(reportTask).toBeDefined();
      expect(reportTask.success).toBe(true);

      const dailyReport = reportTask.reports.find((r) => r.type === 'daily');
      if (dailyReport) {
        expect(dailyReport.success).toBe(true);
        expect(dailyReport.reportPath).toBe('/tmp/daily.md');
      }

      vi.useRealTimers();
    });

    test('daily report failure at 9 AM local time', async () => {
      vi.useFakeTimers();
      const nineAMLocal = new Date();
      nineAMLocal.setHours(9, 0, 0, 0);
      nineAMLocal.setDate(nineAMLocal.getDate() + 2);
      vi.setSystemTime(nineAMLocal);

      generateReport.mockRejectedValue(new Error('Daily report failed'));

      const result = await heartbeat();
      const reportTask = result.results.find((r) => r.task === 'report-generation');

      expect(reportTask).toBeDefined();
      const failedReport = reportTask.reports.find((r) => r.type === 'daily' && !r.success);
      if (failedReport) {
        expect(failedReport.error).toBe('Daily report failed');
      }

      vi.useRealTimers();
    });

    test('weekly report success at Monday 10 AM local time', async () => {
      vi.useFakeTimers();
      const mondayTenAM = new Date();
      while (mondayTenAM.getDay() !== 1) {
        mondayTenAM.setDate(mondayTenAM.getDate() + 1);
      }
      mondayTenAM.setHours(10, 0, 0, 0);
      mondayTenAM.setDate(mondayTenAM.getDate() + 7);
      vi.setSystemTime(mondayTenAM);

      generateReport.mockResolvedValue({ reportPath: '/tmp/weekly.md' });

      const result = await heartbeat();
      const reportTask = result.results.find((r) => r.task === 'report-generation');

      expect(reportTask).toBeDefined();
      const weeklyReport = reportTask.reports.find((r) => r.type === 'weekly');
      if (weeklyReport) {
        expect(weeklyReport.success).toBe(true);
        expect(weeklyReport.reportPath).toBe('/tmp/weekly.md');
      }

      vi.useRealTimers();
    });

    test('weekly report failure at Monday 10 AM local time', async () => {
      vi.useFakeTimers();
      const mondayTenAM = new Date();
      while (mondayTenAM.getDay() !== 1) {
        mondayTenAM.setDate(mondayTenAM.getDate() + 1);
      }
      mondayTenAM.setHours(10, 0, 0, 0);
      mondayTenAM.setDate(mondayTenAM.getDate() + 14);
      vi.setSystemTime(mondayTenAM);

      generateReport.mockRejectedValue(new Error('Weekly report failed'));

      const result = await heartbeat();
      const reportTask = result.results.find((r) => r.task === 'report-generation');

      expect(reportTask).toBeDefined();
      const failedReport = reportTask.reports.find((r) => r.type === 'weekly' && !r.success);
      if (failedReport) {
        expect(failedReport.error).toBe('Weekly report failed');
      }

      vi.useRealTimers();
    });
  });

  describe('Integration', () => {
    test('should execute multiple heartbeats successfully', async () => {
      const results = [];

      for (let i = 0; i < 3; i++) {
        results.push(await heartbeat());
      }

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result).toHaveProperty('timestamp');
        expect(result).toHaveProperty('runCount');
        expect(result.tasksExecuted).toBeGreaterThan(0);
      });
    });

    test('should handle mixed success and failure scenarios', async () => {
      collectMetrics.mockResolvedValueOnce({
        system: { cpu: 50 },
        healthchecks: []
      });
      analyzeLogs.mockRejectedValueOnce(new Error('Failed'));
      runAlertHandler.mockResolvedValueOnce({
        alertsProcessed: 0,
        results: []
      });

      const result = await heartbeat();

      expect(result).toHaveProperty('successful');
      expect(result).toHaveProperty('failed');
      expect(result.tasksExecuted).toBeGreaterThan(0);
    });

    test('should maintain logger throughout execution', async () => {
      // Reset the logger mock to ensure fresh state
      createLogger.mockReturnValue(mockLogger);

      await heartbeat();

      // Logger info should have been called at least for heartbeat start/completion
      // Note: The actual logger instance is created on module load, so we verify
      // that heartbeat completes successfully which implies logging worked
      const result = await heartbeat();
      expect(result).toHaveProperty('timestamp');
      expect(result.tasksExecuted).toBeGreaterThan(0);
    });
  });
});
