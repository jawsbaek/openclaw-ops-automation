/**
 * @fileoverview Tests for Reporter Agent
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const baseDir = join(__dirname, '../../..');

// Test data directories
const testMetricsDir = join(baseDir, 'metrics');
const testIncidentsDir = join(baseDir, 'incidents');
const testAnalysisDir = join(baseDir, 'analysis');
const testReportsDir = join(baseDir, 'reports');

// Mock logger
vi.mock('../../lib/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }))
}));

// Import after mocking
const { generateReport, generateDailyReport, generateWeeklyReport } = await import('../../workers/reporter.js');

describe('Reporter Agent', () => {
  beforeAll(() => {
    // Create test directories
    [testMetricsDir, testIncidentsDir, testAnalysisDir, testReportsDir].forEach((dir) => {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    });
  });

  beforeEach(() => {
    // Clean test data
    [testMetricsDir, testIncidentsDir, testAnalysisDir, testReportsDir].forEach((dir) => {
      if (existsSync(dir)) {
        const files = readdirSync(dir);
        files.forEach((file) => {
          const filepath = join(dir, file);
          try {
            rmSync(filepath, { force: true });
          } catch (_error) {
            // Ignore errors
          }
        });
      }
    });
  });

  afterAll(() => {
    // Cleanup test directories
    [testMetricsDir, testIncidentsDir, testAnalysisDir, testReportsDir].forEach((dir) => {
      if (existsSync(dir)) {
        try {
          rmSync(dir, { recursive: true, force: true });
        } catch (_error) {
          // Ignore errors
        }
      }
    });
  });

  describe('generateDailyReport', () => {
    test('generates report with no data', async () => {
      const result = await generateDailyReport();

      expect(result).toBeDefined();
      expect(result.type).toBe('daily');
      expect(result.reportPath).toBeDefined();
      expect(result.metrics).toBeDefined();
      expect(result.trends).toBeDefined();
      expect(existsSync(result.reportPath)).toBe(true);
    });

    test('report contains required sections', async () => {
      const result = await generateDailyReport();
      const reportContent = readFileSync(result.reportPath, 'utf8');

      expect(reportContent).toContain('# Daily Operations Report');
      expect(reportContent).toContain('## Executive Summary');
      expect(reportContent).toContain('## System Health');
      expect(reportContent).toContain('### CPU Usage');
      expect(reportContent).toContain('### Memory Usage');
      expect(reportContent).toContain('### Disk Usage');
      expect(reportContent).toContain('## Recommendations');
    });

    test('processes metrics data correctly', async () => {
      // Create test metrics files
      const now = new Date();
      const timestamp1 = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
      const timestamp2 = new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString();

      const metrics1 = {
        timestamp: timestamp1,
        system: {
          cpu: 45.5,
          memory: { percentage: 60.2 },
          disk: [{ percentage: 50.0 }]
        }
      };

      const metrics2 = {
        timestamp: timestamp2,
        system: {
          cpu: 55.3,
          memory: { percentage: 70.8 },
          disk: [{ percentage: 55.5 }]
        }
      };

      writeFileSync(
        join(testMetricsDir, `metrics-${timestamp1.replace(/[:.]/g, '-').slice(0, -5)}.json`),
        JSON.stringify(metrics1)
      );
      writeFileSync(
        join(testMetricsDir, `metrics-${timestamp2.replace(/[:.]/g, '-').slice(0, -5)}.json`),
        JSON.stringify(metrics2)
      );

      const result = await generateDailyReport();
      const reportContent = readFileSync(result.reportPath, 'utf8');

      expect(result.metrics.dataPoints).toBe(2);
      expect(reportContent).toContain('**Metrics Collected:** 2 data points');
      expect(result.trends.cpu.min).toBeCloseTo(45.5, 1);
      expect(result.trends.cpu.max).toBeCloseTo(55.3, 1);
    });

    test('includes incidents in report', async () => {
      // Create test incident file
      const incidentContent = `# Incident Report: INC-001-HIGH-DISK

**Status:** Resolved
**Scenario:** high_disk_usage
**Started:** 2024-01-15T10:00:00Z

## Actions Taken
- Cleanup executed
`;

      writeFileSync(join(testIncidentsDir, '2024-01-15-INC-001.md'), incidentContent);

      const result = await generateDailyReport();
      const reportContent = readFileSync(result.reportPath, 'utf8');

      expect(result.metrics.incidents).toBe(1);
      expect(reportContent).toContain('## Incidents (1)');
      expect(reportContent).toContain('INC-001-HIGH-DISK');
      expect(reportContent).toContain('high_disk_usage');
      expect(reportContent).toContain('Resolved');
    });

    test('shows no incidents message when empty', async () => {
      const result = await generateDailyReport();
      const reportContent = readFileSync(result.reportPath, 'utf8');

      expect(reportContent).toContain('## Incidents');
      expect(reportContent).toContain('✅ No incidents in the last 24 hours');
    });

    test('includes log analysis summary', async () => {
      // Create test analysis files
      const analysis1 = `# Log Analysis Report

**Total Issues Found:** 5

## Issues by Severity
- Critical: 2
- Warning: 3
`;

      const analysis2 = `# Log Analysis Report

**Total Issues Found:** 3

## Issues by Severity
- Critical: 1
- Warning: 2
`;

      writeFileSync(join(testAnalysisDir, 'log-insights-2024-01-15T10-00-00.md'), analysis1);
      writeFileSync(join(testAnalysisDir, 'log-insights-2024-01-15T11-00-00.md'), analysis2);

      const result = await generateDailyReport();
      const reportContent = readFileSync(result.reportPath, 'utf8');

      expect(result.metrics.analyses).toBe(2);
      expect(reportContent).toContain('## Log Analysis Summary');
      expect(reportContent).toContain('**Total Issues Detected:** 8');
      expect(reportContent).toContain('**Critical Issues:** 3');
    });

    test('generates CPU warning when usage > 90%', async () => {
      const metrics = {
        timestamp: new Date().toISOString(),
        system: {
          cpu: 95.0,
          memory: { percentage: 50.0 },
          disk: [{ percentage: 40.0 }]
        }
      };

      writeFileSync(
        join(testMetricsDir, `metrics-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}.json`),
        JSON.stringify(metrics)
      );

      const result = await generateDailyReport();
      const reportContent = readFileSync(result.reportPath, 'utf8');

      expect(reportContent).toContain('⚠️ High');
      expect(reportContent).toContain('🔴 **CPU**: Peak usage exceeded 90%');
    });

    test('generates memory warning when usage > 90%', async () => {
      const metrics = {
        timestamp: new Date().toISOString(),
        system: {
          cpu: 50.0,
          memory: { percentage: 92.0 },
          disk: [{ percentage: 40.0 }]
        }
      };

      writeFileSync(
        join(testMetricsDir, `metrics-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}.json`),
        JSON.stringify(metrics)
      );

      const result = await generateDailyReport();
      const reportContent = readFileSync(result.reportPath, 'utf8');

      expect(reportContent).toContain('🔴 **Memory**: High memory usage detected');
    });

    test('generates disk warning when usage > 85%', async () => {
      const metrics = {
        timestamp: new Date().toISOString(),
        system: {
          cpu: 50.0,
          memory: { percentage: 50.0 },
          disk: [{ percentage: 88.0 }]
        }
      };

      writeFileSync(
        join(testMetricsDir, `metrics-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}.json`),
        JSON.stringify(metrics)
      );

      const result = await generateDailyReport();
      const reportContent = readFileSync(result.reportPath, 'utf8');

      expect(reportContent).toContain('🟡 **Disk**: Disk usage approaching threshold');
    });

    test('generates incident count warning when > 5', async () => {
      // Create 6 incident files
      for (let i = 1; i <= 6; i++) {
        const content = `# Incident Report: INC-${i}

**Status:** Resolved
**Scenario:** test_scenario
`;
        writeFileSync(join(testIncidentsDir, `2024-01-15-INC-${i}.md`), content);
      }

      const result = await generateDailyReport();
      const reportContent = readFileSync(result.reportPath, 'utf8');

      expect(reportContent).toContain('⚠️ **Incidents**: High incident count (6)');
    });

    test('shows all systems nominal when healthy', async () => {
      const metrics = {
        timestamp: new Date().toISOString(),
        system: {
          cpu: 30.0,
          memory: { percentage: 40.0 },
          disk: [{ percentage: 35.0 }]
        }
      };

      writeFileSync(
        join(testMetricsDir, `metrics-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}.json`),
        JSON.stringify(metrics)
      );

      const result = await generateDailyReport();
      const reportContent = readFileSync(result.reportPath, 'utf8');

      expect(reportContent).toContain('✅ **All Systems Nominal**: No action required');
    });
  });

  describe('generateWeeklyReport', () => {
    test('generates weekly report with no data', async () => {
      const result = await generateWeeklyReport();

      expect(result).toBeDefined();
      expect(result.type).toBe('weekly');
      expect(result.reportPath).toBeDefined();
      expect(result.metrics).toBeDefined();
      expect(result.trends).toBeDefined();
      expect(existsSync(result.reportPath)).toBe(true);
    });

    test('report contains required sections', async () => {
      const result = await generateWeeklyReport();
      const reportContent = readFileSync(result.reportPath, 'utf8');

      expect(reportContent).toContain('# Weekly Operations Report');
      expect(reportContent).toContain('**Period:** Last 7 days');
      expect(reportContent).toContain('## Summary');
      expect(reportContent).toContain('## Performance Trends');
      expect(reportContent).toContain('### CPU');
      expect(reportContent).toContain('### Memory');
      expect(reportContent).toContain('### Disk');
      expect(reportContent).toContain('## Top Incidents');
    });

    test('processes 7-day metrics data', async () => {
      // Create multiple metrics files spanning several days
      for (let i = 0; i < 5; i++) {
        const timestamp = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString();
        const metrics = {
          timestamp,
          system: {
            cpu: 40 + i * 5,
            memory: { percentage: 50 + i * 3 },
            disk: [{ percentage: 45 + i * 2 }]
          }
        };

        writeFileSync(
          join(testMetricsDir, `metrics-${timestamp.replace(/[:.]/g, '-').slice(0, -5)}.json`),
          JSON.stringify(metrics)
        );
      }

      const result = await generateWeeklyReport();

      expect(result.metrics.dataPoints).toBe(5);
      expect(result.trends.cpu.min).toBeGreaterThan(0);
      expect(result.trends.cpu.max).toBeGreaterThan(0);
    });

    test('counts resolved vs total incidents', async () => {
      // Create incidents with different statuses
      const incident1 = `# Incident Report: INC-001

**Status:** Resolved
**Scenario:** test1
`;

      const incident2 = `# Incident Report: INC-002

**Status:** In Progress
**Scenario:** test2
`;

      const incident3 = `# Incident Report: INC-003

**Status:** Resolved
**Scenario:** test3
`;

      writeFileSync(join(testIncidentsDir, '2024-01-15-INC-001.md'), incident1);
      writeFileSync(join(testIncidentsDir, '2024-01-15-INC-002.md'), incident2);
      writeFileSync(join(testIncidentsDir, '2024-01-15-INC-003.md'), incident3);

      const result = await generateWeeklyReport();
      const reportContent = readFileSync(result.reportPath, 'utf8');

      expect(result.metrics.incidents).toBe(3);
      expect(reportContent).toContain('**Total Incidents:** 3');
      expect(reportContent).toContain('**Resolved Incidents:** 2');
    });

    test('shows top 10 incidents only', async () => {
      // Create 15 incident files
      for (let i = 1; i <= 15; i++) {
        const content = `# Incident Report: INC-${i}

**Status:** Resolved
**Scenario:** scenario_${i}
`;
        writeFileSync(join(testIncidentsDir, `2024-01-15-INC-${String(i).padStart(3, '0')}.md`), content);
      }

      const result = await generateWeeklyReport();
      const reportContent = readFileSync(result.reportPath, 'utf8');

      // Should only show top 10
      expect((reportContent.match(/scenario_/g) || []).length).toBeLessThanOrEqual(10);
    });

    test('displays min/max/avg statistics', async () => {
      const metrics = {
        timestamp: new Date().toISOString(),
        system: {
          cpu: 75.0,
          memory: { percentage: 65.0 },
          disk: [{ percentage: 55.0 }]
        }
      };

      writeFileSync(
        join(testMetricsDir, `metrics-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}.json`),
        JSON.stringify(metrics)
      );

      const result = await generateWeeklyReport();
      const reportContent = readFileSync(result.reportPath, 'utf8');

      expect(reportContent).toMatch(/Min: \d+\.\d+%/);
      expect(reportContent).toMatch(/Max: \d+\.\d+%/);
      expect(reportContent).toMatch(/Avg: \d+\.\d+%/);
    });
  });

  describe('generateReport', () => {
    test('generates daily report by default', async () => {
      const result = await generateReport();

      expect(result.type).toBe('daily');
    });

    test('generates daily report when specified', async () => {
      const result = await generateReport('daily');

      expect(result.type).toBe('daily');
    });

    test('generates weekly report when specified', async () => {
      const result = await generateReport('weekly');

      expect(result.type).toBe('weekly');
    });

    test('throws error for unknown report type', async () => {
      await expect(generateReport('monthly')).rejects.toThrow('Unknown report type: monthly');
    });
  });

  describe('edge cases', () => {
    test('handles missing incidents directory gracefully', async () => {
      if (existsSync(testIncidentsDir)) {
        rmSync(testIncidentsDir, { recursive: true, force: true });
      }

      const result = await generateDailyReport();

      expect(result.metrics.incidents).toBe(0);
    });

    test('handles missing analysis directory gracefully', async () => {
      if (existsSync(testAnalysisDir)) {
        rmSync(testAnalysisDir, { recursive: true, force: true });
      }

      const result = await generateDailyReport();

      expect(result.metrics.analyses).toBe(0);
    });

    test('handles malformed incident files', async () => {
      // Ensure directory exists
      if (!existsSync(testIncidentsDir)) {
        mkdirSync(testIncidentsDir, { recursive: true });
      }

      // Create incident file with missing fields
      const badContent = `# Some Title

Random content without expected fields
`;
      writeFileSync(join(testIncidentsDir, '2024-01-15-BAD.md'), badContent);

      const result = await generateDailyReport();

      // Should not crash, returns unknown values
      expect(result).toBeDefined();
      expect(result.metrics.incidents).toBe(1);
    });

    test('handles malformed analysis files', async () => {
      // Ensure directory exists
      if (!existsSync(testAnalysisDir)) {
        mkdirSync(testAnalysisDir, { recursive: true });
      }

      // Create analysis file with missing fields
      const badContent = `# Analysis

No structured data here
`;
      writeFileSync(join(testAnalysisDir, 'log-insights-bad.md'), badContent);

      const result = await generateDailyReport();
      const reportContent = readFileSync(result.reportPath, 'utf8');

      // Should handle gracefully with 0 values
      expect(reportContent).toContain('**Total Issues Detected:** 0');
    });

    test('handles empty metrics arrays for stats calculation', async () => {
      // Create metrics with missing system data
      const metrics = {
        timestamp: new Date().toISOString(),
        system: {}
      };

      writeFileSync(
        join(testMetricsDir, `metrics-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}.json`),
        JSON.stringify(metrics)
      );

      const result = await generateDailyReport();

      // Should return zero stats
      expect(result.trends.cpu.min).toBe(0);
      expect(result.trends.cpu.max).toBe(0);
      expect(result.trends.cpu.avg).toBe(0);
    });
  });
});
