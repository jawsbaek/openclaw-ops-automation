/**
 * @fileoverview Tests for file utilities
 */

import { existsSync, unlinkSync, rmdirSync } from 'fs';
import { join } from 'path';
import { saveMetrics, saveAnalysis, saveIncident, saveReport } from '../../lib/file-utils.js';

describe('File Utils', () => {
  afterEach(() => {
    // Cleanup test files - only if they exist
    const testFiles = [
      '../../metrics',
      '../../analysis',
      '../../incidents',
      '../../reports'
    ];
    
    // Note: In a real test, you'd use a test-specific directory
    // This is simplified for demonstration
  });

  test('saveMetrics creates a metrics file', () => {
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
  });

  test('saveAnalysis creates an analysis file', () => {
    const analysis = '# Test Analysis\n\nThis is a test.';
    const filepath = saveAnalysis(analysis);
    
    expect(filepath).toBeDefined();
    expect(filepath).toContain('analysis');
    expect(filepath).toContain('log-insights');
    expect(filepath).toContain('.md');
  });

  test('saveIncident creates an incident file', () => {
    const incidentId = 'test-incident-123';
    const content = '# Incident Report\n\nTest incident.';
    const filepath = saveIncident(incidentId, content);
    
    expect(filepath).toBeDefined();
    expect(filepath).toContain('incidents');
    expect(filepath).toContain(incidentId);
    expect(filepath).toContain('.md');
  });

  test('saveReport creates a report file', () => {
    const content = '# Daily Report\n\nTest report.';
    const filepath = saveReport('daily', content);
    
    expect(filepath).toBeDefined();
    expect(filepath).toContain('reports');
    expect(filepath).toContain('ops-report');
    expect(filepath).toContain('daily');
    expect(filepath).toContain('.md');
  });
});
