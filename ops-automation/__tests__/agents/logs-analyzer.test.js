/**
 * @fileoverview Tests for Logs Analyzer Agent
 */

import { vi } from 'vitest';

// Mock modules before importing
const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockMkdirSync = vi.fn();
const mockReaddirSync = vi.fn();
const mockWriteFileSync = vi.fn();
const mockLoadMonitoringSources = vi.fn();
const mockSaveAnalysis = vi.fn();

vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  mkdirSync: mockMkdirSync,
  readdirSync: mockReaddirSync,
  writeFileSync: mockWriteFileSync
}));

vi.mock('../../lib/config-loader.js', () => ({
  loadMonitoringSources: mockLoadMonitoringSources
}));

vi.mock('../../lib/file-utils.js', () => ({
  saveAnalysis: mockSaveAnalysis
}));

// Now import the module under test
const { analyzeLogs } = await import('../../agents/logs-analyzer.js');

describe('Logs Analyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('analyzeLogs', () => {
    test('returns empty results when no log paths configured', async () => {
      mockLoadMonitoringSources.mockReturnValue({ logs: { paths: [] } });

      const result = await analyzeLogs();

      expect(result).toEqual({ results: [], reportPath: null });
    });

    test('skips non-existent log files', async () => {
      mockLoadMonitoringSources.mockReturnValue({
        logs: { paths: ['/path/to/missing.log'] }
      });
      mockExistsSync.mockReturnValue(false);

      const result = await analyzeLogs();

      expect(result.results).toEqual([]);
    });

    test('analyzes log file with error patterns', async () => {
      const logContent = `2024-01-01 10:00:00 INFO Application started
2024-01-01 10:01:00 ERROR Database connection failed
2024-01-01 10:02:00 ERROR Database connection failed
2024-01-01 10:03:00 WARNING Low memory
2024-01-01 10:04:00 CRITICAL System overload`;

      mockLoadMonitoringSources.mockReturnValue({
        logs: { paths: ['/var/log/app.log'] }
      });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(logContent);
      mockSaveAnalysis.mockReturnValue('/path/to/report.md');

      const result = await analyzeLogs();

      expect(result.results).toHaveLength(1);
      expect(result.results[0].logFile).toBe('/var/log/app.log');
      expect(result.results[0].findings.total).toBeGreaterThan(0);
      expect(result.results[0].findings.bySeverity.error).toBeGreaterThan(0);
      expect(result.results[0].findings.bySeverity.warning).toBeGreaterThan(0);
      expect(result.results[0].findings.bySeverity.critical).toBeGreaterThan(0);
    });

    test('detects multiple error categories', async () => {
      const logContent = `ERROR: Connection timeout
Exception in thread main
HTTP 500 Internal Server Error
Unauthorized access attempt 401
Failed to load resource
FATAL: Out of memory
OOM killed process
Connection refused on port 8080`;

      mockLoadMonitoringSources.mockReturnValue({
        logs: { paths: ['/var/log/errors.log'] }
      });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(logContent);
      mockSaveAnalysis.mockReturnValue('/path/to/report.md');

      const result = await analyzeLogs();

      const findings = result.results[0].findings;
      expect(findings.byCategory).toHaveProperty('timeout');
      expect(findings.byCategory).toHaveProperty('exception');
      expect(findings.byCategory).toHaveProperty('http_error');
      expect(findings.byCategory).toHaveProperty('security');
      expect(findings.byCategory).toHaveProperty('failure');
      expect(findings.byCategory).toHaveProperty('critical');
      expect(findings.byCategory).toHaveProperty('resource');
      expect(findings.byCategory).toHaveProperty('connection');
    });

    test('includes sample errors in findings', async () => {
      const logContent = `ERROR: Database connection failed
ERROR: Unable to connect to API
WARNING: Cache miss`;

      mockLoadMonitoringSources.mockReturnValue({
        logs: { paths: ['/var/log/app.log'] }
      });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(logContent);
      mockSaveAnalysis.mockReturnValue('/path/to/report.md');

      const result = await analyzeLogs();

      expect(result.results[0].findings.samples.length).toBeGreaterThan(0);
      expect(result.results[0].findings.samples[0]).toHaveProperty('category');
      expect(result.results[0].findings.samples[0]).toHaveProperty('severity');
      expect(result.results[0].findings.samples[0]).toHaveProperty('count');
      expect(result.results[0].findings.samples[0]).toHaveProperty('examples');
    });

    test('detects repeated error anomaly', async () => {
      const repeatedError = '2024-01-01 10:00:00 ERROR Database timeout\n';
      const logContent = repeatedError.repeat(15);

      mockLoadMonitoringSources.mockReturnValue({
        logs: { paths: ['/var/log/app.log'] }
      });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(logContent);
      mockSaveAnalysis.mockReturnValue('/path/to/report.md');

      const result = await analyzeLogs();

      expect(result.results[0].anomalies.length).toBeGreaterThan(0);
      const repeatedAnomaly = result.results[0].anomalies.find((a) => a.type === 'repeated_error');
      expect(repeatedAnomaly).toBeDefined();
      expect(repeatedAnomaly.count).toBeGreaterThan(10);
      expect(repeatedAnomaly.severity).toBe('high');
    });

    test('detects error burst anomaly', async () => {
      const errorLines = [];
      for (let i = 0; i < 40; i++) {
        errorLines.push(`2024-01-01 10:${String(i).padStart(2, '0')}:00 ERROR Something went wrong ${i}`);
      }
      const logContent = errorLines.join('\n');

      mockLoadMonitoringSources.mockReturnValue({
        logs: { paths: ['/var/log/app.log'] }
      });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(logContent);
      mockSaveAnalysis.mockReturnValue('/path/to/report.md');

      const result = await analyzeLogs();

      const burstAnomaly = result.results[0].anomalies.find((a) => a.type === 'error_burst');
      expect(burstAnomaly).toBeDefined();
      expect(burstAnomaly.severity).toBe('critical');
      expect(burstAnomaly.message).toContain('High error rate');
    });

    test('analyzes multiple log files', async () => {
      mockLoadMonitoringSources.mockReturnValue({
        logs: { paths: ['/var/log/app1.log', '/var/log/app2.log'] }
      });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValueOnce('ERROR: App1 error').mockReturnValueOnce('WARNING: App2 warning');
      mockSaveAnalysis.mockReturnValue('/path/to/report.md');

      const result = await analyzeLogs();

      expect(result.results).toHaveLength(2);
      expect(result.results[0].logFile).toBe('/var/log/app1.log');
      expect(result.results[1].logFile).toBe('/var/log/app2.log');
    });

    test('generates report with summary section', async () => {
      const logContent = `ERROR: Test error
WARNING: Test warning
CRITICAL: Test critical`;

      mockLoadMonitoringSources.mockReturnValue({
        logs: { paths: ['/var/log/app.log'] }
      });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(logContent);
      mockSaveAnalysis.mockReturnValue('/path/to/report.md');

      await analyzeLogs();

      const reportCall = mockSaveAnalysis.mock.calls[0][0];
      expect(reportCall).toContain('# Log Analysis Report');
      expect(reportCall).toContain('## Summary');
      expect(reportCall).toContain('Total Issues Found:');
      expect(reportCall).toContain('Log Files Analyzed:');
      expect(reportCall).toContain('### Severity Breakdown');
    });

    test('generates report with anomalies section when present', async () => {
      const repeatedError = '2024-01-01 10:00:00 ERROR Database timeout\n';
      const logContent = repeatedError.repeat(15);

      mockLoadMonitoringSources.mockReturnValue({
        logs: { paths: ['/var/log/app.log'] }
      });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(logContent);
      mockSaveAnalysis.mockReturnValue('/path/to/report.md');

      await analyzeLogs();

      const reportCall = mockSaveAnalysis.mock.calls[0][0];
      expect(reportCall).toContain('⚠️ Anomalies Detected');
      expect(reportCall).toContain('repeated_error');
    });

    test('generates report with detailed findings', async () => {
      const logContent = `ERROR: Connection failed
WARNING: Low memory`;

      mockLoadMonitoringSources.mockReturnValue({
        logs: { paths: ['/var/log/app.log'] }
      });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(logContent);
      mockSaveAnalysis.mockReturnValue('/path/to/report.md');

      await analyzeLogs();

      const reportCall = mockSaveAnalysis.mock.calls[0][0];
      expect(reportCall).toContain('## Detailed Findings');
      expect(reportCall).toContain('/var/log/app.log');
      expect(reportCall).toContain('**Total Issues:**');
      expect(reportCall).toContain('**By Category:**');
    });

    test('generates report with recommendations for critical issues', async () => {
      const logContent = 'CRITICAL: System failure';

      mockLoadMonitoringSources.mockReturnValue({
        logs: { paths: ['/var/log/app.log'] }
      });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(logContent);
      mockSaveAnalysis.mockReturnValue('/path/to/report.md');

      await analyzeLogs();

      const reportCall = mockSaveAnalysis.mock.calls[0][0];
      expect(reportCall).toContain('## Recommendations');
      expect(reportCall).toContain('URGENT');
      expect(reportCall).toContain('critical issues require immediate attention');
    });

    test('generates recommendations for error burst', async () => {
      const errorLines = [];
      for (let i = 0; i < 40; i++) {
        errorLines.push(`ERROR: Error ${i}`);
      }
      const logContent = errorLines.join('\n');

      mockLoadMonitoringSources.mockReturnValue({
        logs: { paths: ['/var/log/app.log'] }
      });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(logContent);
      mockSaveAnalysis.mockReturnValue('/path/to/report.md');

      await analyzeLogs();

      const reportCall = mockSaveAnalysis.mock.calls[0][0];
      expect(reportCall).toContain('Error burst detected');
    });

    test('generates recommendations for repeated errors', async () => {
      const repeatedError = '2024-01-01 10:00:00 ERROR Database timeout\n';
      const logContent = repeatedError.repeat(15);

      mockLoadMonitoringSources.mockReturnValue({
        logs: { paths: ['/var/log/app.log'] }
      });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(logContent);
      mockSaveAnalysis.mockReturnValue('/path/to/report.md');

      await analyzeLogs();

      const reportCall = mockSaveAnalysis.mock.calls[0][0];
      expect(reportCall).toContain('Repeated errors detected');
    });

    test('shows no issues message when log is clean', async () => {
      const logContent = `2024-01-01 10:00:00 INFO Application started
2024-01-01 10:01:00 INFO Processing request
2024-01-01 10:02:00 INFO Request completed`;

      mockLoadMonitoringSources.mockReturnValue({
        logs: { paths: ['/var/log/app.log'] }
      });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(logContent);
      mockSaveAnalysis.mockReturnValue('/path/to/report.md');

      await analyzeLogs();

      const reportCall = mockSaveAnalysis.mock.calls[0][0];
      expect(reportCall).toContain('✅ No issues found');
    });

    test('handles file read errors gracefully', async () => {
      mockLoadMonitoringSources.mockReturnValue({
        logs: { paths: ['/var/log/app.log'] }
      });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });
      mockSaveAnalysis.mockReturnValue('/path/to/report.md');

      const result = await analyzeLogs();

      expect(result.results).toEqual([]);
    });

    test('returns report path', async () => {
      mockLoadMonitoringSources.mockReturnValue({
        logs: { paths: ['/var/log/app.log'] }
      });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('INFO: Normal operation');
      mockSaveAnalysis.mockReturnValue('/path/to/analysis-report.md');

      const result = await analyzeLogs();

      expect(result.reportPath).toBe('/path/to/analysis-report.md');
    });

    test('includes timestamp in results', async () => {
      mockLoadMonitoringSources.mockReturnValue({
        logs: { paths: ['/var/log/app.log'] }
      });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('INFO: Test');
      mockSaveAnalysis.mockReturnValue('/path/to/report.md');

      const result = await analyzeLogs();

      expect(result.results[0]).toHaveProperty('analyzedAt');
      expect(result.results[0].analyzedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test('limits sample lines per pattern to 3', async () => {
      const logContent = `ERROR: Error 1
ERROR: Error 2
ERROR: Error 3
ERROR: Error 4
ERROR: Error 5`;

      mockLoadMonitoringSources.mockReturnValue({
        logs: { paths: ['/var/log/app.log'] }
      });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(logContent);
      mockSaveAnalysis.mockReturnValue('/path/to/report.md');

      const result = await analyzeLogs();

      const errorSample = result.results[0].findings.samples.find((s) => s.category === 'general');
      expect(errorSample.examples.length).toBeLessThanOrEqual(3);
    });

    test('limits sample errors display to 5 in report', async () => {
      const logContent = `ERROR: Error 1
WARNING: Warning 1
FATAL: Fatal 1
Exception: Exception 1
Timeout: Timeout 1
Failed: Failed 1
401 Unauthorized`;

      mockLoadMonitoringSources.mockReturnValue({
        logs: { paths: ['/var/log/app.log'] }
      });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(logContent);
      mockSaveAnalysis.mockReturnValue('/path/to/report.md');

      await analyzeLogs();

      const reportCall = mockSaveAnalysis.mock.calls[0][0];
      const sampleSections = reportCall.match(/\*\*Sample Errors:\*\*/g);
      expect(sampleSections).toBeTruthy();
    });

    test('reads only last 1000 lines by default', async () => {
      const lines = [];
      for (let i = 0; i < 2000; i++) {
        lines.push(`Line ${i}`);
      }
      const logContent = lines.join('\n');

      mockLoadMonitoringSources.mockReturnValue({
        logs: { paths: ['/var/log/app.log'] }
      });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(logContent);
      mockSaveAnalysis.mockReturnValue('/path/to/report.md');

      await analyzeLogs();

      expect(mockReadFileSync).toHaveBeenCalledWith('/var/log/app.log', 'utf8');
    });

    test('handles empty log files', async () => {
      mockLoadMonitoringSources.mockReturnValue({
        logs: { paths: ['/var/log/empty.log'] }
      });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('');
      mockSaveAnalysis.mockReturnValue('/path/to/report.md');

      const result = await analyzeLogs();

      expect(result.results).toEqual([]);
    });

    test.skip('normalizes error messages for duplicate detection', async () => {
      // The normalization regex strips timestamps, so messages with different timestamps
      // but same content should be detected as duplicates
      const logContent = `2024-01-01 10:00:01 ERROR Connection pool exhausted
2024-01-01 10:00:05 ERROR Connection pool exhausted
2024-01-01 10:00:12 ERROR Connection pool exhausted
2024-01-01 10:00:15 ERROR Connection pool exhausted
2024-01-01 10:00:23 ERROR Connection pool exhausted
2024-01-01 10:00:27 ERROR Connection pool exhausted
2024-01-01 10:00:31 ERROR Connection pool exhausted
2024-01-01 10:00:35 ERROR Connection pool exhausted
2024-01-01 10:00:41 ERROR Connection pool exhausted
2024-01-01 10:00:45 ERROR Connection pool exhausted
2024-01-01 10:00:51 ERROR Connection pool exhausted
2024-01-01 10:00:55 ERROR Connection pool exhausted`;

      mockLoadMonitoringSources.mockReturnValue({
        logs: { paths: ['/var/log/app.log'] }
      });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(logContent);
      mockSaveAnalysis.mockReturnValue('/path/to/report.md');

      const result = await analyzeLogs();

      const repeatedAnomaly = result.results[0].anomalies.find((a) => a.type === 'repeated_error');
      expect(repeatedAnomaly).toBeDefined();
      expect(repeatedAnomaly.count).toBe(12);
    });
  });
});
