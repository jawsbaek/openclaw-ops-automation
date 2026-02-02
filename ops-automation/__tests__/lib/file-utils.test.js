/**
 * @fileoverview Tests for file utilities
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mockExistsSync = vi.fn();
const mockMkdirSync = vi.fn();
const mockReaddirSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockWriteFileSync = vi.fn();

vi.mock('node:fs', () => ({
  existsSync: (...args) => mockExistsSync(...args),
  mkdirSync: (...args) => mockMkdirSync(...args),
  readdirSync: (...args) => mockReaddirSync(...args),
  readFileSync: (...args) => mockReadFileSync(...args),
  writeFileSync: (...args) => mockWriteFileSync(...args)
}));

const { ensureDir, saveAnalysis, saveIncident, saveMetrics, saveReport, getLatestMetrics, getRecentMetrics } =
  await import('../../lib/file-utils.js');

describe('File Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('ensureDir', () => {
    test('should create directory when it does not exist', () => {
      mockExistsSync.mockReturnValue(false);

      ensureDir('/test/path');

      expect(mockMkdirSync).toHaveBeenCalledWith('/test/path', { recursive: true });
    });

    test('should not create directory when it exists', () => {
      mockExistsSync.mockReturnValue(true);

      ensureDir('/test/path');

      expect(mockMkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('saveMetrics', () => {
    test('should create a metrics file', () => {
      mockExistsSync.mockReturnValue(true);

      const metrics = {
        timestamp: new Date().toISOString(),
        system: {
          cpu: 45.2,
          memory: { total: 16000, used: 8000, percentage: 50 },
          disk: []
        }
      };

      const filepath = saveMetrics(metrics);

      expect(filepath).toBeDefined();
      expect(typeof filepath).toBe('string');
      expect(filepath).toContain('metrics');
      expect(filepath).toContain('.json');
      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    test('should ensure metrics directory exists', () => {
      mockExistsSync.mockReturnValue(false);

      saveMetrics({ timestamp: new Date().toISOString() });

      expect(mockMkdirSync).toHaveBeenCalled();
    });
  });

  describe('saveAnalysis', () => {
    test('should create an analysis file', () => {
      const analysis = '# Test Analysis\n\nThis is a test.';
      const filepath = saveAnalysis(analysis);

      expect(filepath).toBeDefined();
      expect(filepath).toContain('analysis');
      expect(filepath).toContain('log-insights');
      expect(filepath).toContain('.md');
      expect(mockWriteFileSync).toHaveBeenCalledWith(expect.stringContaining('log-insights'), analysis, 'utf8');
    });
  });

  describe('saveIncident', () => {
    test('should create an incident file', () => {
      const incidentId = 'test-incident-123';
      const content = '# Incident Report\n\nTest incident.';
      const filepath = saveIncident(incidentId, content);

      expect(filepath).toBeDefined();
      expect(filepath).toContain('incidents');
      expect(filepath).toContain(incidentId);
      expect(filepath).toContain('.md');
      expect(mockWriteFileSync).toHaveBeenCalledWith(expect.stringContaining(incidentId), content, 'utf8');
    });
  });

  describe('saveReport', () => {
    test('should create a report file', () => {
      const content = '# Daily Report\n\nTest report.';
      const filepath = saveReport('daily', content);

      expect(filepath).toBeDefined();
      expect(filepath).toContain('reports');
      expect(filepath).toContain('ops-report');
      expect(filepath).toContain('daily');
      expect(filepath).toContain('.md');
    });

    test('should handle different report types', () => {
      saveReport('weekly', '# Weekly Report');
      expect(mockWriteFileSync).toHaveBeenCalledWith(expect.stringContaining('weekly'), '# Weekly Report', 'utf8');

      saveReport('monthly', '# Monthly Report');
      expect(mockWriteFileSync).toHaveBeenCalledWith(expect.stringContaining('monthly'), '# Monthly Report', 'utf8');
    });
  });

  describe('getLatestMetrics', () => {
    test('should return null when metrics directory does not exist', () => {
      mockExistsSync.mockReturnValue(false);

      const result = getLatestMetrics();

      expect(result).toBeNull();
    });

    test('should return null when no metrics files exist', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([]);

      const result = getLatestMetrics();

      expect(result).toBeNull();
    });

    test('should return null when only non-metrics files exist', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['readme.txt', 'other.json', 'metrics.txt']);

      const result = getLatestMetrics();

      expect(result).toBeNull();
    });

    test('should return the latest metrics file data', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([
        'metrics-2026-02-01T10-00-00.json',
        'metrics-2026-02-02T10-00-00.json',
        'metrics-2026-02-03T10-00-00.json'
      ]);
      const metricsData = { timestamp: '2026-02-03T10:00:00Z', cpu: 50 };
      mockReadFileSync.mockReturnValue(JSON.stringify(metricsData));

      const result = getLatestMetrics();

      expect(result).toEqual(metricsData);
      expect(mockReadFileSync).toHaveBeenCalledWith(
        expect.stringContaining('metrics-2026-02-03T10-00-00.json'),
        'utf8'
      );
    });
  });

  describe('getRecentMetrics', () => {
    test('should return empty array when metrics directory does not exist', () => {
      mockExistsSync.mockReturnValue(false);

      const result = getRecentMetrics(24);

      expect(result).toEqual([]);
    });

    test('should return empty array when no metrics files exist', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([]);

      const result = getRecentMetrics(24);

      expect(result).toEqual([]);
    });

    test('should return metrics within the time range', () => {
      mockExistsSync.mockReturnValue(true);
      const now = Date.now();
      const recentTimestamp = new Date(now - 1 * 60 * 60 * 1000).toISOString();
      const oldTimestamp = new Date(now - 48 * 60 * 60 * 1000).toISOString();

      mockReaddirSync.mockReturnValue(['metrics-2026-02-03T10-00-00.json', 'metrics-2026-02-01T10-00-00.json']);

      const recentMetrics = { timestamp: recentTimestamp, cpu: 50 };
      const oldMetrics = { timestamp: oldTimestamp, cpu: 60 };

      mockReadFileSync
        .mockReturnValueOnce(JSON.stringify(recentMetrics))
        .mockReturnValueOnce(JSON.stringify(oldMetrics));

      const result = getRecentMetrics(24);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(recentMetrics);
    });

    test('should use default 24 hours when no argument provided', () => {
      mockExistsSync.mockReturnValue(true);
      const now = Date.now();
      const recentTimestamp = new Date(now - 1 * 60 * 60 * 1000).toISOString();

      mockReaddirSync.mockReturnValue(['metrics-2026-02-03T10-00-00.json']);
      mockReadFileSync.mockReturnValue(JSON.stringify({ timestamp: recentTimestamp, cpu: 50 }));

      const result = getRecentMetrics();

      expect(result).toHaveLength(1);
    });

    test('should stop reading when file is older than cutoff', () => {
      mockExistsSync.mockReturnValue(true);
      const now = Date.now();
      const veryOldTimestamp = new Date(now - 100 * 60 * 60 * 1000).toISOString();

      mockReaddirSync.mockReturnValue(['metrics-2026-02-03T10-00-00.json', 'metrics-2026-02-02T10-00-00.json']);

      mockReadFileSync.mockReturnValue(JSON.stringify({ timestamp: veryOldTimestamp, cpu: 50 }));

      const result = getRecentMetrics(24);

      expect(result).toEqual([]);
      expect(mockReadFileSync).toHaveBeenCalledTimes(1);
    });

    test('should return all metrics when all are within range', () => {
      mockExistsSync.mockReturnValue(true);
      const now = Date.now();
      const timestamp1 = new Date(now - 1 * 60 * 60 * 1000).toISOString();
      const timestamp2 = new Date(now - 2 * 60 * 60 * 1000).toISOString();

      mockReaddirSync.mockReturnValue(['metrics-2026-02-03T12-00-00.json', 'metrics-2026-02-03T11-00-00.json']);

      mockReadFileSync
        .mockReturnValueOnce(JSON.stringify({ timestamp: timestamp1, cpu: 50 }))
        .mockReturnValueOnce(JSON.stringify({ timestamp: timestamp2, cpu: 60 }));

      const result = getRecentMetrics(24);

      expect(result).toHaveLength(2);
    });

    test('should filter only metrics files', () => {
      mockExistsSync.mockReturnValue(true);
      const now = Date.now();
      const recentTimestamp = new Date(now - 1 * 60 * 60 * 1000).toISOString();

      mockReaddirSync.mockReturnValue(['metrics-2026-02-03T10-00-00.json', 'readme.txt', 'other.json', 'metrics.txt']);

      mockReadFileSync.mockReturnValue(JSON.stringify({ timestamp: recentTimestamp, cpu: 50 }));

      getRecentMetrics(24);

      expect(mockReadFileSync).toHaveBeenCalledTimes(1);
    });
  });
});
